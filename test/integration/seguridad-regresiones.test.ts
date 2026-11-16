/**
 * Regresiones de seguridad trasladadas desde la rama main (commit 140b6b5, versión JavaScript):
 * gestión de usuarios con más permisos, enrolamiento MFA concurrente, cambio de dispositivo MFA,
 * revocación de enlaces de recuperación y antimalware obligatorio. Contra PostgreSQL real.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { AuthService } from '../../src/application/auth.service';
import { UserRepository } from '../../src/infrastructure/repositories/identity.repositories';
import { createHarness, pngBuffer, type Agent, type Harness, type TestUser } from '../support/harness';

let h: Harness;
const auth = () => h.get(AuthService);
const user = (id: number) => h.get(UserRepository).findById(id);
const lastToken = () => String(/#token=([\w-]+)/.exec(h.mailer.outbox.at(-1)?.text ?? '')?.[1]);

/** Sesión con solo el primer factor verificado (primer ingreso o segundo factor pendiente). */
async function pending(u: { email: string; password: string }): Promise<Agent> {
  const agent = h.agent();
  const token = await h.csrf(agent);
  const r = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: u.email, password: u.password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  agent.csrf = r.body.data.csrfToken;
  return agent;
}

before(async () => {
  h = await createHarness();
});
after(async () => h?.close());

describe('Gestión de usuarios con más permisos (S-1)', () => {
  test('un gestor limitado no cambia correo, rol, MFA ni invitaciones de usuarios con más permisos; un administrador sí', async () => {
    const admin = await h.createUser({ email: 'protegido@example.gov.co', rol: 'administrador' });
    const root = await h.login(admin);
    const role = await h.call(root, 'post', '/api/v1/roles', { nombre: 'Soporte limitado', permisos: ['dashboard.access', 'users.read', 'users.update'] });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const support = await h.createUser({ email: 'soporte@example.gov.co', rol: role.body.data.slug });
    const agent = await h.login(support);
    const editor = await h.createUser({ email: 'editor-superior@example.gov.co' });
    const outbox = h.mailer.outbox.length;

    for (const target of [admin, editor]) {
      const before = await user(target.id);
      assert.equal((await h.call(agent, 'patch', `/api/v1/usuarios/${target.id}`, { email: 'controlado@example.gov.co' })).status, 403, 'correo');
      assert.equal((await h.call(agent, 'patch', `/api/v1/usuarios/${target.id}`, { rolId: role.body.data.id })).status, 403, 'rol');
      assert.equal((await h.call(agent, 'patch', `/api/v1/usuarios/${target.id}`, { activo: false })).status, 403, 'desactivar');
      assert.equal((await h.call(agent, 'post', `/api/v1/usuarios/${target.id}/mfa/restablecer`, {})).status, 403, 'MFA');
      assert.equal((await h.call(agent, 'post', `/api/v1/usuarios/${target.id}/invitacion`, {})).status, 403, 'invitación');
      assert.deepEqual(await user(target.id), before, 'sin cambios');
    }
    assert.equal(h.mailer.outbox.length, outbox, 'no se enviaron correos');

    // Con un par de su mismo rol sí puede trabajar.
    const peer = await h.createUser({ email: 'soporte-par@example.gov.co', rol: role.body.data.slug });
    assert.equal((await h.call(agent, 'patch', `/api/v1/usuarios/${peer.id}`, { nombre: 'Soporte actualizado' })).status, 200);

    // El administrador conserva la gestión legítima, y cambiar el correo revoca los enlaces enviados antes.
    await auth().requestPasswordReset(editor.email, '127.0.0.1');
    const oldToken = lastToken();
    assert.equal((await h.call(root, 'patch', `/api/v1/usuarios/${editor.id}`, { email: 'editor-nuevo@example.gov.co' })).status, 200);
    await assert.rejects(auth().resetPassword(oldToken, 'aurora violeta sobre montanas de noviembre', '127.0.0.1'), { status: 422 });
    assert.equal((await h.call(root, 'post', `/api/v1/usuarios/${editor.id}/mfa/restablecer`, {})).status, 200);
    assert.equal((await h.call(root, 'post', `/api/v1/usuarios/${editor.id}/invitacion`, {})).status, 200);
  });

  test('restablecer el MFA de otra persona revoca sus enlaces de recuperación pendientes', async () => {
    const admin = await h.createUser({ email: 'admin-mfa@example.gov.co', rol: 'administrador' });
    const root = await h.login(admin);
    const target = await h.createUser({ email: 'perdio-telefono@example.gov.co' });
    await auth().requestPasswordReset(target.email, '127.0.0.1');
    const token = lastToken();
    assert.equal((await h.call(root, 'post', `/api/v1/usuarios/${target.id}/mfa/restablecer`, {})).status, 200);
    await assert.rejects(auth().resetPassword(token, 'faro naranja sobre el puerto viejo', '127.0.0.1'), { status: 422 });
  });
});

