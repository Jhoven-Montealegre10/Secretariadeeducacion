'use strict';
/**
 * PQRSD: los datos personales se cifran ANTES de escribirse y se descifran solo en el
 * servidor. `documento_hash` es un índice ciego HMAC para la consulta ciudadana.
 */
const crypto = require('node:crypto');
const { db, toCamel } = require('../database/connection');
const { paginate, where } = require('../database/query');
const { encrypt, decrypt, blindIndex, safeEqual } = require('../security/crypto');

function newRadicado() {
  return `SEM-${new Date().getFullYear()}-${String(crypto.randomInt(0, 1e8)).padStart(8, '0')}`;
}

function decryptRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    radicado: row.radicado,
    tipo: row.tipo,
    estado: row.estado,
    tipoDocumento: row.tipo_documento,
    documento: decrypt(row.documento_enc),
    nombre: decrypt(row.nombre_enc),
    email: decrypt(row.email_enc),
    telefono: decrypt(row.telefono_enc),
    asunto: decrypt(row.asunto_enc),
    mensaje: decrypt(row.mensaje_enc),
    respuesta: decrypt(row.respuesta_enc),
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
  };
}

const pqrsdRepository = {
  create(d) {
    const ins =
      db.prepare(`INSERT INTO pqrsd (radicado, tipo, tipo_documento, documento_hash, documento_enc, nombre_enc, email_enc, telefono_enc, asunto_enc, mensaje_enc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let i = 0; i < 5; i++) {
      const radicado = newRadicado();
      try {
        ins.run(
          radicado,
          d.tipo,
          d.tipoDocumento,
          blindIndex(d.documento),
          encrypt(d.documento),
          encrypt(d.nombre),
          encrypt(d.email),
          encrypt(d.telefono),
          encrypt(d.asunto),
          encrypt(d.mensaje),
        );
        return radicado;
      } catch (err) {
        if (!/UNIQUE/.test(err.message)) throw err;
      }
    }
    throw new Error('No fue posible generar un radicado único');
  },

  /** Consulta ciudadana: exige radicado y documento; misma respuesta si cualquiera falla. */
  findByRadicadoAndDocument(radicado, documento) {
    const row = db.prepare('SELECT * FROM pqrsd WHERE radicado = ?').get(radicado);
    if (!row || !safeEqual(row.documento_hash, blindIndex(documento))) return null;
    return decryptRow(row);
  },

  list({ estado, page, pageSize }) {
    const { whereSql, params } = where([estado && ['estado = ?', estado]]);
    return paginate({ from: 'pqrsd', select: '*', whereSql, params, order: 'ORDER BY id DESC', page, pageSize, map: decryptRow });
  },

  findById(id) {
    return decryptRow(db.prepare('SELECT * FROM pqrsd WHERE id = ?').get(id));
  },

  respond(id, estado, respuesta) {
    return db.prepare(`UPDATE pqrsd SET estado = ?, respuesta_enc = ?, actualizado_en = datetime('now') WHERE id = ?`).run(estado, encrypt(respuesta), id)
      .changes;
  },

  countByStatus() {
    return db.prepare('SELECT estado, COUNT(*) AS n FROM pqrsd GROUP BY estado').all().map(toCamel);
  },
};

module.exports = pqrsdRepository;
