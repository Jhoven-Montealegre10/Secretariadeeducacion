'use strict';
const { db, likePattern } = require('./db');

const TIPOS = Object.freeze({
  circular: 'Circulares',
  resolucion: 'Resoluciones',
  decreto: 'Decretos',
  acuerdo: 'Acuerdos',
});

const COLS = 'id, tipo, numero, anio, fecha, asunto, nombre_original, tamano';

const Documento = {
  TIPOS,

  porTipo(tipo) {
    return db.prepare(`SELECT ${COLS} FROM documentos WHERE tipo = ? ORDER BY anio DESC, fecha DESC, id DESC`).all(tipo);
  },

  porId(id) {
    return db.prepare(`SELECT ${COLS}, archivo FROM documentos WHERE id = ?`).get(id);
  },

  buscar(q, limit = 10) {
    const p = likePattern(q);
    return db.prepare(`SELECT ${COLS} FROM documentos WHERE asunto LIKE ? ESCAPE '\\' OR numero LIKE ? ESCAPE '\\' ORDER BY anio DESC LIMIT ?`)
      .all(p, p, limit);
  },

  todos() {
    return db.prepare(`SELECT ${COLS} FROM documentos ORDER BY creado_en DESC, id DESC`).all();
  },

  crear(d, autorId) {
    const r = db.prepare(`INSERT INTO documentos (tipo, numero, anio, fecha, asunto, archivo, nombre_original, tamano, autor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.tipo, d.numero, d.anio, d.fecha, d.asunto, d.archivo, d.nombre_original, d.tamano, autorId ?? null);
    return Number(r.lastInsertRowid);
  },

  eliminar(id) {
    return db.prepare('DELETE FROM documentos WHERE id = ?').run(id).changes;
  },

  contar() {
    return db.prepare('SELECT COUNT(*) AS n FROM documentos').get().n;
  },
};

module.exports = Documento;
