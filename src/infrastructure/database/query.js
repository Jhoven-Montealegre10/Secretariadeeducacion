'use strict';
/** Utilidades de consulta compartidas por los repositorios (paginación y orden seguros). */
const { db, toCamel } = require('./connection');

/**
 * Convierte `sort` (p. ej. "-fechaPublicacion") en ORDER BY usando una lista blanca
 * de columnas: el texto del usuario nunca llega al SQL.
 */
function orderBy(sort, allowed, fallback, idColumn = 'id') {
  const desc = typeof sort === 'string' && sort.startsWith('-');
  const key = typeof sort === 'string' ? sort.replace(/^-/, '') : '';
  const column = allowed[key];
  if (!column) return `ORDER BY ${fallback}`;
  return `ORDER BY ${column} ${desc ? 'DESC' : 'ASC'}, ${idColumn} DESC`;
}

/** Ejecuta un listado paginado: whereSql usa solo marcadores (?) y params sus valores. */
function paginate({ from, select, whereSql = '', params = [], order, page = 1, pageSize = 20, map = toCamel }) {
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`).get(...params).n;
  const rows = db.prepare(`SELECT ${select} FROM ${from} ${whereSql} ${order} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  return { items: rows.map(map), total, page, pageSize };
}

/** Construye un WHERE a partir de condiciones [sql, valor]; omite las que no aplican. */
function where(conditions) {
  const active = conditions.filter(Boolean);
  if (!active.length) return { whereSql: '', params: [] };
  return {
    whereSql: 'WHERE ' + active.map(([sql]) => `(${sql})`).join(' AND '),
    params: active.flatMap(([, ...values]) => values),
  };
}

module.exports = { orderBy, paginate, where };
