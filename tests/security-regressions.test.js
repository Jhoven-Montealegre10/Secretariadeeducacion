'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { app, request, db, createUser, login, call, csrf, totp, mailer, pngBuffer, userRepository } = require('./helpers');
const services = require('../src/container');
const { createMalwareScanner } = require('../src/infrastructure/storage/malwareScanner');

async function pending(user) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const r = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: user.email, password: user.password });
  assert.equal(r.status, 200);
  agent.csrf = r.body.data.csrfToken;
  return agent;
}

test('un gestor limitado no cambia correo, MFA, invitaciones ni rol de usuarios con más permisos', async () => {
  const admin = await createUser({ email: 'protected@example.gov.co', rol: 'administrador' });
  const root = await login(admin);
  const role = await call(root, 'post', '/api/v1/roles', { nombre: 'Soporte limitado', permisos: ['dashboard.access', 'users.update'] });
  assert.equal(role.status, 201);
  const support = await createUser({ email: 'support@example.gov.co', rol: role.body.data.slug });
  const agent = await login(support);
  const editor = await createUser({ email: 'higher-editor@example.gov.co' });
  const outboxSize = mailer.outbox.length;
  for (const target of [admin, editor]) {
    const before = userRepository.findById(target.id);
    assert.equal((await call(agent, 'patch', `/api/v1/usuarios/${target.id}`, { email: 'controlled@example.gov.co' })).status, 403);
    assert.equal((await call(agent, 'patch', `/api/v1/usuarios/${target.id}`, { rolId: role.body.data.id })).status, 403);
    assert.equal((await call(agent, 'post', `/api/v1/usuarios/${target.id}/mfa/restablecer`, {})).status, 403);
    assert.equal((await call(agent, 'post', `/api/v1/usuarios/${target.id}/invitacion`, {})).status, 403);
    assert.deepEqual(userRepository.findById(target.id), before);
  }
  assert.equal(mailer.outbox.length, outboxSize);
  const peer = await createUser({ email: 'support-peer@example.gov.co', rol: role.body.data.slug });
  assert.equal((await call(agent, 'patch', `/api/v1/usuarios/${peer.id}`, { nombre: 'Soporte actualizado' })).status, 200);
  // Un administrador conserva la gestión legítima y revoca enlaces al cambiar correo.
  await services.authService.requestPasswordReset(editor.email, '127.0.0.1');
  const oldToken = mailer.outbox.at(-1).text.match(/#token=([^\s]+)/)[1];
  assert.equal((await call(root, 'patch', `/api/v1/usuarios/${editor.id}`, { email: 'new-editor@example.gov.co' })).status, 200);
  await assert.rejects(services.authService.resetPassword(oldToken, 'aurora violeta sobre montanas de noviembre', '127.0.0.1'), { status: 422 });
  assert.equal((await call(root, 'post', `/api/v1/usuarios/${editor.id}/mfa/restablecer`, {})).status, 200);
  assert.equal((await call(root, 'post', `/api/v1/usuarios/${editor.id}/invitacion`, {})).status, 200);
});

test('dos sesiones de primer ingreso no pueden sobrescribir MFA, tampoco invocando el servicio', async () => {
  const user = await createUser({ email: 'enrollment@example.gov.co', mfa: false });
  const first = await pending(user);
  const stale = await pending(user);
  const setup1 = await call(first, 'post', '/api/v1/auth/mfa/configuracion', {});
  const setup2 = await call(stale, 'post', '/api/v1/auth/mfa/configuracion', {});
  assert.equal(setup1.status, 200);
  assert.equal(setup2.status, 200);
  const enable = await call(first, 'post', '/api/v1/auth/mfa/activar', { codigo: totp.generate(setup1.body.data.secretoManual) });
  assert.equal(enable.status, 200);
  first.csrf = enable.body.data.csrfToken;
  const stored = userRepository.findById(user.id).mfaSecretoEnc;
  assert.equal((await call(stale, 'post', '/api/v1/auth/mfa/activar', { codigo: totp.generate(setup2.body.data.secretoManual) })).status, 401);
  assert.equal((await call(stale, 'post', '/api/v1/auth/mfa/configuracion', {})).status, 401);
  assert.throws(
    () => services.authService.confirmEnrollment(user.id, setup2.body.data.secretoManual, totp.generate(setup2.body.data.secretoManual), '127.0.0.1'),
    { status: 401 },
  );
  assert.equal(userRepository.findById(user.id).mfaSecretoEnc, stored);
  assert.equal((await call(first, 'get', '/api/v1/auth/sesion')).status, 200);
});

test('el cambio legítimo de dispositivo MFA conserva acceso y revoca otras sesiones', async () => {
  const user = await createUser({ email: 'replace-mfa@example.gov.co' });
  const agent = await login(user);
  const other = await login(user);
  db.prepare('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = ?').run(user.id);
  assert.equal((await call(agent, 'post', '/api/v1/cuenta/reautenticar', { password: user.password, codigo: totp.generate(user.secret) })).status, 200);
  const setup = await call(agent, 'post', '/api/v1/cuenta/mfa/configuracion', {});
  assert.equal(setup.status, 200);
  const enable = await call(agent, 'post', '/api/v1/cuenta/mfa/activar', { codigo: totp.generate(setup.body.data.secretoManual) });
  assert.equal(enable.status, 200);
  agent.csrf = enable.body.data.csrfToken;
  assert.equal(enable.body.data.codigosRecuperacion.length, 10);
  assert.equal((await call(agent, 'get', '/api/v1/auth/sesion')).status, 200);
  assert.equal((await call(other, 'get', '/api/v1/auth/sesion')).status, 401);
});

test('cambiar contraseña revoca enlaces previos y permite solicitar un enlace nuevo', async () => {
  const user = await createUser({ email: 'reset-old@example.gov.co' });
  await services.authService.requestPasswordReset(user.email, '127.0.0.1');
  const token = mailer.outbox.at(-1).text.match(/#token=([^\s]+)/)[1];
  await services.authService.changePassword(user.id, user.password, 'nubes plateadas sobre jardines del oriente', '127.0.0.1');
  await assert.rejects(services.authService.resetPassword(token, 'aves doradas recorren horizontes de invierno', '127.0.0.1'), { status: 422 });
  await services.authService.requestPasswordReset(user.email, '127.0.0.1');
  const fresh = mailer.outbox.at(-1).text.match(/#token=([^\s]+)/)[1];
  await services.authService.resetPassword(fresh, 'aves doradas recorren horizontes de invierno', '127.0.0.1');
  assert.equal(
    (await pending({ ...user, password: 'aves doradas recorren horizontes de invierno' }).then((agent) => call(agent, 'get', '/api/v1/auth/sesion'))).status,
    401,
  );
});

test('imagen y miniatura de noticia futura permanecen privadas y se habilitan al llegar la fecha', async () => {
  const editor = await login(await createUser({ email: 'media-editor@example.gov.co' }));
  const upload = await editor
    .post('/api/v1/medios')
    .set('X-CSRF-Token', editor.csrf)
    .attach('archivos', await pngBuffer(), 'embargo.png');
  assert.equal(upload.status, 201);
  const media = require('../src/infrastructure/repositories/mediaRepository').findById(upload.body.data[0].id);
  const news = await call(editor, 'post', '/api/v1/noticias', {
    titulo: 'Noticia bajo embargo futuro',
    resumen: 'Resumen de noticia con fecha futura de publicacion.',
    contenido: '<p>Contenido institucional reservado hasta su fecha de publicacion.</p>',
    categoria: 'Institucional',
    estado: 'publicada',
    fechaPublicacion: '2099-01-01',
    imagenId: media.id,
    fotos: [],
  });
  assert.equal(news.status, 201);
  assert.equal((await request(app).get(`/api/v1/public/noticias/${news.body.data.slug}`)).status, 404);
  for (const name of [media.archivo, media.miniatura]) assert.equal((await request(app).get(`/media/${name}`)).status, 404);
  // Simula que ya llegó la fecha sin editar la noticia ni recalcular usos.
  db.prepare("UPDATE noticias SET fecha_publicacion = '2020-01-01' WHERE id = ?").run(news.body.data.id);
  for (const name of [media.archivo, media.miniatura]) assert.equal((await request(app).get(`/media/${name}`)).status, 200);
  assert.equal((await call(editor, 'put', `/api/v1/noticias/${news.body.data.id}`, { estado: 'borrador' })).status, 200);
  for (const name of [media.archivo, media.miniatura]) assert.equal((await request(app).get(`/media/${name}`)).status, 404);
  assert.equal((await call(editor, 'patch', `/api/v1/medios/${media.id}`, { visibilidad: 'publica' })).status, 200);
  assert.equal((await request(app).get(`/media/${media.archivo}`)).status, 200);
});

test('antimalware obligatorio rechaza falta, infección, error y timeout; elimina temporales', async () => {
  const sample = Buffer.from('%PDF-1.7\ncontenido de prueba');
  await assert.rejects(createMalwareScanner({ command: '', required: true }).scan(sample), { status: 503, code: 'MALWARE_SCAN_UNAVAILABLE' });
  assert.deepEqual(await createMalwareScanner({ command: '', required: false, quiet: true }).scan(sample), { escaneado: false, limpio: true });
  for (const code of [0, 1, 2, 'ETIMEDOUT']) {
    let temporary;
    const scanner = createMalwareScanner({
      command: 'scanner-test',
      required: true,
      execute: (_cmd, args, options, cb) => {
        temporary = args[1];
        assert.deepEqual(fs.readFileSync(temporary), sample);
        assert.equal(options.timeout, 60000);
        cb(code === 0 ? null : { code });
      },
    });
    if (code === 0 || code === 1) assert.deepEqual(await scanner.scan(sample), { escaneado: true, limpio: code === 0 });
    else await assert.rejects(scanner.scan(sample), { status: 503 });
    assert.equal(fs.existsSync(temporary), false);
  }
});

test('el escáner exportado exige antimalware automáticamente en producción', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    require('./src/infrastructure/storage/malwareScanner').scan(Buffer.from('test'))
      .then(() => { process.exitCode = 1; })
      .catch((error) => {
        if (error.status !== 503 || error.code !== 'MALWARE_SCAN_UNAVAILABLE') process.exitCode = 2;
      });
  `,
    ],
    {
      cwd: require('node:path').join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_URL: 'https://portal.example.gov.co',
        SESSION_SECRET: 'x'.repeat(48),
        DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        MALWARE_SCAN_COMMAND: '',
      },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
