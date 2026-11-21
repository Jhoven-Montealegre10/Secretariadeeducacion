/**
 * Configuración tipada. Los secretos (claves, contraseñas, SMTP) los entrega un gestor de secretos como
 * archivos (ver src/config/secrets.ts y docs/SECRETOS.md); nunca están en el código ni en el navegador, y en
 * producción tampoco en variables de entorno ni en .env. En producción el arranque falla si faltan secretos,
 * si llegan por el entorno, si APP_URL no usa HTTPS o si la conexión remota a PostgreSQL no usa TLS verificado.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { keyCreatedAt, type KeyEntry, parseKeyring, parseSecretList, SecretError, SecretSource } from './secrets';

export type SslMode = 'disable' | 'require' | 'verify-full';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  /** Se evalúa en cada conexión nueva: si el gestor rota la contraseña, se usa la nueva sin reiniciar. */
  password: () => string;
  migrationUser: string;
  migrationPassword: () => string;
  ssl: SslMode;
  sslCaFile: string;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
  slowQueryMs: number;
}

export interface AppConfig {
  env: string;
  isProd: boolean;
  isTest: boolean;
  root: string;
  host: string;
  port: number;
  appUrl: string;
  trustProxy: number;
  /** Aplicar migraciones pendientes al arrancar (con la cuenta de migraciones). Desactivado en producción. */
  autoMigrate: boolean;
  instanceId: string;
  db: DatabaseConfig;
  mediaDir: string;
  uploadsDir: string;
  devMailDir: string;
  /** Llavero de sesión: el primero firma las cookies; todos las verifican (rotación sin cerrar sesiones). */
  sessionSecrets: string[];
  /** Llavero de datos: la primera clave activa cifra y firma; las demás descifran y verifican. */
  dataKeys: KeyEntry[];
  secrets: { maxAgeDays: number; origins: Record<string, string> };
  session: { idleMs: number; absoluteMs: number; reauthMs: number; pendingMfaMs: number };
  mfa: { issuer: string };
  mail: { from: string; smtpUrl: string };
  uploads: {
    maxDocumentBytes: number;
    maxImageBytes: number;
    maxAudioBytes: number;
    maxFilesPerRequest: number;
    maxRequestBytes: number;
    malwareScanCommand: string;
  };
  stats: { retentionDays: number; geoHeader: string; flushIntervalMs: number; flushBatchSize: number };
  cache: { ttlSeconds: number; maxEntries: number };
  api: { corsOrigins: string[]; docsTryItOut: boolean };
  /**
   * Límite de borde: se aplica a TODA petición antes de sesiones, base de datos y plantillas. Quien lo supera
   * queda bloqueado `blockMs`. Con REDIS_URL el conteo se comparte entre instancias; sin Redis, por instancia.
   */
  rateLimit: { windowMs: number; burst: number; blockMs: number; maxMemoryKeys: number; redisUrl: string };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const root = path.resolve(__dirname, '..', '..', __dirname.includes(`${path.sep}dist${path.sep}`) ? '..' : '');
  const envFile = path.join(root, '.env');
  if (env === process.env && env.NODE_ENV !== 'test' && fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const num = (name: string, fallback: number) => (env[name] ? Number(env[name]) : fallback);
  const list = (name: string) =>
    (env[name] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const errors: string[] = [];

  const source = new SecretSource({ env, isProd, warn: isTest ? () => undefined : undefined });
  const origins: Record<string, string> = {};
  /** Resuelve un secreto y registra su origen (sin el valor). Los errores de la fuente se acumulan. */
  const resolveSecret = (...names: string[]) => {
    for (const name of names) {
      try {
        const r = source.resolve(name);
        if (r) {
          origins[name] = r.origin;
          return { name, ...r };
        }
      } catch (err) {
        if (!(err instanceof SecretError)) throw err;
        errors.push(err.message);
        return null;
      }
    }
    return null;
  };

  const sessionSecrets = ((): string[] => {
    const r = resolveSecret('SESSION_SECRETS', 'SESSION_SECRET');
    if (r) {
      try {
        return parseSecretList(r.value, r.name, 32);
      } catch (err) {
        errors.push((err as Error).message);
      }
    } else if (isProd) errors.push('Falta SESSION_SECRETS (o SESSION_SECRET) como archivo de secreto.');
    return [crypto.randomBytes(32).toString('hex')];
  })();

  const dataKeys = ((): KeyEntry[] => {
    const r = resolveSecret('DATA_ENCRYPTION_KEYS', 'DATA_ENCRYPTION_KEY');
    if (r) {
      try {
        return parseKeyring(r.value, r.name);
      } catch (err) {
        errors.push(`${(err as Error).message} (npm run secrets -- generar)`);
      }
    } else if (isProd) {
      errors.push('Falta DATA_ENCRYPTION_KEYS (o DATA_ENCRYPTION_KEY). El servidor no arranca sin ella en producción.');
    } else if (!isTest) {
      console.warn('[config] DATA_ENCRYPTION_KEYS no definida: se usa una clave temporal SOLO para desarrollo.');
    }
    return [{ id: 'k0', key: crypto.randomBytes(32), retired: false }];
  })();

  /** Contraseña que se relee del archivo cuando cambia (rotación dinámica); en desarrollo puede venir del entorno. */
  const dynamicSecret = (...names: string[]): (() => string) | null => {
    const r = resolveSecret(...names);
    if (!r) return null;
    const { file, value, name } = r;
    return file ? () => source.reread(name, file) : () => value;
  };

  const port = num('PORT', 3000);
  let appUrl = env.APP_URL || `http://localhost:${port}`;
  while (appUrl.endsWith('/')) appUrl = appUrl.slice(0, -1); // sin expresión regular: tiempo lineal
  if (isProd && !appUrl.startsWith('https://')) errors.push('APP_URL debe usar https:// en producción.');

  const storageDir = env.STORAGE_DIR || path.join(root, 'storage');
  const dbHost = env.DB_HOST || 'localhost';
  const ssl = (env.DB_SSL || 'disable') as SslMode;
  if (!['disable', 'require', 'verify-full'].includes(ssl)) errors.push('DB_SSL debe ser disable, require o verify-full.');
  if (isProd && !LOCAL_HOSTS.has(dbHost) && !dbHost.startsWith('/') && ssl !== 'verify-full') {
    errors.push('La conexión a PostgreSQL en otro servidor exige DB_SSL=verify-full (TLS con validación de certificado).');
  }
  const dbPassword = dynamicSecret('DB_PASSWORD');
  if (isProd && !dbPassword && !dbHost.startsWith('/')) errors.push('Falta DB_PASSWORD como archivo de secreto.');
  const migrationPassword = dynamicSecret('DB_MIGRATION_PASSWORD') ?? dbPassword;
  const smtp = resolveSecret('SMTP_URL');
  // La URL de Redis puede llevar contraseña: es un secreto (archivo). Fuera del propio servidor exige TLS (rediss://).
  const redis = resolveSecret('REDIS_URL');
  if (redis && isProd) {
    try {
      const u = new URL(redis.value);
      const local = LOCAL_HOSTS.has(u.hostname.replace('[', '').replace(']', ''));
      if (u.protocol !== 'rediss:' && !(u.protocol === 'redis:' && local)) errors.push('REDIS_URL en otro servidor exige TLS (rediss://).');
    } catch {
      errors.push('REDIS_URL no es una URL válida (redis://… o rediss://…).');
    }
  }

  const db: DatabaseConfig = {
    host: dbHost,
    port: num('DB_PORT', 5432),
    database: env.DB_NAME || (isTest ? 'semibague_test' : 'semibague'),
    user: env.DB_USER || 'semibague_app',
    password: dbPassword ?? (() => ''),
    migrationUser: env.DB_MIGRATION_USER || env.DB_USER || 'semibague_migrator',
    migrationPassword: migrationPassword ?? (() => ''),
    ssl,
    sslCaFile: env.DB_SSL_CA_FILE || '',
    poolMax: num('DB_POOL_MAX', 10),
    connectionTimeoutMs: num('DB_CONNECTION_TIMEOUT_MS', 5000),
    idleTimeoutMs: num('DB_IDLE_TIMEOUT_MS', 30000),
    statementTimeoutMs: num('DB_STATEMENT_TIMEOUT_MS', 10000),
    lockTimeoutMs: num('DB_LOCK_TIMEOUT_MS', 5000),
    idleInTransactionTimeoutMs: num('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', 15000),
    slowQueryMs: num('DB_SLOW_QUERY_MS', 500),
  };

  const config: AppConfig = {
    env: nodeEnv,
    isProd,
    isTest,
    root,
    host: env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0'),
    port,
    appUrl,
    trustProxy: num('TRUST_PROXY', 0),
    autoMigrate: env.AUTO_MIGRATE ? env.AUTO_MIGRATE === 'true' : !isProd && !isTest,
    instanceId: env.INSTANCE_ID || crypto.randomBytes(4).toString('hex'),
    db,
    mediaDir: env.MEDIA_DIR || path.join(storageDir, 'media'),
    uploadsDir: env.UPLOADS_DIR || path.join(storageDir, 'uploads'),
    devMailDir: path.join(storageDir, 'correo-desarrollo'),
    sessionSecrets,
    dataKeys,
    secrets: { maxAgeDays: num('SECRETS_MAX_AGE_DAYS', 90), origins },
    session: {
      idleMs: num('SESSION_IDLE_MINUTES', 30) * 60_000,
      absoluteMs: num('SESSION_ABSOLUTE_HOURS', 8) * 3_600_000,
      reauthMs: 5 * 60_000,
      pendingMfaMs: 5 * 60_000,
    },
    mfa: { issuer: env.MFA_ISSUER || 'SEM Ibagué' },
    mail: { from: env.MAIL_FROM || 'Portal SEM Ibagué <no-responder@example.invalid>', smtpUrl: smtp?.value ?? '' },
    uploads: {
      maxDocumentBytes: 10 * 1024 * 1024,
      maxImageBytes: num('MAX_IMAGE_MB', 8) * 1024 * 1024,
      maxAudioBytes: num('MAX_AUDIO_MB', 20) * 1024 * 1024,
      maxFilesPerRequest: 10,
      maxRequestBytes: num('MAX_UPLOAD_REQUEST_MB', 25) * 1024 * 1024,
      malwareScanCommand: env.MALWARE_SCAN_COMMAND || '',
    },
    stats: {
      retentionDays: num('STATS_RETENTION_DAYS', 395),
      geoHeader: (env.STATS_GEO_HEADER || '').toLowerCase(),
      flushIntervalMs: num('STATS_FLUSH_INTERVAL_MS', isTest ? 0 : 2000),
      flushBatchSize: num('STATS_FLUSH_BATCH_SIZE', 200),
    },
    cache: { ttlSeconds: num('PUBLIC_CACHE_TTL_SECONDS', 60), maxEntries: num('PUBLIC_CACHE_MAX_ENTRIES', 500) },
    api: {
      corsOrigins: list('CORS_ORIGINS'),
      docsTryItOut: env.API_DOCS_TRY_IT_OUT ? env.API_DOCS_TRY_IT_OUT === 'true' : !isProd,
    },
    rateLimit: {
      windowMs: num('RATE_LIMIT_WINDOW_SECONDS', 10) * 1000,
      // En pruebas automáticas no se limita salvo que la prueba lo pida (TEST_EDGE_LIMIT).
      burst: isTest ? num('TEST_EDGE_LIMIT', 1_000_000) : num('RATE_LIMIT_BURST', 200),
      blockMs: num('RATE_LIMIT_BLOCK_SECONDS', 300) * 1000,
      maxMemoryKeys: num('RATE_LIMIT_MAX_KEYS', 100_000),
      redisUrl: redis?.value ?? '',
    },
  };

  if (errors.length) throw new Error(`Configuración inválida:\n- ${errors.join('\n- ')}`);
  const dataKeyConfigured = 'DATA_ENCRYPTION_KEYS' in origins || 'DATA_ENCRYPTION_KEY' in origins;
  if (!isTest && dataKeyConfigured) {
    for (const w of secretAgeWarnings(config)) console.warn(`[secretos] ${w}`);
  }
  return config;
}

/** Avisos de rotación: claves vigentes más antiguas que la política (SECRETS_MAX_AGE_DAYS). */
export function secretAgeWarnings(config: Pick<AppConfig, 'dataKeys' | 'secrets'>, now = Date.now()): string[] {
  const current = config.dataKeys.find((k) => !k.retired);
  const created = current ? keyCreatedAt(current.id) : null;
  if (!current) return [];
  if (!created) return [`La clave de datos vigente (${current.id}) no tiene fecha: rótela con "npm run secrets -- rotar-datos".`];
  const days = Math.floor((now - created.getTime()) / 86_400_000);
  return days > config.secrets.maxAgeDays
    ? [`La clave de datos vigente (${current.id}) tiene ${days} días; la política es rotarla cada ${config.secrets.maxAgeDays}.`]
    : [];
}

export const APP_CONFIG = Symbol('APP_CONFIG');
