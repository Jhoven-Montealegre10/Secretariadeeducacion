"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_CONFIG = void 0;
exports.loadConfig = loadConfig;
/**
 * Configuración tipada. Los secretos se leen SOLO de variables de entorno (archivo .env del
 * servidor o gestor de secretos), nunca del código ni del navegador. En producción, el arranque
 * falla si faltan secretos, si APP_URL no usa HTTPS o si la conexión remota a PostgreSQL no usa TLS verificado.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
function loadConfig(env = process.env) {
    const root = node_path_1.default.resolve(__dirname, '..', '..', __dirname.includes(`${node_path_1.default.sep}dist${node_path_1.default.sep}`) ? '..' : '');
    const envFile = node_path_1.default.join(root, '.env');
    if (env === process.env && env.NODE_ENV !== 'test' && node_fs_1.default.existsSync(envFile))
        process.loadEnvFile(envFile);
    const nodeEnv = env.NODE_ENV || 'development';
    const isProd = nodeEnv === 'production';
    const isTest = nodeEnv === 'test';
    const num = (name, fallback) => (env[name] ? Number(env[name]) : fallback);
    const list = (name) => (env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const errors = [];
    const secret = (name, minLength) => {
        const value = env[name];
        if (value && value.length >= minLength)
            return value;
        if (isProd)
            errors.push(`Falta ${name} (mínimo ${minLength} caracteres).`);
        return node_crypto_1.default.randomBytes(32).toString('hex');
    };
    const key = (name) => {
        const value = env[name];
        if (value) {
            const buf = Buffer.from(value, 'base64');
            if (buf.length === 32)
                return buf;
            errors.push(`${name} debe ser una clave de 32 bytes en base64 (npm run generate-keys).`);
        }
        else if (isProd) {
            errors.push(`Falta ${name}. El servidor no arranca sin ella en producción.`);
        }
        else if (!isTest) {
            console.warn(`[config] ${name} no definida: se usa una clave temporal SOLO para desarrollo.`);
        }
        return node_crypto_1.default.randomBytes(32);
    };
    const port = num('PORT', 3000);
    const appUrl = (env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, '');
    if (isProd && !appUrl.startsWith('https://'))
        errors.push('APP_URL debe usar https:// en producción.');
    const storageDir = env.STORAGE_DIR || node_path_1.default.join(root, 'storage');
    const dbHost = env.DB_HOST || 'localhost';
    const ssl = (env.DB_SSL || 'disable');
    if (!['disable', 'require', 'verify-full'].includes(ssl))
        errors.push('DB_SSL debe ser disable, require o verify-full.');
    if (isProd && !LOCAL_HOSTS.has(dbHost) && !dbHost.startsWith('/') && ssl !== 'verify-full') {
        errors.push('La conexión a PostgreSQL en otro servidor exige DB_SSL=verify-full (TLS con validación de certificado).');
    }
    if (isProd && !env.DB_PASSWORD && !dbHost.startsWith('/'))
        errors.push('Falta DB_PASSWORD.');
    const db = {
        host: dbHost,
        port: num('DB_PORT', 5432),
        database: env.DB_NAME || (isTest ? 'semibague_test' : 'semibague'),
        user: env.DB_USER || 'semibague_app',
        password: env.DB_PASSWORD || '',
        migrationUser: env.DB_MIGRATION_USER || env.DB_USER || 'semibague_migrator',
        migrationPassword: env.DB_MIGRATION_PASSWORD || env.DB_PASSWORD || '',
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
    const config = {
        env: nodeEnv,
        isProd,
        isTest,
        root,
        host: env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0'),
        port,
        appUrl,
        trustProxy: num('TRUST_PROXY', 0),
        autoMigrate: env.AUTO_MIGRATE ? env.AUTO_MIGRATE === 'true' : !isProd && !isTest,
        instanceId: env.INSTANCE_ID || node_crypto_1.default.randomBytes(4).toString('hex'),
        db,
        mediaDir: env.MEDIA_DIR || node_path_1.default.join(storageDir, 'media'),
        uploadsDir: env.UPLOADS_DIR || node_path_1.default.join(storageDir, 'uploads'),
        devMailDir: node_path_1.default.join(storageDir, 'correo-desarrollo'),
        sessionSecret: secret('SESSION_SECRET', 32),
        dataKey: key('DATA_ENCRYPTION_KEY'),
        session: {
            idleMs: num('SESSION_IDLE_MINUTES', 30) * 60_000,
            absoluteMs: num('SESSION_ABSOLUTE_HOURS', 8) * 3_600_000,
            reauthMs: 5 * 60_000,
            pendingMfaMs: 5 * 60_000,
        },
        mfa: { issuer: env.MFA_ISSUER || 'SEM Ibagué' },
        mail: { from: env.MAIL_FROM || 'Portal SEM Ibagué <no-responder@example.invalid>', smtpUrl: env.SMTP_URL || '' },
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
    };
    if (errors.length)
        throw new Error(`Configuración inválida:\n- ${errors.join('\n- ')}`);
    return config;
}
exports.APP_CONFIG = Symbol('APP_CONFIG');
//# sourceMappingURL=configuration.js.map