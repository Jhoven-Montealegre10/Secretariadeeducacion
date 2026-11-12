/** Autenticación, segundo factor, recuperación y sesiones (ASVS V2, V3) contra PostgreSQL. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { UserRepository } from '../../src/infrastructure/repositories/identity.repositories';
import { createHarness, PASSWORD, type Agent, type Harness, type TestUser } from '../support/harness';

let h: Harness;
let admin: TestUser;

before(async () => {
  h = await createHarness();
  admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
});
after(async () => h?.close());

async function passwordStep(email: string, password: string) {
  const agent = h.agent();
  const token = await h.csrf(agent);
  const res = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email, password });
  agent.csrf = res.body.data?.csrfToken ?? token;
  return { agent, res };
}

const user = (id: number) => h.get(UserRepository).findById(id);

describe('Inicio de sesión', () => {
  test('error idéntico para correo inexistente y contraseña incorrecta (sin enumeración)', async () => {
    const a = (await passwordStep('nadie@example.gov.co', 'lo que sea 123456')).res;
    const b = (await passwordStep(admin.email, 'contraseña equivocada')).res;
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
    assert.equal(a.body.error.code, b.body.error.code);
  });

  test('el correo no distingue mayúsculas', async () => {
    const { res } = await passwordStep('ADMIN@Example.gov.co', PASSWORD);
    assert.equal(res.status, 200);
  });

  test('la contraseña correcta NO da acceso al panel hasta el segundo factor', async () => {
    const { agent, res } = await passwordStep(admin.email, PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.siguientePaso, 'mfa');
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 401);
    assert.equal((await agent.get('/api/v1/usuarios')).status, 401);
    assert.equal((await agent.get('/admin')).status, 302);
  });

  test('segundo factor: código incorrecto rechazado, correcto inicia sesión, reutilizado rechazado', async () => {
    const { agent } = await passwordStep(admin.email, PASSWORD);
    await h.db.run('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = $1', [admin.id]);
    const bad = await h.call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: '000000' });
    assert.equal(bad.status, 401);
    const code = h.totp.generate(admin.secret);
    const ok = await h.call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: code });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.usuario.permisos.includes('users.read'));

    const second = await passwordStep(admin.email, PASSWORD);
    const replay = await h.call(second.agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: code });
    assert.equal(replay.status, 401, 'el mismo código TOTP no se puede usar dos veces');
  });

  test('la sesión cambia de ID al iniciar sesión (anti fijación de sesión) y la cookie es segura', async () => {
    const agent = h.agent();
    const first = await agent.get('/api/v1/auth/csrf');
    const sid1 = String(first.headers['set-cookie']?.[0]).split(';')[0];
    const r = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', first.body.data.csrfToken).send({ email: admin.email, password: PASSWORD });
    const cookie = String(r.headers['set-cookie']?.[0]);
    assert.notEqual(sid1, cookie.split(';')[0]);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });

  test('el ID de sesión no se guarda en claro en la base de datos', async () => {
    const agent = await h.login(admin);
    const res = await agent.get('/api/v1/auth/sesion');
    assert.equal(res.status, 200);
    const sids = (await h.db.query<{ sid: string }>('SELECT sid FROM sesiones WHERE usuario_id = $1', [admin.id])).map((r) => r.sid);
    const cookieSid = decodeURIComponent(String(res.request.cookies ?? '')).match(/s:([^.]+)\./)?.[1];
    assert.ok(sids.length > 0);
    if (cookieSid) assert.ok(!sids.includes(cookieSid));
    for (const s of sids) assert.match(s, /^[0-9a-f]{64}$/, 'se guarda un HMAC del ID');
  });

  test('bloquea la cuenta tras 5 contraseñas incorrectas, incluso con la contraseña correcta', async () => {
    const u = await h.createUser({ email: 'bloqueo@example.gov.co' });
    for (let i = 0; i < 5; i++) await passwordStep(u.email, 'incorrecta incorrecta');
    const res = (await passwordStep(u.email, PASSWORD)).res;
    assert.equal(res.status, 401);
    assert.ok(((await user(u.id))?.bloqueadoHasta ?? 0) > Date.now());
  });

  test('intentos fallidos simultáneos se cuentan todos (incremento atómico en la BD)', async () => {
    const u = await h.createUser({ email: 'concurrente@example.gov.co' });
    await Promise.all(Array.from({ length: 5 }, () => passwordStep(u.email, 'incorrecta incorrecta')));
    assert.ok(((await user(u.id))?.bloqueadoHasta ?? 0) > Date.now(), 'cinco intentos paralelos bloquean la cuenta');
  });

  test('tras 5 códigos MFA incorrectos se cancela el inicio y se bloquea la cuenta', async () => {
    const u = await h.createUser({ email: 'mfa-bloqueo@example.gov.co' });
    const { agent } = await passwordStep(u.email, PASSWORD);
    let last;
    for (let i = 0; i < 5; i++) last = await h.call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: '111111' });
    assert.equal(last?.status, 429);
    const afterLock = await h.call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: h.totp.generate(u.secret) });
    assert.equal(afterLock.status, 401, 'la sesión pendiente fue cancelada');
  });

  test('las contraseñas se guardan con Argon2id y los hashes scrypt antiguos se migran al ingresar', async () => {
    assert.match(String((await user(admin.id))?.passwordHash), /^\$argon2id\$/);
    const u = await h.createUser({ email: 'legado@example.gov.co' });
    const salt = crypto.randomBytes(16);
    const legacy = `scrypt$${salt.toString('base64')}$${crypto.scryptSync(PASSWORD, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64')}`;
    await h.db.run('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [legacy, u.id]);
    await h.login(u);
    assert.match(String((await user(u.id))?.passwordHash), /^\$argon2id\$/);
  });
});

describe('Primer ingreso: configuración obligatoria del segundo factor', () => {
  test('sin MFA no hay acceso; al configurarlo se entregan códigos de recuperación de un solo uso', async () => {
    const u = await h.createUser({ email: 'nuevo@example.gov.co', mfa: false });
    const { agent, res } = await passwordStep(u.email, PASSWORD);
    assert.equal(res.body.data.siguientePaso, 'configurar_mfa');
    assert.equal((await h.call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: '123456' })).status, 401);

    const setup = await h.call(agent, 'post', '/api/v1/auth/mfa/configuracion');
    assert.equal(setup.status, 200);
    assert.match(setup.body.data.otpauthUri, /^otpauth:\/\/totp\//);
    const secret: string = setup.body.data.secretoManual;
    const enable = await h.call(agent, 'post', '/api/v1/auth/mfa/activar', { codigo: h.totp.generate(secret) });
    assert.equal(enable.status, 200, JSON.stringify(enable.body));
    const codes: string[] = enable.body.data.codigosRecuperacion;
    assert.equal(codes.length, 10);
    agent.csrf = enable.body.data.csrfToken;
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 200);

    const enc = await h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE id = $1', [u.id]);
    assert.ok(!enc.includes(secret), 'el secreto TOTP se guarda cifrado');
    const stored = (await h.db.query<{ codigo_hash: string }>('SELECT codigo_hash FROM codigos_recuperacion WHERE usuario_id = $1', [u.id])).map(
      (r) => r.codigo_hash,
    );
    assert.ok(!stored.some((x) => codes.some((c) => x.includes(c.replace('-', '')))), 'los códigos se guardan como hash');

    const r1 = await passwordStep(u.email, PASSWORD);
    assert.equal((await h.call(r1.agent, 'post', '/api/v1/auth/mfa/verificar', { codigoRecuperacion: codes[0] })).status, 200);
    const r2 = await passwordStep(u.email, PASSWORD);
    assert.equal((await h.call(r2.agent, 'post', '/api/v1/auth/mfa/verificar', { codigoRecuperacion: codes[0] })).status, 401);
  });
});

describe('Cierre de sesión y revocación', () => {
  test('cerrar sesión invalida la cookie en el servidor', async () => {
    const agent = await h.login(admin);
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 200);
    assert.equal((await h.call(agent, 'post', '/api/v1/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 401);
  });

  test('desactivar a un usuario revoca sus sesiones de inmediato', async () => {
    const u = await h.createUser({ email: 'revocar@example.gov.co' });
    const userAgent = await h.login(u);
    const adminAgent = await h.login(admin);
    assert.equal((await userAgent.get('/api/v1/noticias')).status, 200);
    assert.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${u.id}`, { activo: false })).status, 200);
    assert.equal((await userAgent.get('/api/v1/noticias')).status, 401);
  });

  test('cambiar la contraseña cierra las demás sesiones y mantiene la actual', async () => {
    const u = await h.createUser({ email: 'cambio@example.gov.co' });
    const a = await h.login(u);
    const b = await h.login(u);
    const res = await h.call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva: 'marimba azul en la plaza mayor' });
    assert.equal(res.status, 200);
    a.csrf = res.body.data.csrfToken;
    assert.equal((await a.get('/api/v1/auth/sesion')).status, 200);
    assert.equal((await b.get('/api/v1/auth/sesion')).status, 401);
  });

  test('rechaza contraseñas comunes o débiles', async () => {
    const u = await h.createUser({ email: 'debil@example.gov.co' });
    const a = await h.login(u);
    for (const nueva of ['password1234', 'ibague123456', 'qwertyuiop12', 'aaaaaaaaaaaa']) {
      const res = await h.call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva });
      assert.equal(res.status, 422, nueva);
    }
  });

  test('cambio de dispositivo MFA exige reautenticación reciente', async () => {
    const a = await h.login(admin);
    const res = await h.call(a, 'post', '/api/v1/cuenta/mfa/configuracion');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'REAUTH_REQUIRED');
  });
});

describe('Duración de la sesión y configuración de producción', () => {
  test('la sesión expira al superar la duración máxima absoluta aunque haya actividad', async () => {
    const u = await h.createUser({ email: 'absoluta@example.gov.co' });
    const agent: Agent = await h.login(u);
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 200);
    const nueveHoras = 9 * 60 * 60 * 1000;
    await h.db.run(
      `UPDATE sesiones SET data = jsonb_set(data, '{auth,loginAt}', to_jsonb((data->'auth'->>'loginAt')::bigint - $1)) WHERE usuario_id = $2 AND data ? 'auth'`,
      [nueveHoras, u.id],
    );
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 401);
  });

  test('en producción el servidor no arranca sin secretos, con APP_URL sin HTTPS ni con PostgreSQL remoto sin TLS verificado', () => {
    const run = (env: Record<string, string>) =>
      spawnSync(process.execPath, ['-e', "require('./dist/src/config/configuration').loadConfig(process.env)"], {
        cwd: path.resolve(__dirname, '..', '..', '..'),
        env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...env },
        encoding: 'utf8',
      });
    const keys = { SESSION_SECRET: 'x'.repeat(48), DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), DB_PASSWORD: 'ficticia' };
    const https = { APP_URL: 'https://portal.example.gov.co' };
    assert.match(run(https).stderr, /SESSION_SECRET|DATA_ENCRYPTION_KEY/);
    assert.match(run({ ...https, SESSION_SECRET: keys.SESSION_SECRET }).stderr, /DATA_ENCRYPTION_KEY/);
    assert.match(run({ ...keys, APP_URL: 'http://portal.example.gov.co' }).stderr, /https/);
    assert.match(run({ ...keys, ...https, DB_HOST: 'db.example.gov.co', DB_SSL: 'require' }).stderr, /verify-full/);
    assert.match(run({ ...https, SESSION_SECRET: keys.SESSION_SECRET, DATA_ENCRYPTION_KEY: keys.DATA_ENCRYPTION_KEY }).stderr, /DB_PASSWORD/);
    assert.equal(run({ ...keys, ...https }).status, 0);
  });
});

describe('Recuperación de acceso', () => {
  test('misma respuesta exista o no el correo; token de un solo uso; revoca sesiones; MFA sigue exigido', async () => {
    const u = await h.createUser({ email: 'olvido@example.gov.co' });
    const session = await h.login(u);
    const agent = h.agent();
    const token = await h.csrf(agent);
    h.mailer.outbox.length = 0;
    const unknown = await agent.post('/api/v1/auth/recuperacion').set('X-CSRF-Token', token).send({ email: 'no-existe@example.gov.co' });
    const known = await agent.post('/api/v1/auth/recuperacion').set('X-CSRF-Token', token).send({ email: u.email });
    assert.equal(unknown.status, 202);
    assert.equal(known.status, 202);
    assert.deepEqual(unknown.body, known.body);
    assert.equal(h.mailer.outbox.length, 1);
    const resetToken = String(/#token=([\w-]+)/.exec(h.mailer.outbox[0].text)?.[1]);
    const hashes = (await h.db.query<{ token_hash: string }>('SELECT token_hash FROM tokens_recuperacion')).map((r) => r.token_hash);
    assert.ok(!hashes.includes(resetToken), 'solo se guarda el hash del token');

    const nueva = 'girasoles en la ventana del colegio';
    const ok = await agent.post('/api/v1/auth/recuperacion/restablecer').set('X-CSRF-Token', token).send({ token: resetToken, password: nueva });
    assert.equal(ok.status, 200);
    const again = await agent
      .post('/api/v1/auth/recuperacion/restablecer')
      .set('X-CSRF-Token', token)
      .send({ token: resetToken, password: 'otra frase distinta y larga' });
    assert.equal(again.status, 422, 'el token no se puede reutilizar');
    assert.equal((await session.get('/api/v1/auth/sesion')).status, 401, 'las sesiones anteriores se revocan');

    const step = await passwordStep(u.email, nueva);
    assert.equal(step.res.body.data.siguientePaso, 'mfa', 'recuperar la contraseña no omite el segundo factor');
  });

  test('un token vencido no sirve', async () => {
    const u = await h.createUser({ email: 'vencido@example.gov.co' });
    const agent = h.agent();
    const token = await h.csrf(agent);
    h.mailer.outbox.length = 0;
    await agent.post('/api/v1/auth/recuperacion').set('X-CSRF-Token', token).send({ email: u.email });
    const resetToken = String(/#token=([\w-]+)/.exec(h.mailer.outbox[0].text)?.[1]);
    await h.db.run("UPDATE tokens_recuperacion SET expira_en = now() - interval '1 second' WHERE usuario_id = $1", [u.id]);
    const res = await agent
      .post('/api/v1/auth/recuperacion/restablecer')
      .set('X-CSRF-Token', token)
      .send({ token: resetToken, password: 'otra frase suficientemente larga' });
    assert.equal(res.status, 422);
  });
});
