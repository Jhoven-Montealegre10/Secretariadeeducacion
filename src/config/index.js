'use strict';
/**
 * Configuración central. Los secretos se leen solo de variables de entorno
 * (archivo .env del servidor o gestor de secretos), nunca del código ni del navegador.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile) && process.env.NODE_ENV !== 'test') process.loadEnvFile(envFile);

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const isTest = env === 'test';

function readKey(name) {
  const value = process.env[name];
  if (value) {
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== 32) throw new Error(`${name} debe ser una clave de 32 bytes en base64 (npm run generate-keys)`);
    return buf;
  }
  if (isProd) throw new Error(`Falta la variable de entorno ${name}. El servidor no arranca sin ella en producción.`);
  if (!isTest) console.warn(`[config] ${name} no definida: se usa una clave temporal SOLO para desarrollo.`);
  return crypto.randomBytes(32);
}

function readSecret(name) {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (isProd) throw new Error(`Falta ${name} (mínimo 32 caracteres).`);
  return crypto.randomBytes(32).toString('hex');
}

function list(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const number = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);
const storageDir = process.env.STORAGE_DIR || path.join(root, 'storage');
const appUrl = (process.env.APP_URL || `http://localhost:${number('PORT', 3000)}`).replace(/\/+$/, '');

if (isProd && !appUrl.startsWith('https://')) {
  throw new Error('APP_URL debe usar https:// en producción.');
}

module.exports = Object.freeze({
  env,
  isProd,
  isTest,
  root,
  port: number('PORT', 3000),
  // En producción solo escucha en la interfaz local: el acceso externo pasa por el proxy con TLS.
  host: process.env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0'),
  appUrl,
  trustProxy: number('TRUST_PROXY', 0),
  autoMigrate: process.env.AUTO_MIGRATE ? process.env.AUTO_MIGRATE === 'true' : !isProd,

  dbPath: process.env.DB_PATH || (isTest ? ':memory:' : path.join(storageDir, 'semibague.sqlite')),
  uploadsDir: process.env.UPLOADS_DIR || path.join(storageDir, 'uploads'),
  mediaDir: process.env.MEDIA_DIR || path.join(storageDir, 'media'),

  sessionSecret: readSecret('SESSION_SECRET'),
  dataKey: readKey('DATA_ENCRYPTION_KEY'),
  session: {
    idleMs: number('SESSION_IDLE_MINUTES', 30) * 60 * 1000,
    absoluteMs: number('SESSION_ABSOLUTE_HOURS', 8) * 60 * 60 * 1000,
    reauthMs: 5 * 60 * 1000,
    pendingMfaMs: 5 * 60 * 1000,
  },

  mfa: { issuer: process.env.MFA_ISSUER || 'SEM Ibagué' },

  mail: {
    from: process.env.MAIL_FROM || 'Portal SEM Ibagué <no-responder@example.invalid>',
    smtpUrl: process.env.SMTP_URL || '',
  },

  uploads: {
    maxDocumentBytes: 10 * 1024 * 1024,
    maxImageBytes: number('MAX_IMAGE_MB', 8) * 1024 * 1024,
    maxAudioBytes: number('MAX_AUDIO_MB', 20) * 1024 * 1024,
    maxFilesPerRequest: 10,
    maxRequestBytes: number('MAX_UPLOAD_REQUEST_MB', 25) * 1024 * 1024,
    malwareScanCommand: process.env.MALWARE_SCAN_COMMAND || '',
  },

  stats: {
    retentionDays: number('STATS_RETENTION_DAYS', 395),
    geoHeader: (process.env.STATS_GEO_HEADER || '').toLowerCase(),
  },

  api: {
    corsOrigins: list('CORS_ORIGINS'),
    docsTryItOut: process.env.API_DOCS_TRY_IT_OUT ? process.env.API_DOCS_TRY_IT_OUT === 'true' : !isProd,
  },
});
