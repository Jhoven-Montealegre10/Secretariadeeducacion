'use strict';
/**
 * Servicio criptográfico.
 *  - encrypt/decrypt: AES-256-GCM (confidencialidad + integridad) para datos personales.
 *  - blindIndex: HMAC-SHA256 para buscar por un dato cifrado sin descifrarlo.
 *  - hashPassword/verifyPassword: scrypt con sal aleatoria.
 */
const crypto = require('node:crypto');
const config = require('../../config');

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
// Claves derivadas por propósito (separación de claves) a partir de la clave maestra.
const encKey = Buffer.from(crypto.hkdfSync('sha256', config.dataKey, Buffer.alloc(0), 'sem-encryption', 32));
const macKey = Buffer.from(crypto.hkdfSync('sha256', config.dataKey, Buffer.alloc(0), 'sem-blind-index', 32));

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encKey, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

function decrypt(payload) {
  if (!payload) return '';
  const [version, iv, tag, data] = String(payload).split(':');
  if (version !== VERSION) throw new Error('Formato de cifrado no soportado');
  const decipher = crypto.createDecipheriv(ALGO, encKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

function blindIndex(value) {
  return crypto.createHmac('sha256', macKey).update(String(value).trim().toLowerCase()).digest('hex');
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

// Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { encrypt, decrypt, blindIndex, hashPassword, verifyPassword, DUMMY_HASH, safeEqual, randomToken };