describe('Enrolamiento del segundo factor (S-2, S-3)', () => {
  test('dos sesiones de primer ingreso no pueden sobrescribir el MFA de la otra, ni invocando el servicio', async () => {
    const u = await h.createUser({ email: 'enrolamiento@example.gov.co', mfa: false });
    const first = await pending(u);
    const stale = await pending(u);
    const setup1 = await h.call(first, 'post', '/api/v1/auth/mfa/configuracion', {});
    const setup2 = await h.call(stale, 'post', '/api/v1/auth/mfa/configuracion', {});
    assert.equal(setup1.status, 200);
    assert.equal(setup2.status, 200);

    const enable = await h.call(first, 'post', '/api/v1/auth/mfa/activar', { codigo: h.totp.generate(setup1.body.data.secretoManual) });
    assert.equal(enable.status, 200, JSON.stringify(enable.body));
    first.csrf = enable.body.data.csrfToken;
    const stored = (await user(u.id))?.mfaSecretoEnc;

    const secret2 = String(setup2.body.data.secretoManual);
    assert.equal((await h.call(stale, 'post', '/api/v1/auth/mfa/activar', { codigo: h.totp.generate(secret2) })).status, 401, 'sesión obsoleta');
    assert.equal((await h.call(stale, 'post', '/api/v1/auth/mfa/configuracion', {})).status, 401, 'sin nuevo QR');
    const version = (await user(u.id))?.authVersion;
    await assert.rejects(auth().confirmEnrollment(u.id, secret2, h.totp.generate(secret2), '127.0.0.1', { authVersion: version }), { status: 401 });
    await assert.rejects(auth().confirmEnrollment(u.id, secret2, h.totp.generate(secret2), '127.0.0.1'), { status: 401 }, 'sin versión');
    assert.equal((await user(u.id))?.mfaSecretoEnc, stored, 'el secreto no cambió');
    assert.equal((await h.call(first, 'get', '/api/v1/auth/sesion')).status, 200);
  });

  test('una cuenta desactivada durante el primer ingreso no puede completar el enrolamiento', async () => {
    const admin = await h.createUser({ email: 'admin-enrol@example.gov.co', rol: 'administrador' });
    const root = await h.login(admin);
    const u = await h.createUser({ email: 'desactivada-enrol@example.gov.co', mfa: false });
    const agent = await pending(u);
    const setup = await h.call(agent, 'post', '/api/v1/auth/mfa/configuracion', {});
    assert.equal(setup.status, 200);
    assert.equal((await h.call(root, 'patch', `/api/v1/usuarios/${u.id}`, { activo: false })).status, 200);
    const r = await h.call(agent, 'post', '/api/v1/auth/mfa/activar', { codigo: h.totp.generate(setup.body.data.secretoManual) });
    assert.equal(r.status, 401);
    assert.equal((await user(u.id))?.mfaActivo, false);
  });

  test('el cambio legítimo de dispositivo MFA conserva el acceso y cierra las demás sesiones', async () => {
    const u = await h.createUser({ email: 'cambio-dispositivo@example.gov.co' });
    const agent = await h.login(u);
    const other = await h.login(u);
    await h.db.run('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = $1', [u.id]); // el código del ingreso ya se consumió
    assert.equal((await h.call(agent, 'post', '/api/v1/cuenta/reautenticar', { password: u.password, codigo: h.totp.generate(u.secret) })).status, 200);
    const setup = await h.call(agent, 'post', '/api/v1/cuenta/mfa/configuracion', {});
    assert.equal(setup.status, 200);
    const enable = await h.call(agent, 'post', '/api/v1/cuenta/mfa/activar', { codigo: h.totp.generate(setup.body.data.secretoManual) });
    assert.equal(enable.status, 200, JSON.stringify(enable.body));
    agent.csrf = enable.body.data.csrfToken;
    assert.equal(enable.body.data.codigosRecuperacion.length, 10);
    assert.equal((await h.call(agent, 'get', '/api/v1/auth/sesion')).status, 200, 'conserva acceso');
    assert.equal((await h.call(other, 'get', '/api/v1/auth/sesion')).status, 401, 'la otra sesión se cerró');
  });
});

