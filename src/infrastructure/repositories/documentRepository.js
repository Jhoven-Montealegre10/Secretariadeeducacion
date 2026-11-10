'use strict';
const { db, toCamel, likePattern } = require('../database/connection');
const { paginate, where } = require('../database/query');

const SELECT = 'id, tipo, numero, anio, fecha, asunto, archivo, nombre_original, tamano, creado_en';

const documentRepository = {
  list({ tipo, anio, q, page = 1, pageSize = 100 }) {
    const { whereSql, params } = where([
      tipo && ['tipo = ?', tipo],
      anio && ['anio = ?', anio],
      q && ["asunto LIKE ? ESCAPE '\\' OR numero LIKE ? ESCAPE '\\'", likePattern(q), likePattern(q)],
    ]);
    return paginate({ from: 'documentos', select: SELECT, whereSql, params, order: 'ORDER BY anio DESC, fecha DESC, id DESC', page, pageSize });
  },

  findById(id) {
    return toCamel(db.prepare(`SELECT ${SELECT} FROM documentos WHERE id = ?`).get(id));
  },

  create(d, userId) {
    return Number(
      db
        .prepare(
          `INSERT INTO documentos (tipo, numero, anio, fecha, asunto, archivo, nombre_original, tamano, autor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(d.tipo, d.numero, d.anio, d.fecha, d.asunto, d.archivo, d.nombreOriginal, d.tamano, userId ?? null).lastInsertRowid,
    );
  },

  delete(id) {
    return db.prepare('DELETE FROM documentos WHERE id = ?').run(id).changes;
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM documentos').get().n;
  },
};

module.exports = documentRepository;
