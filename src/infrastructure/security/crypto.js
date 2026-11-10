'use strict';
/**
 * Primitivas criptográficas (biblioteca `node:crypto`, no implementaciones propias):
 *  - encrypt/decrypt: AES-256-GCM para datos personales y secretos MFA.
 *  - keyedHash: HMAC-SHA256 con clave del servidor para tokens de alta entropía,
 *    índices ciegos, códigos de recuperación y la cadena de auditoría.
 * Cada propósito usa una clave derivada distinta (HKDF) de la clave maestra del entorno.
 */
const crypto = require('node:crypto');
const config = require('../../config');

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

const derive = (label) => Buffer.from(crypto.hkdfSync('sha256', config.dataKey, Buffer.alloc(0), label, 32));
const KEYS = {
  encryption: derive('sem-encryption'),
  blindIndex: derive('sem-blind-index'),
  token: derive('sem-token'),
  audit: derive('sem-audit-chain'),
  stats: derive('sem-stats'),
};

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEYS.encryption, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decrypt(payload) {
  if (!payload) return '';
  const [version, iv, tag, data] = String(payload).split(':');
  if (version !== VERSION) throw new Error('Formato de cifrado no soportado');
  const decipher = crypto.createDecipheriv(ALGO, KEYS.encryption, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(String(value)).digest('hex');
}

/** Índice ciego para buscar un dato cifrado (p. ej. número de documento). */
const blindIndex = (value) => hmac(KEYS.blindIndex, String(value).trim().toLowerCase());

/** Hash de tokens y códigos aleatorios de alta entropía (recuperación, códigos MFA). */
const tokenHash = (value) => hmac(KEYS.token, value);

/** Eslabón de la cadena de auditoría: HMAC(anterior + contenido canónico del registro). */
function auditChainHash(previous, row) {
  const canonical = JSON.stringify([
    row.usuarioId ?? null,
    row.usuarioEmail ?? null,
    row.accion,
    row.recurso ?? null,
    row.recursoId ?? null,
    row.resultado,
    row.detalle ?? null,
    row.ipHash ?? null,
    row.creadoEn,
  ]);
  return hmac(KEYS.audit, `${previous}|${canonical}`);
}

const statsHash = (salt, value) => hmac(KEYS.stats, `${salt}|${value}`);

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

module.exports = { encrypt, decrypt, blindIndex, tokenHash, auditChainHash, statsHash, safeEqual, randomToken };
