'use strict';
/**
 * Bitácora de auditoría a prueba de manipulación:
 *  - solo admite INSERT (los triggers bloquean UPDATE y DELETE);
 *  - cada registro guarda un HMAC encadenado con el anterior, así que borrar o alterar
 *    filas directamente en el archivo se detecta al verificar la cadena.
 * Se migran los registros de la tabla anterior.
 */
const { auditChainHash } = require('../../security/crypto');

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE auditoria_eventos (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER,
        usuario_email TEXT,
        accion TEXT NOT NULL,
        recurso TEXT,
        recurso_id TEXT,
        resultado TEXT NOT NULL CHECK (resultado IN ('exito','fallo','denegado')),
        detalle TEXT,
        ip_hash TEXT,
        creado_en TEXT NOT NULL,
        hash_anterior TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE INDEX idx_auditoria_fecha ON auditoria_eventos(creado_en);
      CREATE INDEX idx_auditoria_usuario ON auditoria_eventos(usuario_id);
    `);
    const old = db
      .prepare(
        `SELECT a.usuario_id, u.email, a.accion, a.detalle, a.creado_en FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id`,
      )
      .all();
    const ins =
      db.prepare(`INSERT INTO auditoria_eventos (usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, ip_hash, creado_en, hash_anterior, hash)
      VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?)`);
    let prev = 'genesis';
    for (const r of old) {
      const resultado = r.accion === 'login_fallido' ? 'fallo' : 'exito';
      const row = {
        usuarioId: r.usuario_id,
        usuarioEmail: r.email,
        accion: r.accion,
        recurso: null,
        recursoId: null,
        resultado,
        detalle: r.detalle,
        ipHash: null,
        creadoEn: r.creado_en,
      };
      const hash = auditChainHash(prev, row);
      ins.run(r.usuario_id, r.email, r.accion, resultado, r.detalle, r.creado_en, prev, hash);
      prev = hash;
    }
    db.exec(`
      DROP TABLE auditoria;
      CREATE TRIGGER auditoria_sin_update BEFORE UPDATE ON auditoria_eventos
        BEGIN SELECT RAISE(ABORT, 'La bitácora de auditoría no se puede modificar'); END;
      CREATE TRIGGER auditoria_sin_delete BEFORE DELETE ON auditoria_eventos
        BEGIN SELECT RAISE(ABORT, 'La bitácora de auditoría no se puede eliminar'); END;
    `);
  },
};
