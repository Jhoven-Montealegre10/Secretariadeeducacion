"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestClock = exports.PASSWORD = void 0;
exports.provisionDatabase = provisionDatabase;
exports.dropDatabase = dropDatabase;
exports.createHarness = createHarness;
exports.pngBuffer = pngBuffer;
exports.jpegBuffer = jpegBuffer;
/**
 * Arnés de pruebas de integración contra PostgreSQL REAL (nunca SQLite ni datos reales):
 *  - cada archivo de prueba crea su propia base temporal `semibague_test_<aleatorio>` con el
 *    script de aprovisionamiento versionado (roles de mínimo privilegio), aplica las migraciones
 *    con la cuenta de migraciones y ejecuta la aplicación con la cuenta limitada semibague_app;
 *  - al terminar, la base se elimina (DROP DATABASE … WITH (FORCE)) y las carpetas temporales se borran.
 * Requiere TEST_PG_ADMIN_URL (superusuario de un servidor de PRUEBAS) y psql en el PATH.
 */
require("reflect-metadata");
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const testing_1 = require("@nestjs/testing");
const pg_1 = require("pg");
const supertest_1 = __importDefault(require("supertest"));
const typeorm_1 = require("typeorm");
const app_module_1 = require("../../src/app.module");
const clock_1 = require("../../src/application/clock");
const configuration_1 = require("../../src/config/configuration");
const data_source_1 = require("../../src/infrastructure/database/data-source");
const db_service_1 = require("../../src/infrastructure/database/db.service");
const mailer_service_1 = require("../../src/infrastructure/mail/mailer.service");
const identity_repositories_1 = require("../../src/infrastructure/repositories/identity.repositories");
const crypto_service_1 = require("../../src/infrastructure/security/crypto.service");
const password_hasher_service_1 = require("../../src/infrastructure/security/password-hasher.service");
const totp_service_1 = require("../../src/infrastructure/security/totp.service");
const app_setup_1 = require("../../src/presentation/http/app.setup");
exports.PASSWORD = 'cometa verde sobre el nevado del tolima';
// Contraseñas SOLO del servidor de pruebas (los roles son globales del servidor).
const APP_PASSWORD = process.env.TEST_DB_APP_PASSWORD ?? 'app-solo-pruebas-123';
const MIGRATOR_PASSWORD = process.env.TEST_DB_MIGRATOR_PASSWORD ?? 'migrador-solo-pruebas-123';
const ROOT = node_path_1.default.resolve(__dirname, '..', '..', '..');
/** Reloj controlable: permite simular expiraciones sin esperar. */
class TestClock {
    offset = 0;
    now() {
        return Date.now() + this.offset;
    }
}
exports.TestClock = TestClock;
function adminUrl() {
    const url = process.env.TEST_PG_ADMIN_URL;
    if (!url)
        throw new Error('Defina TEST_PG_ADMIN_URL (superusuario de un PostgreSQL de PRUEBAS) para las pruebas de integración.');
    return url;
}
/** Crea una base temporal aislada con roles y migraciones. Devuelve su nombre. */
async function provisionDatabase() {
    const admin = adminUrl();
    const dbName = `semibague_test_${node_crypto_1.default.randomBytes(5).toString('hex')}`;
    const u = new URL(admin);
    // Los roles son globales del servidor: si ya existen se les asigna la contraseña de esta corrida.
    (0, node_child_process_1.execFileSync)('psql', [admin, '-q', '-v', `app_password=${APP_PASSWORD}`, '-v', `migrator_password=${MIGRATOR_PASSWORD}`, '-v', `db_name=${dbName}`, '-f', node_path_1.default.join(ROOT, 'scripts/postgres/01-crear-roles-y-base.sql')], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = new pg_1.Client({ connectionString: admin });
    await c.connect();
    await c.query(`ALTER ROLE semibague_app PASSWORD '${APP_PASSWORD}'`);
    await c.query(`ALTER ROLE semibague_migrator PASSWORD '${MIGRATOR_PASSWORD}'`);
    await c.end();
    const tmp = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'sem-test-'));
    const env = {
        NODE_ENV: 'test',
        DB_HOST: u.hostname,
        DB_PORT: u.port || '5432',
        DB_NAME: dbName,
        DB_USER: 'semibague_app',
        DB_PASSWORD: APP_PASSWORD,
        DB_MIGRATION_USER: 'semibague_migrator',
        DB_MIGRATION_PASSWORD: MIGRATOR_PASSWORD,
        DB_SSL: 'disable',
        STORAGE_DIR: tmp,
        MEDIA_DIR: node_path_1.default.join(tmp, 'media'),
        UPLOADS_DIR: node_path_1.default.join(tmp, 'uploads'),
        DATA_ENCRYPTION_KEY: node_crypto_1.default.randomBytes(32).toString('base64'),
        SESSION_SECRET: node_crypto_1.default.randomBytes(32).toString('hex'),
        PUBLIC_CACHE_TTL_SECONDS: '60',
        TEST_RATE_LIMIT: process.env.TEST_RATE_LIMIT ?? '10000',
    };
    const ds = new typeorm_1.DataSource((0, data_source_1.dataSourceOptions)((0, configuration_1.loadConfig)(env), { forMigrations: true }));
    await ds.initialize();
    await ds.runMigrations({ transaction: 'each' });
    await ds.destroy();
    return { dbName, env };
}
async function dropDatabase(dbName) {
    if (!/^semibague_test_[0-9a-f]+$/.test(dbName))
        throw new Error('Solo se eliminan bases de prueba');
    const c = new pg_1.Client({ connectionString: adminUrl() });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await c.end();
}
async function createHarness(extraEnv = {}) {
    const { dbName, env } = await provisionDatabase();
    const config = (0, configuration_1.loadConfig)({ ...env, ...extraEnv });
    const clock = new TestClock();
    let app;
    let store;
    async function start() {
        const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule.forRoot(config)] })
            .overrideProvider(clock_1.CLOCK)
            .useValue(clock)
            .compile();
        app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
        store = await (0, app_setup_1.configureApp)(app);
    }
    await start();
    const h = {
        get app() {
            return app;
        },
        config,
        get db() {
            return app.get(db_service_1.Db);
        },
        clock,
        get mailer() {
            return app.get(mailer_service_1.Mailer);
        },
        get totp() {
            return app.get(totp_service_1.TotpService);
        },
        dbName,
        adminUrl: adminUrl(),
        get: (type) => app.get(type),
        agent: () => supertest_1.default.agent(app.getHttpServer()),
        async createUser({ email, nombre = 'Usuario de Prueba', rol = 'editor', password = exports.PASSWORD, mfa = true }) {
            const role = await app.get(identity_repositories_1.RoleRepository).findBySlug(rol);
            if (!role)
                throw new Error(`Rol ${rol} inexistente`);
            const users = app.get(identity_repositories_1.UserRepository);
            const id = await users.create({ email, nombre, passwordHash: await app.get(password_hasher_service_1.PasswordHasher).hash(password), rolId: role.id });
            const secret = app.get(totp_service_1.TotpService).createSecret();
            if (mfa)
                await users.setMfa(id, { secretoEnc: app.get(crypto_service_1.CryptoService).encrypt(secret), activo: true });
            return { id, email, password, secret };
        },
        async csrf(agent) {
            const res = await agent.get('/api/v1/auth/csrf');
            return res.body.data.csrfToken;
        },
        async login(user) {
            const agent = h.agent();
            let token = await h.csrf(agent);
            const r1 = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: user.email, password: user.password });
            if (r1.status !== 200)
                throw new Error(`login ${r1.status}: ${JSON.stringify(r1.body)}`);
            token = r1.body.data.csrfToken;
            // Permite reutilizar el mismo intervalo de 30 s en pruebas (en producción el código no se reutiliza).
            await h.db.run('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = $1', [user.id]);
            const r2 = await agent.post('/api/v1/auth/mfa/verificar').set('X-CSRF-Token', token).send({ codigo: h.totp.generate(user.secret, clock.now()) });
            if (r2.status !== 200)
                throw new Error(`mfa ${r2.status}: ${JSON.stringify(r2.body)}`);
            agent.csrf = r2.body.data.csrfToken;
            return agent;
        },
        call(agent, method, url, body) {
            const req = agent[method](url).set('Accept', 'application/json');
            if (method !== 'get')
                req.set('X-CSRF-Token', agent.csrf ?? 'sin-token');
            return body === undefined ? req : req.send(body);
        },
        /** Reinicia la aplicación (mismo almacenamiento y base): prueba la persistencia tras un reinicio. */
        async restart() {
            store.close();
            await app.close();
            await start();
        },
        async close() {
            store.close();
            await app.close();
            await dropDatabase(dbName);
            node_fs_1.default.rmSync(config.mediaDir.replace(/\/media$/, ''), { recursive: true, force: true });
        },
    };
    return h;
}
/** Imagen PNG real generada con sharp (con metadatos EXIF para comprobar que se eliminan). */
async function pngBuffer({ width = 40, height = 30, exif = false } = {}) {
    const { default: sharp } = await import('sharp');
    let img = sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png();
    if (exif)
        img = img.withExif({ IFD0: { Copyright: 'GPS-SECRETO-DE-PRUEBA' } });
    return img.toBuffer();
}
async function jpegBuffer({ exif = false } = {}) {
    const { default: sharp } = await import('sharp');
    let img = sharp({ create: { width: 60, height: 40, channels: 3, background: '#004884' } }).jpeg();
    if (exif)
        img = img.withExif({ IFD0: { Copyright: 'GPS-SECRETO-DE-PRUEBA' } });
    return img.toBuffer();
}
//# sourceMappingURL=harness.js.map