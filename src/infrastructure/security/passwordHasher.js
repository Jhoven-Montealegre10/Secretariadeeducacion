'use strict';
/**
 * Hash de contraseñas con Argon2id (biblioteca `argon2`, sal aleatoria única por hash).
 * Parámetros según OWASP Password Storage Cheat Sheet: m=19 MiB, t=2, p=1 como mínimo;
 * se usa m=64 MiB, t=3, p=1.
 *
 * Compatibilidad: los hashes scrypt de la versión anterior se siguen verificando y se
 * reemplazan por Argon2id en el siguiente inicio de sesión correcto (needsRehash).
 */
const crypto = require('node:crypto');
const argon2 = require('argon2');

/** @type {{ type: 0 | 1 | 2, memoryCost: number, timeCost: number, parallelism: number }} */
const OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
const LEGACY_SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function hash(password) {
  return argon2.hash(String(password), OPTIONS);
}

function verifyLegacyScrypt(password, stored) {
  const [, salt, digest] = stored.split('$');
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, LEGACY_SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

async function verify(password, stored) {
  const value = String(stored || '');
  try {
    if (value.startsWith('$argon2')) return await argon2.verify(value, String(password));
    if (value.startsWith('scrypt$')) return verifyLegacyScrypt(password, value);
  } catch {
    return false;
  }
  return false;
}

function needsRehash(stored) {
  const value = String(stored || '');
  return !value.startsWith('$argon2id$') || argon2.needsRehash(value, OPTIONS);
}

// Hash ficticio para gastar el mismo tiempo cuando el usuario no existe (evita enumeración).
let dummyHash;
async function verifyDummy(password) {
  dummyHash ||= await hash(crypto.randomBytes(16).toString('hex'));
  await verify(password, dummyHash);
  return false;
}

module.exports = { hash, verify, needsRehash, verifyDummy };
