'use strict';
const { db, likePattern } = require('./db');

const Institucion = {
  listar(q = '') {
    if (!q) return db.prepare('SELECT id, nombre, zona FROM instituciones ORDER BY nombre').all();
    const p = likePattern(q);
    return db.prepare(`SELECT id, nombre, zona FROM instituciones WHERE nombre LIKE ? ESCAPE '\\' OR zona LIKE ? ESCAPE '\\' ORDER BY nombre`).all(p, p);
  },

  crear(nombre, zona) {
    return db.prepare('INSERT OR IGNORE INTO instituciones (nombre, zona) VALUES (?, ?)').run(nombre, zona).changes;
  },
};

module.exports = Institucion;
