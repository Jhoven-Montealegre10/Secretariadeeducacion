/**
 * Rotación de secretos contra PostgreSQL real, con datos ficticios:
 *  - rotar la clave de datos y volver a cifrar sin perder nada (MFA, PQRSD, índices, auditoría, tokens, sesiones);
 *  - retirar la clave antigua sin romper la verificación de la auditoría;
 *  - contraseña de la base de datos dinámica: se rota y las conexiones nuevas la usan sin reiniciar;
 *  - la herramienta `npm run secrets` (estado, rotar-datos, retirar-datos, rotar-sesion) sin mostrar valores.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type session from 'express-session';
import { Client } from 'pg';
import { AuthService, normalizeCode } from '../../src/application/auth.service';
import { loadConfig } from '../../src/config/configuration';
import { formatKeyring, type KeyEntry } from '../../src/config/secrets';
import { connectionOptions } from '../../src/infrastructure/database/data-source';
import { AuditRepository, CredentialRepository } from '../../src/infrastructure/repositories/identity.repositories';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';
import { keyUsage, reencryptAll } from '../../src/infrastructure/security/key-rotation';
import { PgSessionStore } from '../../src/infrastructure/session/pg-session.store';
import { createHarness, type Harness, type TestUser } from '../support/harness';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const A: KeyEntry = { id: 'k202605010000', key: crypto.randomBytes(32), retired: false };
const B: KeyEntry = { id: 'k202611010000', key: crypto.randomBytes(32), retired: false };
const DOC = '1110123456';

let h: Harness;
let user: TestUser;
let codes: string[] = [];
let resetToken = '';

const cryptoOf = (...keys: KeyEntry[]) => new CryptoService({ dataKeys: keys });
const sessionGet = (store: PgSessionStore, sid: string) =>
  new Promise<session.SessionData | null | undefined>((ok, fail) =>
    store.get(sid, (err, s) => (err ? fail(err instanceof Error ? err : new Error(String(err))) : ok(s))),
  );
const sessionSet = (store: PgSessionStore, sid: string, s: session.SessionData) =>
  new Promise<void>((ok, fail) => store.set(sid, s, (err) => (err ? fail(err instanceof Error ? err : new Error(String(err))) : ok())));

before(async () => {
  // La aplicación arranca con el llavero [A] (en pruebas el llavero puede venir del entorno).
  h = await createHarness({ DATA_ENCRYPTION_KEYS: formatKeyring([A]) });
  user = await h.createUser({ email: 'rotacion@example.gov.co', rol: 'administrador' });
  codes = (await h.get(AuthService).regenerateRecoveryCodes(user.id, null)).codigosRecuperacion;
  await h.get(AuthService).requestPasswordReset(user.email, null);
  resetToken = String(/#token=([\w-]+)/.exec(h.mailer.outbox.at(-1)?.text ?? '')?.[1]);
  // PQRSD con datos personales cifrados, por el formulario público.
  const agent = h.agent();
  const token = String(/name="_csrf" value="([^"]+)"/.exec((await agent.get('/atencion')).text)?.[1]);
  await agent.post('/atencion/pqrsd').type('form').send({
    _csrf: token,
    tipo: 'Petición',
    nombre: 'María Pérez Gómez',
    tipo_documento: 'Cédula de ciudadanía',
    documento: DOC,
    email: 'maria@example.com',
    asunto: 'Certificado de estudios',
    mensaje: 'Solicito un certificado de estudios del año 2019, gracias.',
    acepto: 'on',
  });
  await h.login(user); // eventos de auditoría firmados con A
});
after(async () => h?.close());

describe('Rotación de la clave de datos', () => {
  test('todo lo cifrado y firmado con A está marcado con A', async () => {
    const enc = await h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE id = $1', [user.id]);
    assert.ok(enc.startsWith(`v2:${A.id}:`));
    assert.equal((await h.db.scalar<number>('SELECT count(*) FROM auditoria_eventos WHERE clave_id = $1', [A.id])) > 0, true);
  });

  test('con [B, A]: se vuelve a cifrar todo con B y nada se pierde', async () => {
    const BA = cryptoOf(B, A);
    const r = await reencryptAll(h.db, BA);
    assert.ok(r.usuariosMfa >= 1 && r.pqrsd === 1, JSON.stringify(r));
    assert.deepEqual(await reencryptAll(h.db, BA), { usuariosMfa: 0, pqrsd: 0 }, 'repetible: la segunda vez no hay nada que hacer');

    const enc = await h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE id = $1', [user.id]);
    assert.ok(enc.startsWith(`v2:${B.id}:`));
    assert.equal(BA.decrypt(enc), user.secret, 'el secreto MFA es el mismo');

    const p = await h.db.one<Record<string, string>>('SELECT documento_enc, nombre_enc, documento_hash FROM pqrsd LIMIT 1');
    assert.ok(p?.documento_enc.startsWith(`v2:${B.id}:`));
    assert.equal(BA.decrypt(p?.nombre_enc), 'María Pérez Gómez');
    assert.equal(p?.documento_hash, BA.blindIndex(DOC), 'índice ciego recalculado con B (la consulta ciudadana sigue funcionando)');

    const usage = await keyUsage(h.db, BA);
    assert.deepEqual(Object.keys(usage.cifrado), [B.id]);
  });

  test('los tokens y códigos creados con A siguen valiendo mientras A esté activa', async () => {
    const creds = new CredentialRepository(h.db);
    const BA = cryptoOf(B, A);
    assert.ok(await creds.findResetToken(BA.tokenHashAll(resetToken)), 'enlace de recuperación');
    assert.equal(await creds.consumeRecoveryCode(user.id, BA.tokenHashAll(normalizeCode(codes[0]))), true, 'código de recuperación');
    assert.equal(await creds.consumeRecoveryCode(user.id, BA.tokenHashAll(normalizeCode(codes[0]))), false, 'de un solo uso');
  });

  test('las sesiones creadas con A siguen abiertas y pasan a la clave B al guardarse', async () => {
    const ttl = 60_000;
    const storeA = new PgSessionStore(h.db, cryptoOf(A), ttl);
    const storeBA = new PgSessionStore(h.db, cryptoOf(B, A), ttl);
    try {
      const sess = { cookie: { originalMaxAge: ttl, expires: new Date(Date.now() + ttl) } } as unknown as session.SessionData;
      await sessionSet(storeA, 'sid-rotacion', sess);
      assert.ok(await sessionGet(storeBA, 'sid-rotacion'), 'se encuentra con el llavero nuevo');
      await sessionSet(storeBA, 'sid-rotacion', sess);
      const keys = (
        await h.db.query<{ sid: string }>('SELECT sid FROM sesiones WHERE sid = ANY($1)', [cryptoOf(B, A).tokenHashAll('session:sid-rotacion')])
      ).map((r) => r.sid);
      assert.deepEqual(keys, [cryptoOf(B).tokenHash('session:sid-rotacion')], 'queda una sola copia, con la clave B');
    } finally {
      storeA.close();
      storeBA.close();
    }
  });

  test('la cadena de auditoría mezcla eventos firmados con A y con B y se verifica completa', async () => {
    const audit = new AuditRepository(h.db, cryptoOf(B, A));
    await audit.append({
      usuarioId: user.id,
      usuarioEmail: user.email,
      accion: 'prueba_rotacion',
      recurso: null,
      recursoId: null,
      resultado: 'exito',
      detalle: null,
      ipHash: null,
    });
    assert.equal(await h.db.scalar<number>('SELECT count(*) FROM auditoria_eventos WHERE clave_id = $1', [B.id]), 1);
    assert.equal(await audit.verifyChain(), null);
    assert.ok(await new AuditRepository(h.db, cryptoOf(B)).verifyChain(), 'sin la clave A no se puede verificar la parte antigua');
  });

  test('retirar A: deja de descifrar y de validar tokens, pero la auditoría antigua se sigue verificando', async () => {
    const retired = cryptoOf(B, { ...A, retired: true });
    assert.equal(await new AuditRepository(h.db, retired).verifyChain(), null);
    const enc = await h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE id = $1', [user.id]);
    assert.equal(retired.decrypt(enc), user.secret, 'los datos ya están con B');
    assert.equal(await new CredentialRepository(h.db).findResetToken(retired.tokenHashAll(resetToken)), null, 'el enlace firmado con A ya no vale');
  });
});

describe('Contraseña de la base de datos dinámica', () => {
  test('se rota en el servidor y en el archivo; las conexiones nuevas la usan sin recargar la configuración', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-db-secreto-'));
    const file = path.join(dir, 'DB_PASSWORD');
    const original = h.config.db.password();
    fs.writeFileSync(file, `${original}\n`, { mode: 0o600 });
    const config = loadConfig({
      NODE_ENV: 'test',
      DB_HOST: h.config.db.host,
      DB_PORT: String(h.config.db.port),
      DB_NAME: h.config.db.database,
      DB_USER: h.config.db.user,
      DB_PASSWORD_FILE: file,
    });
    const tryConnect = async (opts = connectionOptions(config)) => {
      const c = new Client(opts);
      await c.connect();
      await c.end();
    };
    const admin = new Client({ connectionString: h.adminUrl });
    await admin.connect();
    try {
      await tryConnect();
      const nueva = crypto.randomBytes(18).toString('base64url');
      await admin.query(`ALTER ROLE semibague_app PASSWORD '${nueva}'`);
      fs.writeFileSync(file, `${nueva}\n`);
      fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
      await tryConnect(); // la misma configuración lee la contraseña nueva
      await assert.rejects(tryConnect({ ...connectionOptions(config), password: original }), 'la contraseña anterior ya no sirve');
    } finally {
      await admin.query(`ALTER ROLE semibague_app PASSWORD '${original}'`);
      await admin.end();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Herramienta npm run secrets', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;
  const cli = (...args: string[]) => spawnSync(process.execPath, [path.join(ROOT, 'dist/scripts/secretos.js'), ...args], { env, encoding: 'utf8' });

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-secretos-cli-'));
    fs.writeFileSync(path.join(dir, 'DATA_ENCRYPTION_KEYS'), formatKeyring([B, A]), { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'SESSION_SECRETS'), `${'s'.repeat(48)}\n`, { mode: 0o600 });
    env = {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      SECRETS_DIR: dir,
      DB_HOST: h.config.db.host,
      DB_PORT: String(h.config.db.port),
      DB_NAME: h.config.db.database,
      DB_USER: h.config.db.user,
      DB_PASSWORD: h.config.db.password(),
      DB_MIGRATION_USER: h.config.db.migrationUser,
      DB_MIGRATION_PASSWORD: h.config.db.migrationPassword(),
      STORAGE_DIR: path.join(dir, 'storage'),
    };
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('generar crea archivos 0600 sin sobrescribir los existentes', { skip: process.platform === 'win32' }, () => {
    const out = path.join(dir, 'nuevos');
    const r = cli('generar', '--dir', out);
    assert.equal(r.status, 0, r.stderr);
    for (const f of ['SESSION_SECRETS', 'DATA_ENCRYPTION_KEYS', 'DB_PASSWORD', 'DB_MIGRATION_PASSWORD']) {
      assert.equal(fs.statSync(path.join(out, f)).mode & 0o777, 0o600, f);
    }
    const before = fs.readFileSync(path.join(out, 'DB_PASSWORD'), 'utf8');
    assert.equal(cli('generar', '--dir', out).status, 0);
    assert.equal(fs.readFileSync(path.join(out, 'DB_PASSWORD'), 'utf8'), before, 'no sobrescribe');
    assert.ok(!r.stdout.includes(before.trim()), 'no imprime valores');
  });

  test('estado muestra origen, identificadores y huellas, nunca los valores', () => {
    const r = cli('estado');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(B.id));
    assert.match(r.stdout, /huella [0-9a-f]{16}/);
    for (const secret of [B.key.toString('base64'), A.key.toString('base64'), 's'.repeat(48), String(env.DB_PASSWORD)]) {
      assert.ok(!r.stdout.includes(secret) && !r.stderr.includes(secret), 'no muestra secretos');
    }
  });

  test('rotar-datos agrega una clave vigente y vuelve a cifrar los datos con ella', () => {
    const r = cli('rotar-datos');
    assert.equal(r.status, 0, r.stderr);
    const ring = fs.readFileSync(path.join(dir, 'DATA_ENCRYPTION_KEYS'), 'utf8').trim().split('\n');
    assert.equal(ring.length, 3);
    const nuevo = ring[0].split(':')[0];
    assert.match(r.stdout, new RegExp(`Vuelto a cifrar con ${nuevo}`));
    return h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE id = $1', [user.id]).then((enc) => assert.ok(enc.startsWith(`v2:${nuevo}:`)));
  });

  test('retirar-datos: no la vigente; avisa de códigos de recuperación firmados con la clave y retira con --forzar', () => {
    const vigente = fs.readFileSync(path.join(dir, 'DATA_ENCRYPTION_KEYS'), 'utf8').split(':')[0];
    assert.match(cli('retirar-datos', vigente).stderr, /vigente/);
    const sinForzar = cli('retirar-datos', B.id);
    assert.notEqual(sinForzar.status, 0);
    assert.match(sinForzar.stderr, /códigos de recuperación/);
    const forzado = cli('retirar-datos', B.id, '--forzar');
    assert.equal(forzado.status, 0, forzado.stderr);
    assert.match(fs.readFileSync(path.join(dir, 'DATA_ENCRYPTION_KEYS'), 'utf8'), new RegExp(`${B.id}:[^\\n]+:retirada`));
  });

  test('rotar-sesion agrega un secreto nuevo y conserva como máximo dos anteriores', () => {
    for (let i = 0; i < 3; i++) assert.equal(cli('rotar-sesion').status, 0);
    const lines = fs.readFileSync(path.join(dir, 'SESSION_SECRETS'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 3);
    assert.ok(!lines.includes('s'.repeat(48)), 'el más antiguo salió del llavero');
  });
});
