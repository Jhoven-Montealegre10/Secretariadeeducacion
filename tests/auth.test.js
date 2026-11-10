'use strict';
/** Autenticación, segundo factor, recuperación y sesiones (ASVS V2, V3). */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, db, createUser, login, call, csrf, totp, mailer, PASSWORD, userRepository } = require('./helpers');

let admin;
before(async () => {
  admin = await createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
});

async function passwordStep(email, password) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const res = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email, password });
  agent.csrf = res.body.data?.csrfToken || token;
  return { agent, res };
}

describe('Inicio de sesión', () => {
  test('error idéntico para correo inexistente y contraseña incorrecta (sin enumeración)', async () => {
    const a = (await passwordStep('nadie@example.gov.co', 'lo que sea 123456')).res;
    const b = (await passwordStep(admin.email, 'contraseña equivocada')).res;
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
    assert.equal(a.body.error.code, b.body.error.code);
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
    db.prepare('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = ?').run(admin.id);
    const bad = await call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: '000000' });
    assert.equal(bad.status, 401);
    const code = totp.generate(admin.secret);
    const ok = await call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: code });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.usuario.permisos.includes('users.read'));

    const second = await passwordStep(admin.email, PASSWORD);
    const replay = await call(second.agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: code });
    assert.equal(replay.status, 401, 'el mismo código TOTP no se puede usar dos veces');
  });

  test('la sesión cambia de ID al iniciar sesión (anti fijación de sesión)', async () => {
    const agent = request.agent(app);
    const first = await agent.get('/api/v1/auth/csrf');
    const sid1 = first.headers['set-cookie'][0].split(';')[0];
    const r = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', first.body.data.csrfToken).send({ email: admin.email, password: PASSWORD });
    const sid2 = r.headers['set-cookie'][0].split(';')[0];
    assert.notEqual(sid1, sid2);
    assert.match(r.headers['set-cookie'][0], /HttpOnly/);
    assert.match(r.headers['set-cookie'][0], /SameSite=Strict/);
  });

  test('bloquea la cuenta tras 5 contraseñas incorrectas, incluso con la contraseña correcta', async () => {
    const u = await createUser({ email: 'bloqueo@example.gov.co' });
    for (let i = 0; i < 5; i++) await passwordStep(u.email, 'incorrecta incorrecta');
    const res = (await passwordStep(u.email, PASSWORD)).res;
    assert.equal(res.status, 401);
    assert.ok(userRepository.findById(u.id).bloqueadoHasta > Date.now());
  });

  test('tras 5 códigos MFA incorrectos se cancela el inicio y se bloquea la cuenta', async () => {
    const u = await createUser({ email: 'mfa-bloqueo@example.gov.co' });
    const { agent } = await passwordStep(u.email, PASSWORD);
    let last;
    for (let i = 0; i < 5; i++) last = await call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: '111111' });
    assert.equal(last.status, 429);
    const after = await call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: totp.generate(u.secret) });
    assert.equal(after.status, 401, 'la sesión pendiente fue cancelada');
  });

  test('las contraseñas se guardan con Argon2id y los hashes scrypt antiguos se migran al ingresar', async () => {
    assert.match(userRepository.findById(admin.id).passwordHash, /^\$argon2id\$/);
    const u = await createUser({ email: 'legado@example.gov.co' });
    const crypto = require('node:crypto');
    const salt = crypto.randomBytes(16);
    const legacy = `scrypt$${salt.toString('base64')}$${crypto.scryptSync(PASSWORD, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64')}`;
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(legacy, u.id);
    await login(u);
    assert.match(userRepository.findById(u.id).passwordHash, /^\$argon2id\$/);
  });
});

describe('Primer ingreso: configuración obligatoria del segundo factor', () => {
  test('sin MFA no hay acceso; al configurarlo se entregan códigos de recuperación de un solo uso', async () => {
    const u = await createUser({ email: 'nuevo@example.gov.co', mfa: false });
    const { agent, res } = await passwordStep(u.email, PASSWORD);
    assert.equal(res.body.data.siguientePaso, 'configurar_mfa');
    assert.equal((await call(agent, 'post', '/api/v1/auth/mfa/verificar', { codigo: '123456' })).status, 401);

    const setup = await call(agent, 'post', '/api/v1/auth/mfa/configuracion');
    assert.equal(setup.status, 200);
    assert.match(setup.body.data.otpauthUri, /^otpauth:\/\/totp\//);
    const secret = setup.body.data.secretoManual;
    const enable = await call(agent, 'post', '/api/v1/auth/mfa/activar', { codigo: totp.generate(secret) });
    assert.equal(enable.status, 200);
    const codes = enable.body.data.codigosRecuperacion;
    assert.equal(codes.length, 10);
    agent.csrf = enable.body.data.csrfToken;
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 200);

    const row = db.prepare('SELECT mfa_secreto_enc FROM usuarios WHERE id = ?').get(u.id);
    assert.ok(!row.mfa_secreto_enc.includes(secret), 'el secreto TOTP se guarda cifrado');
    const stored = db
      .prepare('SELECT codigo_hash FROM codigos_recuperacion WHERE usuario_id = ?')
      .all(u.id)
      .map((r) => r.codigo_hash);
    assert.ok(!stored.some((h) => codes.some((c) => h.includes(c.replace('-', '')))), 'los códigos se guardan como hash');

    // Código de recuperación: sirve una sola vez
    const r1 = await passwordStep(u.email, PASSWORD);
    assert.equal((await call(r1.agent, 'post', '/api/v1/auth/mfa/verificar', { codigoRecuperacion: codes[0] })).status, 200);
    const r2 = await passwordStep(u.email, PASSWORD);
    assert.equal((await call(r2.agent, 'post', '/api/v1/auth/mfa/verificar', { codigoRecuperacion: codes[0] })).status, 401);
  });
});

