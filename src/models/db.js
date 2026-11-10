'use strict';
/**
 * Conexión a la base de datos y migraciones.
 * REGLA DE SEGURIDAD: toda consulta usa sentencias preparadas con parámetros (?)
 * — nunca se concatena texto del usuario en el SQL. Esto impide la inyección SQL.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../../config');

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'editor' CHECK (rol IN ('admin','editor')),
  activo INTEGER NOT NULL DEFAULT 1,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER,
  ultimo_acceso TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS noticias (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  resumen TEXT NOT NULL,
  contenido TEXT NOT NULL,
  categoria TEXT NOT NULL,
  publicada INTEGER NOT NULL DEFAULT 1,
  fecha_publicacion TEXT NOT NULL,
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('circular','resolucion','decreto','acuerdo')),
  numero TEXT NOT NULL,
  anio INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  asunto TEXT NOT NULL,
  archivo TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instituciones (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  zona TEXT NOT NULL CHECK (zona IN ('Urbana','Rural'))
);

-- Datos personales cifrados (columnas *_enc). documento_hash = índice ciego HMAC.
CREATE TABLE IF NOT EXISTS pqrsd (
  id INTEGER PRIMARY KEY,
  radicado TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Radicada' CHECK (estado IN ('Radicada','En trámite','Respondida','Cerrada')),
  tipo_documento TEXT NOT NULL,
  documento_hash TEXT NOT NULL,
  documento_enc TEXT NOT NULL,
  nombre_enc TEXT NOT NULL,
  email_enc TEXT NOT NULL,
  telefono_enc TEXT,
  asunto_enc TEXT NOT NULL,
  mensaje_enc TEXT NOT NULL,
  respuesta_enc TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expira INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_noticias_fecha ON noticias(publicada, fecha_publicacion DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo, anio DESC);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones(expira);
`);

/** Escapa comodines de LIKE para que el texto del usuario se busque literalmente. */
function likePattern(text) {
  return '%' + String(text).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

module.exports = { db, likePattern };
