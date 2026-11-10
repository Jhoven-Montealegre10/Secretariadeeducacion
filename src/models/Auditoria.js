'use strict';
const { db } = require('./db');

/** Registro de acciones administrativas (quién hizo qué y cuándo). Nunca guarda datos personales. */
const Auditoria = {
  registrar(usuarioId, accion, detalle = '') {
    db.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?, ?, ?)')
      .run(usuarioId ?? null, accion, String(detalle).slice(0, 300));
  },
  recientes(limit = 20) {
    return db.prepare(`SELECT a.accion, a.detalle, a.creado_en, u.email FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT ?`).all(limit);
  },
};

module.exports = Auditoria;
