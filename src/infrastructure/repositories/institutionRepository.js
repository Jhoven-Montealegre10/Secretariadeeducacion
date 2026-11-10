'use strict';
const { db, likePattern } = require('../database/connection');

const institutionRepository = {
  list(q = '') {
    if (!q)
      return db
        .prepare('SELECT id, nombre, zona FROM instituciones ORDER BY nombre')
        .all()
        .map((r) => ({ ...r }));
    const p = likePattern(q);
    return db
      .prepare(`SELECT id, nombre, zona FROM instituciones WHERE nombre LIKE ? ESCAPE '\\' OR zona LIKE ? ESCAPE '\\' ORDER BY nombre`)
      .all(p, p)
      .map((r) => ({ ...r }));
  },

  create(nombre, zona) {
    return db.prepare('INSERT OR IGNORE INTO instituciones (nombre, zona) VALUES (?, ?)').run(nombre, zona).changes;
  },
};

module.exports = institutionRepository;