describe('Enlaces de recuperación (S-4)', () => {
  test('cambiar la contraseña revoca los enlaces previos; uno nuevo sí funciona y el MFA sigue exigido', async () => {
    const u: TestUser = await h.createUser({ email: 'enlace-viejo@example.gov.co' });
    await auth().requestPasswordReset(u.email, '127.0.0.1');
    const token = lastToken();
    await auth().changePassword(u.id, u.password, 'nubes plateadas sobre jardines del oriente', '127.0.0.1');
    await assert.rejects(auth().resetPassword(token, 'aves doradas recorren horizontes de invierno', '127.0.0.1'), { status: 422 });

    await auth().requestPasswordReset(u.email, '127.0.0.1');
    await auth().resetPassword(lastToken(), 'aves doradas recorren horizontes de invierno', '127.0.0.1');
    const agent = await pending({ email: u.email, password: 'aves doradas recorren horizontes de invierno' });
    assert.equal((await h.call(agent, 'get', '/api/v1/auth/sesion')).status, 401, 'falta el segundo factor');
  });

  test('restablecer con un enlace invalida los demás enlaces pendientes del mismo usuario', async () => {
    const u = await h.createUser({ email: 'dos-enlaces@example.gov.co' });
    await auth().requestPasswordReset(u.email, '127.0.0.1');
    const t1 = lastToken();
    await h.db.run("INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES ($1, $2, now() + interval '1 hour')", [
      u.id,
      'hash-de-una-invitacion-paralela',
    ]);
    await auth().resetPassword(t1, 'ballena azul en la bahia tranquila', '127.0.0.1');
    const pendientes = await h.db.scalar<number>('SELECT COUNT(*) FROM tokens_recuperacion WHERE usuario_id = $1 AND usado_en IS NULL', [u.id]);
    assert.equal(pendientes, 0);
  });
});

describe('Antimalware obligatorio (S-5)', () => {
  let hp: Harness;
  before(async () => {
    // Escáner configurado pero no ejecutable: equivale a un escáner caído.
    hp = await createHarness({ MALWARE_SCAN_COMMAND: '/ruta/inexistente/clamdscan' });
  });
  after(async () => hp?.close());

  test('si el escáner falla, la carga responde 503 MALWARE_SCAN_UNAVAILABLE y no se guarda nada', async () => {
    const admin = await hp.createUser({ email: 'admin-av@example.gov.co', rol: 'administrador' });
    const agent = await hp.login(admin);
    const before = await hp.db.scalar<number>('SELECT COUNT(*) FROM medios');
    const r = await agent
      .post('/api/v1/medios')
      .set('X-CSRF-Token', String(agent.csrf))
      .attach('archivos', await pngBuffer(), 'foto.png');
    assert.equal(r.status, 503, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'MALWARE_SCAN_UNAVAILABLE');
    assert.equal(await hp.db.scalar<number>('SELECT COUNT(*) FROM medios'), before);
    assert.equal((await request(hp.app.getHttpServer()).get('/health/live')).status, 200, 'el resto del portal sigue disponible');
  });
});
