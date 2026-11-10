/**
 * Arnés de pruebas de integración contra PostgreSQL REAL (nunca SQLite ni datos reales):
 *  - cada archivo de prueba crea su propia base temporal `semibague_test_<aleatorio>` con el
 *    script de aprovisionamiento versionado (roles de mínimo privilegio), aplica las migraciones
 *    con la cuenta de migraciones y ejecuta la aplicación con la cuenta limitada semibague_app;
 *  - al terminar, la base se elimina (DROP DATABASE … WITH (FORCE)) y las carpetas temporales se borran.
 * Requiere TEST_PG_ADMIN_URL (superusuario de un servidor de PRUEBAS) y psql en el PATH.
 */
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CLOCK, type Clock } from '../../src/application/clock';
import { loadConfig, type AppConfig } from '../../src/config/configuration';
import { dataSourceOptions } from '../../src/infrastructure/database/data-source';
import { Db } from '../../src/infrastructure/database/db.service';
import { Mailer } from '../../src/infrastructure/mail/mailer.service';
import { RoleRepository, UserRepository } from '../../src/infrastructure/repositories/identity.repositories';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';
import { PasswordHasher } from '../../src/infrastructure/security/password-hasher.service';
import { TotpService } from '../../src/infrastructure/security/totp.service';
import type { PgSessionStore } from '../../src/infrastructure/session/pg-session.store';
import { configureApp } from '../../src/presentation/http/app.setup';

export const PASSWORD = 'cometa verde sobre el nevado del tolima';
// Contraseñas SOLO del servidor de pruebas (los roles son globales del servidor).
const APP_PASSWORD = process.env.TEST_DB_APP_PASSWORD ?? 'app-solo-pruebas-123';
const MIGRATOR_PASSWORD = process.env.TEST_DB_MIGRATOR_PASSWORD ?? 'migrador-solo-pruebas-123';
const ROOT = path.resolve(__dirname, '..', '..', '..');

/** Reloj controlable: permite simular expiraciones sin esperar. */
export class TestClock implements Clock {
  offset = 0;
  now(): number {
    return Date.now() + this.offset;
  }
}

export type Agent = ReturnType<typeof request.agent> & { csrf?: string };

export interface TestUser {
  id: number;
  email: string;
  password: string;
  secret: string;
}

export interface Harness {
  app: NestExpressApplication;
  config: AppConfig;
  db: Db;
  clock: TestClock;
  mailer: Mailer;
  totp: TotpService;
  dbName: string;
  adminUrl: string;
  get<T>(type: new (...args: never[]) => T): T;
  agent(): Agent;
  createUser(opts: { email: string; nombre?: string; rol?: string; password?: string; mfa?: boolean }): Promise<TestUser>;
  login(user: TestUser): Promise<Agent>;
  csrf(agent: Agent): Promise<string>;
  call(agent: Agent, method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: unknown): request.Test;
  restart(): Promise<void>;
  close(): Promise<void>;
}

function adminUrl(): string {
  const url = process.env.TEST_PG_ADMIN_URL;
  if (!url) throw new Error('Defina TEST_PG_ADMIN_URL (superusuario de un PostgreSQL de PRUEBAS) para las pruebas de integración.');
  return url;
}

