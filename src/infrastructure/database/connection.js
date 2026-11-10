'use strict';
/**
 * Conexión única a SQLite.
 * REGLA: toda consulta usa sentencias preparadas con parámetros (?). Nunca se concatena
 * texto del usuario dentro del SQL; los nombres de columna para ordenar salen de listas blancas.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../../config');

if (config.dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true, mode: 0o750 });
}

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
if (config.dbPath !== ':memory:') {
  try {
    fs.chmodSync(config.dbPath, 0o600);
  } catch {
    /* sistema de archivos sin permisos POSIX */
  }
}

/**
 * Ejecuta fn dentro de una transacción y revierte si lanza un error.
 * Es reentrante: dentro de otra transacción usa SAVEPOINT, así los servicios pueden
 * componer operaciones (p. ej. guardar + auditar) de forma atómica.
 */
let depth = 0;
function transaction(fn) {
  const savepoint = `sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (err) {
    depth--;
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw err;
  }
}

/** Escapa comodines de LIKE para buscar el texto del usuario de forma literal. */
function likePattern(text) {
  return '%' + String(text).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

/** Convierte una fila snake_case de la BD en un objeto camelCase. */
function toCamel(row) {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

module.exports = { db, transaction, likePattern, toCamel };
