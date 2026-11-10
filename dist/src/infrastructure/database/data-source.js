"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionOptions = connectionOptions;
exports.dataSourceOptions = dataSourceOptions;
/**
 * Configuración de TypeORM para PostgreSQL.
 *  - synchronize: false SIEMPRE: el esquema solo cambia con migraciones versionadas.
 *  - Pool de conexiones con límite (DB_POOL_MAX por instancia) y tiempos de espera.
 *  - statement_timeout, lock_timeout e idle_in_transaction_session_timeout evitan consultas
 *    o transacciones colgadas que agoten el pool.
 *  - TLS con validación de certificado cuando DB_SSL=verify-full.
 *  - Credenciales separadas: la app usa semibague_app; las migraciones, semibague_migrator.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
const entities_1 = require("./entities");
// DATE se entrega como texto AAAA-MM-DD (sin conversión a la zona horaria local del proceso).
pg_1.types.setTypeParser(1082, (v) => v);
// COUNT(*) y bigint pequeños como número (las cifras del portal no se acercan a 2^53).
pg_1.types.setTypeParser(20, (v) => Number(v));
// timestamptz/timestamp como 'AAAA-MM-DD HH:MM:SS' en UTC (la sesión usa timezone=UTC): mismo
// formato que entregaba la API v1 y que usa la cadena de auditoría. Los repositorios usan SQL
// explícito, no la hidratación de entidades, así que este formato es el contrato interno.
const timestampText = (v) => v.slice(0, 19);
pg_1.types.setTypeParser(1184, timestampText);
pg_1.types.setTypeParser(1114, timestampText);
function sslOptions(db) {
    if (db.ssl === 'disable')
        return false;
    return { rejectUnauthorized: db.ssl === 'verify-full', ...(db.sslCaFile ? { ca: node_fs_1.default.readFileSync(db.sslCaFile, 'utf8') } : {}) };
}
function sessionSettings(db, forMigrations) {
    return [
        '-c search_path=portal',
        `-c statement_timeout=${forMigrations ? 0 : db.statementTimeoutMs}`,
        `-c lock_timeout=${forMigrations ? 60000 : db.lockTimeoutMs}`,
        `-c idle_in_transaction_session_timeout=${db.idleInTransactionTimeoutMs}`,
        '-c timezone=UTC',
        ...(forMigrations ? ['-c role=semibague_owner'] : []),
    ].join(' ');
}
/** Opciones para un cliente pg independiente (canal LISTEN de la caché), con la cuenta de la app. */
function connectionOptions(config) {
    const db = config.db;
    return {
        host: db.host,
        port: db.port,
        database: db.database,
        user: db.user,
        password: db.password,
        ssl: sslOptions(db),
        connectionTimeoutMillis: db.connectionTimeoutMs,
        application_name: `semibague-cache-${config.instanceId}`,
        options: sessionSettings(db, false),
    };
}
function dataSourceOptions(config, { forMigrations = false } = {}) {
    const db = config.db;
    return {
        type: 'postgres',
        host: db.host,
        port: db.port,
        database: db.database,
        username: forMigrations ? db.migrationUser : db.user,
        password: forMigrations ? db.migrationPassword : db.password,
        schema: 'portal',
        ssl: sslOptions(db),
        entities: entities_1.ENTITIES,
        migrations: [node_path_1.default.join(__dirname, 'migrations', '*.js')],
        migrationsTableName: 'schema_migraciones',
        migrationsTransactionMode: 'each',
        synchronize: false,
        migrationsRun: false,
        logging: ['error', 'warn', 'migration'],
        maxQueryExecutionTime: db.slowQueryMs,
        applicationName: `semibague-${forMigrations ? 'migrador' : 'app'}-${config.instanceId}`,
        extra: {
            max: forMigrations ? 2 : db.poolMax,
            connectionTimeoutMillis: db.connectionTimeoutMs,
            idleTimeoutMillis: db.idleTimeoutMs,
            options: sessionSettings(db, forMigrations),
        },
    };
}
//# sourceMappingURL=data-source.js.map