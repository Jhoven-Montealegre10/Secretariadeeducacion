'use strict';
/**
 * TOTP (RFC 6238) con la biblioteca `otpauth`. Acepta ±1 paso de 30 s por desfase de reloj
 * y devuelve el paso usado para impedir la reutilización del mismo código.
 */
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const config = require('../../config');

const PERIOD = 30;

function createSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function build(secretBase32, label = '') {
  return new OTPAuth.TOTP({ issuer: config.mfa.issuer, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secretBase32) });
}

/** Devuelve el número de paso de tiempo si el código es válido, o null. */
function verify(secretBase32, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const delta = build(secretBase32).validate({ token: String(code), timestamp: now, window: 1 });
  if (delta === null) return null;
  return Math.floor(now / 1000 / PERIOD) + delta;
}

async function enrollment(secretBase32, accountLabel) {
  const uri = build(secretBase32, accountLabel).toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
  return { uri, qrDataUrl };
}

/** Solo para pruebas automáticas. */
function generate(secretBase32, now = Date.now()) {
  return build(secretBase32).generate({ timestamp: now });
}

module.exports = { createSecret, verify, enrollment, generate, PERIOD };
