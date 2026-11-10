'use strict';
/** Bitácora de auditoría: solo inserción, con HMAC encadenado (ver migración 004). */
const { db, transaction, toCamel, likePattern } = require('../database/connection');
const { orderBy, paginate, where } = require('../database/query');
const { auditChainHash } = require('../security/crypto');

const SELECT = 'id, usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, creado_en';

const auditRepository = {
  append(event) {
    return transaction(() => {
      const last = db.prepare('SELECT hash FROM auditoria_eventos ORDER BY id DESC LIMIT 1').get();
      const previous = last ? last.hash : 'genesis';
      const row = { ...event, creadoEn: new Date().toISOString().replace('T', ' ').slice(0, 19) };
      const hash = auditChainHash(previous, row);
      db.prepare(
        `INSERT INTO auditoria_eventos (usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, ip_hash, creado_en, hash_anterior, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.usuarioId ?? null,
        row.usuarioEmail ?? null,
        row.accion,
        row.recurso ?? null,
        row.recursoId ?? null,
        row.resultado,
        row.detalle ?? null,
        row.ipHash ?? null,
        row.creadoEn,
        previous,
        hash,
      );
    });
  },

  list({ q, usuarioId, accion, resultado, desde, hasta, page, pageSize }) {
    const { whereSql, params } = where([
      q && ["detalle LIKE ? ESCAPE '\\' OR usuario_email LIKE ? ESCAPE '\\' OR recurso_id LIKE ? ESCAPE '\\'", likePattern(q), likePattern(q), likePattern(q)],
      usuarioId && ['usuario_id = ?', usuarioId],
      accion && ['accion = ?', accion],
      resultado && ['resultado = ?', resultado],
      desde && ['creado_en >= ?', `${desde} 00:00:00`],
      hasta && ['creado_en <= ?', `${hasta} 23:59:59`],
    ]);
    return paginate({ from: 'auditoria_eventos', select: SELECT, whereSql, params, order: orderBy('', {}, 'id DESC'), page, pageSize });
  },

  /** Recorre la cadena y devuelve el primer registro alterado, o null si está íntegra. */
  verifyChain() {
    let previous = 'genesis';
    for (const r of db.prepare('SELECT * FROM auditoria_eventos ORDER BY id').iterate()) {
      const row = toCamel(r);
      if (row.hashAnterior !== previous || auditChainHash(previous, row) !== row.hash) return { idAlterado: row.id };
      previous = row.hash;
    }
    return null;
  },
};

module.exports = auditRepository;
