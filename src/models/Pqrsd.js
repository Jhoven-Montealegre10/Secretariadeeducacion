'use strict';
/**
 * Modelo PQRSD. Los datos personales se cifran ANTES de llegar a la base de datos
 * y solo se descifran en el servidor para personal autorizado o para el propio
 * ciudadano que conoce radicado + número de documento.
 */
const crypto = require('node:crypto');
const { db } = require('./db');
const { encrypt, decrypt, blindIndex, safeEqual } = require('../services/crypto');

const TIPOS = ['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Denuncia', 'Solicitud de información'];
const TIPOS_DOCUMENTO = ['Cédula de ciudadanía', 'Tarjeta de identidad', 'Cédula de extranjería', 'Pasaporte', 'NIT', 'PPT'];
const ESTADOS = ['Radicada', 'En trámite', 'Respondida', 'Cerrada'];

function nuevoRadicado() {
  const year = new Date().getFullYear();
  // 8 dígitos aleatorios criptográficamente seguros: no predecibles ni secuenciales.
  return `SEM-${year}-${String(crypto.randomInt(0, 1e8)).padStart(8, '0')}`;
}

function descifrar(row) {
  if (!row) return null;
  return {
    id: row.id,
    radicado: row.radicado,
    tipo: row.tipo,
    estado: row.estado,
    tipo_documento: row.tipo_documento,
    documento: decrypt(row.documento_enc),
    nombre: decrypt(row.nombre_enc),
    email: decrypt(row.email_enc),
    telefono: decrypt(row.telefono_enc),
    asunto: decrypt(row.asunto_enc),
    mensaje: decrypt(row.mensaje_enc),
    respuesta: decrypt(row.respuesta_enc),
    creado_en: row.creado_en,
    actualizado_en: row.actualizado_en,
  };
}

const Pqrsd = {
  TIPOS,
  TIPOS_DOCUMENTO,
  ESTADOS,

  crear(d) {
    const insert = db.prepare(`INSERT INTO pqrsd (radicado, tipo, tipo_documento, documento_hash, documento_enc, nombre_enc,
      email_enc, telefono_enc, asunto_enc, mensaje_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let intento = 0; intento < 5; intento++) {
      const radicado = nuevoRadicado();
      try {
        insert.run(radicado, d.tipo, d.tipo_documento, blindIndex(d.documento), encrypt(d.documento), encrypt(d.nombre),
          encrypt(d.email), encrypt(d.telefono), encrypt(d.asunto), encrypt(d.mensaje));
        return radicado;
      } catch (err) {
        if (!/UNIQUE/.test(err.message)) throw err;
      }
    }
    throw new Error('No fue posible generar un radicado único');
  },

  /** Consulta ciudadana: exige radicado y documento; respuesta idéntica si cualquiera falla. */
  consultar(radicado, documento) {
    const row = db.prepare('SELECT * FROM pqrsd WHERE radicado = ?').get(radicado);
    const hash = blindIndex(documento);
    if (!row || !safeEqual(row.documento_hash, hash)) return null;
    const d = descifrar(row);
    return { radicado: d.radicado, tipo: d.tipo, estado: d.estado, asunto: d.asunto, respuesta: d.respuesta, creado_en: d.creado_en, actualizado_en: d.actualizado_en };
  },

  // --- Administración (requiere sesión autenticada) ---
  listar(estado = '') {
    const rows = estado && ESTADOS.includes(estado)
      ? db.prepare('SELECT * FROM pqrsd WHERE estado = ? ORDER BY id DESC LIMIT 500').all(estado)
      : db.prepare('SELECT * FROM pqrsd ORDER BY id DESC LIMIT 500').all();
    return rows.map((r) => {
      const d = descifrar(r);
      return { id: d.id, radicado: d.radicado, tipo: d.tipo, estado: d.estado, nombre: d.nombre, asunto: d.asunto, creado_en: d.creado_en };
    });
  },

  porId(id) {
    return descifrar(db.prepare('SELECT * FROM pqrsd WHERE id = ?').get(id));
  },

  responder(id, estado, respuesta) {
    return db.prepare(`UPDATE pqrsd SET estado = ?, respuesta_enc = ?, actualizado_en = datetime('now') WHERE id = ?`)
      .run(estado, encrypt(respuesta), id).changes;
  },

  contarPorEstado() {
    return db.prepare('SELECT estado, COUNT(*) AS n FROM pqrsd GROUP BY estado').all();
  },
};

module.exports = Pqrsd;
