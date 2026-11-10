'use strict';
/**
 * Configuración central. Todos los secretos se leen de variables de entorno
 * (archivo .env en el servidor, nunca versionado ni enviado al navegador).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && process.env.NODE_ENV !== 'test') {
  process.loadEnvFile(envFile);
}

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isTest = env === 'test';

function readKey(name) {
  const value = process.env[name];
  if (value) {
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== 32) {
      throw new Error(`${name} debe ser una clave de 32 bytes en base64 (use: npm run generate-keys)`);
    }
    return buf;
  }
  if (isProd) {
    throw new Error(`Falta la variable de entorno ${name}. El servidor no arranca sin ella en producción.`);
  }
  // Solo en desarrollo/pruebas: clave efímera (los datos cifrados no sobreviven reinicios).
  if (!isTest) console.warn(`[config] ${name} no definida: usando clave temporal SOLO para desarrollo.`);
  return require('node:crypto').randomBytes(32);
}

function readSecret(name) {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProd) throw new Error(`Falta ${name} (mínimo 32 caracteres).`);
  return require('node:crypto').randomBytes(32).toString('hex');
}

module.exports = Object.freeze({
  env,
  isProd,
  isTest,
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  // Número de proxies inversos (Nginx/Apache) delante de la app, para leer la IP real.
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  dbPath: process.env.DB_PATH || (isTest ? ':memory:' : path.join(ROOT, 'storage', 'semibague.sqlite')),
  uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT, 'storage', 'uploads'),
  maxUploadBytes: 10 * 1024 * 1024,
  sessionSecret: readSecret('SESSION_SECRET'),
  dataKey: readKey('DATA_ENCRYPTION_KEY'),
  sessionMaxAgeMs: 2 * 60 * 60 * 1000, // 2 horas
});