/** Crea una base temporal aislada con roles y migraciones. Devuelve su nombre. */
export async function provisionDatabase(): Promise<{ dbName: string; env: NodeJS.ProcessEnv }> {
  const admin = adminUrl();
  const dbName = `semibague_test_${crypto.randomBytes(5).toString('hex')}`;
  const u = new URL(admin);
  // Los roles son globales del servidor: si ya existen se les asigna la contraseña de esta corrida.
  execFileSync(
    'psql',
    [admin, '-q', '-v', `app_password=${APP_PASSWORD}`, '-v', `migrator_password=${MIGRATOR_PASSWORD}`, '-v', `db_name=${dbName}`, '-f', path.join(ROOT, 'scripts/postgres/01-crear-roles-y-base.sql')],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const c = new Client({ connectionString: admin });
  await c.connect();
  await c.query(`ALTER ROLE semibague_app PASSWORD '${APP_PASSWORD}'`);
  await c.query(`ALTER ROLE semibague_migrator PASSWORD '${MIGRATOR_PASSWORD}'`);
  await c.end();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-test-'));
  const env: NodeJS.ProcessEnv = {
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
    MEDIA_DIR: path.join(tmp, 'media'),
    UPLOADS_DIR: path.join(tmp, 'uploads'),
    DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    PUBLIC_CACHE_TTL_SECONDS: '60',
    TEST_RATE_LIMIT: process.env.TEST_RATE_LIMIT ?? '10000',
  };
  const ds = new DataSource(dataSourceOptions(loadConfig(env), { forMigrations: true }));
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
  return { dbName, env };
}

export async function dropDatabase(dbName: string): Promise<void> {
  if (!/^semibague_test_[0-9a-f]+$/.test(dbName)) throw new Error('Solo se eliminan bases de prueba');
  const c = new Client({ connectionString: adminUrl() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await c.end();
}

export async function createHarness(extraEnv: NodeJS.ProcessEnv = {}): Promise<Harness> {
  const { dbName, env } = await provisionDatabase();
  const config = loadConfig({ ...env, ...extraEnv });
  const clock = new TestClock();
  let app!: NestExpressApplication;
  let store!: PgSessionStore;

  async function start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: ['error'] });
    store = await configureApp(app);
  }
  await start();

  const h: Harness = {
    get app() {
      return app;
    },
    config,
    get db() {
      return app.get(Db);
    },
    clock,
    get mailer() {
      return app.get(Mailer);
    },
    get totp() {
      return app.get(TotpService);
    },
    dbName,
    adminUrl: adminUrl(),
    get: <T>(type: new (...args: never[]) => T) => app.get(type),
    agent: () => request.agent(app.getHttpServer()),

    async createUser({ email, nombre = 'Usuario de Prueba', rol = 'editor', password = PASSWORD, mfa = true }) {
      const role = await app.get(RoleRepository).findBySlug(rol);
      if (!role) throw new Error(`Rol ${rol} inexistente`);
      const users = app.get(UserRepository);
      const id = await users.create({ email, nombre, passwordHash: await app.get(PasswordHasher).hash(password), rolId: role.id });
      const secret = app.get(TotpService).createSecret();
      if (mfa) await users.setMfa(id, { secretoEnc: app.get(CryptoService).encrypt(secret), activo: true });
      return { id, email, password, secret };
    },

    async csrf(agent) {
      const res = await agent.get('/api/v1/auth/csrf');
      return (res.body as { data: { csrfToken: string } }).data.csrfToken;
    },

    async login(user) {
      const agent = h.agent();
      let token = await h.csrf(agent);
      const r1 = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: user.email, password: user.password });
      if (r1.status !== 200) throw new Error(`login ${r1.status}: ${JSON.stringify(r1.body)}`);
      token = r1.body.data.csrfToken;
      // Permite reutilizar el mismo intervalo de 30 s en pruebas (en producción el código no se reutiliza).
      await h.db.run('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = $1', [user.id]);
      const r2 = await agent.post('/api/v1/auth/mfa/verificar').set('X-CSRF-Token', token).send({ codigo: h.totp.generate(user.secret, clock.now()) });
      if (r2.status !== 200) throw new Error(`mfa ${r2.status}: ${JSON.stringify(r2.body)}`);
      agent.csrf = r2.body.data.csrfToken;
      return agent;
    },

    call(agent, method, url, body) {
      const req = agent[method](url).set('Accept', 'application/json');
      if (method !== 'get') req.set('X-CSRF-Token', agent.csrf ?? 'sin-token');
      return body === undefined ? req : req.send(body as object);
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
      fs.rmSync(config.mediaDir.replace(/\/media$/, ''), { recursive: true, force: true });
    },
  };
  return h;
}

/** Imagen PNG real generada con sharp (con metadatos EXIF para comprobar que se eliminan). */
export async function pngBuffer({ width = 40, height = 30, exif = false } = {}): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  let img = sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png();
  if (exif) img = img.withExif({ IFD0: { Copyright: 'GPS-SECRETO-DE-PRUEBA' } });
  return img.toBuffer();
}

export async function jpegBuffer({ exif = false } = {}): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  let img = sharp({ create: { width: 60, height: 40, channels: 3, background: '#004884' } }).jpeg();
  if (exif) img = img.withExif({ IFD0: { Copyright: 'GPS-SECRETO-DE-PRUEBA' } });
  return img.toBuffer();
}