describe('Cierre de sesión y revocación', () => {
  test('cerrar sesión invalida la cookie en el servidor', async () => {
    const agent = await login(admin);
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 200);
    assert.equal((await call(agent, 'post', '/api/v1/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 401);
  });

  test('desactivar a un usuario o cambiar su rol revoca sus sesiones de inmediato', async () => {
    const u = await createUser({ email: 'revocar@example.gov.co' });
    const userAgent = await login(u);
    const adminAgent = await login(admin);
    assert.equal((await userAgent.get('/api/v1/noticias')).status, 200);
    assert.equal((await call(adminAgent, 'patch', `/api/v1/usuarios/${u.id}`, { activo: false })).status, 200);
    assert.equal((await userAgent.get('/api/v1/noticias')).status, 401);
  });

  test('cambiar la contraseña cierra las demás sesiones y mantiene la actual', async () => {
    const u = await createUser({ email: 'cambio@example.gov.co' });
    const a = await login(u);
    const b = await login(u);
    const res = await call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva: 'marimba azul en la plaza mayor' });
    assert.equal(res.status, 200);
    a.csrf = res.body.data.csrfToken;
    assert.equal((await a.get('/api/v1/auth/sesion')).status, 200);
    assert.equal((await b.get('/api/v1/auth/sesion')).status, 401);
  });

  test('rechaza contraseñas comunes o débiles', async () => {
    const u = await createUser({ email: 'debil@example.gov.co' });
    const a = await login(u);
    for (const nueva of ['password1234', 'ibague123456', 'qwertyuiop12', 'aaaaaaaaaaaa']) {
      const res = await call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva });
      assert.equal(res.status, 422, nueva);
    }
  });

  test('cambio de dispositivo MFA exige reautenticación reciente', async () => {
    const a = await login(admin);
    const res = await call(a, 'post', '/api/v1/cuenta/mfa/configuracion');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'REAUTH_REQUIRED');
  });
});

describe('Duración de la sesión y configuración de producción', () => {
  test('la sesión expira al superar la duración máxima absoluta aunque haya actividad', async () => {
    const u = await createUser({ email: 'absoluta@example.gov.co' });
    const agent = await login(u);
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 200);
    const nueveHoras = 9 * 60 * 60 * 1000;
    db.prepare("UPDATE sesiones SET data = json_set(data, '$.auth.loginAt', json_extract(data, '$.auth.loginAt') - ?) WHERE usuario_id = ?").run(
      nueveHoras,
      u.id,
    );
    assert.equal((await agent.get('/api/v1/auth/sesion')).status, 401);
  });

  test('en producción el servidor no arranca sin secretos ni con APP_URL sin HTTPS', () => {
    const { spawnSync } = require('node:child_process');
    const run = (env) =>
      spawnSync(process.execPath, ['-e', "require('./src/config')"], {
        cwd: require('node:path').join(__dirname, '..'),
        env: { PATH: process.env.PATH, NODE_ENV: 'production', ...env },
        encoding: 'utf8',
      });
    const keys = { SESSION_SECRET: 'x'.repeat(48), DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
    const https = { APP_URL: 'https://portal.example.gov.co' };
    assert.match(run(https).stderr, /SESSION_SECRET|DATA_ENCRYPTION_KEY/);
    assert.match(run({ ...https, SESSION_SECRET: keys.SESSION_SECRET }).stderr, /DATA_ENCRYPTION_KEY/);
    assert.match(run({ ...keys, APP_URL: 'http://portal.example.gov.co' }).stderr, /https/);
    assert.equal(run({ ...keys, APP_URL: 'https://portal.example.gov.co' }).status, 0);
  });
});

describe('Recuperación de acceso', () => {
  test('misma respuesta exista o no el correo; token de un solo uso; revoca sesiones; MFA sigue exigido', async () => {
    const u = await createUser({ email: 'olvido@example.gov.co' });
    const session = await login(u);
    const agent = request.agent(app);
    const token = await csrf(agent);
    mailer.outbox.length = 0;
    const unknown = await agent.post('/api/v1/auth/recuperacion').set('X-CSRF-Token', token).send({ email: 'no-existe@example.gov.co' });
    const known = await agent.post('/api/v1/auth/recuperacion').set('X-CSRF-Token', token).send({ email: u.email });
    assert.equal(unknown.status, 202);
    assert.equal(known.status, 202);
    assert.deepEqual(unknown.body, known.body);
    assert.equal(mailer.outbox.length, 1);
    const resetToken = /#token=([\w-]+)/.exec(mailer.outbox[0].text)[1];
    assert.ok(
      !db
        .prepare('SELECT token_hash FROM tokens_recuperacion')
        .all()
        .some((r) => r.token_hash === resetToken),
      'solo se guarda el hash del token',
    );

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
    const u = await createUser({ email: 'vencido@example.gov.co' });
    const agent = request.agent(app);
    const token = await csrf(agent);
    mailer.outbox.length = 0;
    await agent.post('/api/v1/auth/recuperacion').set('X-CSRF-Token', token).send({ email: u.email });
    const resetToken = /#token=([\w-]+)/.exec(mailer.outbox[0].text)[1];
    db.prepare('UPDATE tokens_recuperacion SET expira_en = ? WHERE usuario_id = ?').run(Date.now() - 1000, u.id);
    const res = await agent
      .post('/api/v1/auth/recuperacion/restablecer')
      .set('X-CSRF-Token', token)
      .send({ token: resetToken, password: 'otra frase suficientemente larga' });
    assert.equal(res.status, 422);
  });
});
