/** Autorización: visitante, editor, administrador, reglas de usuarios/roles y CSRF (ASVS V4). */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { RoleRepository, UserRepository } from '../../src/infrastructure/repositories/identity.repositories';
import { ROUTES } from '../../src/presentation/http/route-spec';
import { createHarness, type Agent, type Harness, type TestUser } from '../support/harness';

let h: Harness;
let admin: TestUser;
let editor: TestUser;
let adminAgent: Agent;
let editorAgent: Agent;

before(async () => {
  h = await createHarness();
  admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
  editor = await h.createUser({ email: 'editor@example.gov.co', rol: 'editor' });
  adminAgent = await h.login(admin);
  editorAgent = await h.login(editor);
});
after(async () => h?.close());

const API = () => ROUTES.filter((r) => r.kind === 'api');
const fill = (p: string) => p.replace(/{[^}]+}/g, '1');
const role = async (slug: string) => (await h.get(RoleRepository).findBySlug(slug))!;
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('Visitante (sin sesión)', () => {
  test('ningún endpoint privado responde a un visitante', async () => {
    const privateRoutes = API().filter((r) => r.auth !== 'public');
    assert.ok(privateRoutes.length > 50, `rutas privadas: ${privateRoutes.length}`);
    for (const r of privateRoutes) {
      const res = await request(h.app.getHttpServer())[r.method](fill(r.path)).set('Accept', 'application/json');
      assert.ok([401, 403].includes(res.status), `${r.method.toUpperCase()} ${r.path} devolvió ${res.status}`);
    }
  });

  test('el panel redirige al ingreso y la documentación completa de la API está protegida', async () => {
    const srv = () => request(h.app.getHttpServer());
    assert.equal((await srv().get('/admin')).headers.location, '/admin/login');
    assert.equal((await srv().get('/admin/noticias')).headers.location, '/admin/login');
    assert.equal((await srv().get('/api/v1/openapi.json').set('Accept', 'application/json')).status, 401);
    assert.equal((await srv().get('/admin/api-docs')).status, 302);
    assert.equal((await srv().get('/admin/vista-previa/paginas/1').set('Accept', 'application/json')).status, 401);
    assert.equal((await srv().get('/api/v1/sistema/metricas').set('Accept', 'application/json')).status, 401);
  });

  test('la salud no revela información sensible', async () => {
    const res = await request(h.app.getHttpServer()).get('/health/ready');
    assert.deepEqual(Object.keys(res.body), ['estado']);
  });
});

describe('Matriz de permisos del rol Editor', () => {
  const ALLOWED: Array<[M, string]> = [
    ['get', '/noticias'],
    ['get', '/paginas'],
    ['get', '/medios'],
    ['get', '/sliders'],
    ['get', '/documentos'],
    ['get', '/auth/sesion'],
  ];
  const FORBIDDEN: Array<[M, string, unknown?]> = [
    ['get', '/usuarios'],
    ['post', '/usuarios', { email: 'x@example.gov.co', nombre: 'Equis', rolId: 1 }],
    ['get', '/roles'],
    ['get', '/permisos'],
    ['post', '/roles', { nombre: 'Escalada', permisos: ['users.read'] }],
    ['get', '/estadisticas'],
    ['get', '/auditoria'],
    ['get', '/sistema/metricas'],
    ['get', '/pqrsd'],
    ['delete', '/noticias/1'],
    ['delete', '/paginas/1'],
    ['delete', '/medios/1'],
    ['delete', '/sliders/1'],
    ['delete', '/documentos/1'],
    ['delete', '/sliders/1/diapositivas/1'],
    ['patch', '/usuarios/1', { rolId: 1 }],
    ['post', '/usuarios/1/mfa/restablecer'],
  ];

  test('puede acceder a contenidos y multimedia', async () => {
    for (const [m, p] of ALLOWED) assert.equal((await h.call(editorAgent, m, `/api/v1${p}`)).status, 200, `${m} ${p}`);
  });

  test('no puede ejecutar operaciones administrativas ni eliminar definitivamente (403 en la API, no solo en la interfaz)', async () => {
    for (const [m, p, body] of FORBIDDEN) {
      const res = await h.call(editorAgent, m, `/api/v1${p}`, body);
      assert.equal(res.status, 403, `${m.toUpperCase()} ${p} devolvió ${res.status}`);
    }
  });

  test('no puede cambiar su propio rol enviando campos extra a su perfil', async () => {
    const adminRole = await role('administrador');
    const res = await h.call(editorAgent, 'patch', '/api/v1/cuenta/perfil', { nombre: 'Editor', rolId: adminRole.id });
    assert.equal(res.status, 422, 'el esquema estricto rechaza campos no permitidos');
    assert.equal((await h.get(UserRepository).findById(editor.id))?.rolSlug, 'editor');
  });

  test('los accesos denegados quedan en la auditoría', async () => {
    await h.call(editorAgent, 'get', '/api/v1/usuarios');
    const res = await h.call(adminAgent, 'get', '/api/v1/auditoria').query({ resultado: 'denegado' });
    assert.ok(res.body.data.some((e: { usuarioEmail: string; accion: string }) => e.usuarioEmail === editor.email && e.accion === 'acceso_denegado'));
  });
});

describe('Reglas de usuarios y roles', () => {
  test('no se puede desactivar ni eliminar al último administrador activo', async () => {
    assert.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: false })).status, 403);
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/usuarios/${admin.id}`)).status, 403);
    const admin2 = await h.createUser({ email: 'admin2@example.gov.co', rol: 'administrador' });
    const a2 = await h.login(admin2);
    assert.equal((await h.call(a2, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: false })).status, 200);
    assert.equal((await h.call(adminAgent, 'get', '/api/v1/usuarios')).status, 401, 'la sesión del desactivado se revocó');
    assert.equal((await h.call(a2, 'delete', `/api/v1/usuarios/${admin2.id}`)).status, 403, 'no puede eliminarse a sí mismo');
    const editorRole = await role('editor');
    assert.equal((await h.call(a2, 'patch', `/api/v1/usuarios/${admin2.id}`, { rolId: editorRole.id })).status, 403, 'no puede cambiar su propio rol');
    assert.equal((await h.call(a2, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: true })).status, 200);
    adminAgent = await h.login(admin);
    assert.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${admin2.id}`, { activo: false })).status, 200);
    const last = await h.call(adminAgent, 'patch', `/api/v1/usuarios/${admin.id}`, { rolId: editorRole.id });
    assert.equal(last.status, 403);
  });

  test('dos administradores no pueden desactivarse mutuamente a la vez (siempre queda uno)', async () => {
    const x = await h.createUser({ email: 'adminx@example.gov.co', rol: 'administrador' });
    const y = await h.createUser({ email: 'adminy@example.gov.co', rol: 'administrador' });
    // Deja solo a x e y como administradores activos.
    await h.db.run("UPDATE usuarios SET activo = false WHERE rol_id = (SELECT id FROM roles WHERE slug = 'administrador') AND id NOT IN ($1, $2)", [x.id, y.id]);
    const [ax, ay] = [await h.login(x), await h.login(y)];
    const [r1, r2] = await Promise.all([
      h.call(ax, 'patch', `/api/v1/usuarios/${y.id}`, { activo: false }),
      h.call(ay, 'patch', `/api/v1/usuarios/${x.id}`, { activo: false }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.ok(statuses.includes(200), JSON.stringify(statuses));
    const active = await h.db.scalar<number>("SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.slug = 'administrador' AND u.activo");
    assert.ok(active >= 1, 'siempre queda al menos un administrador activo');
    await h.db.run("UPDATE usuarios SET activo = true WHERE rol_id = (SELECT id FROM roles WHERE slug = 'administrador')");
    adminAgent = await h.login(admin);
  });

  test('crear usuario envía invitación y no devuelve hashes ni secretos', async () => {
    const res = await h.call(adminAgent, 'post', '/api/v1/usuarios', { email: 'invitado@example.gov.co', nombre: 'Persona Invitada', rolId: (await role('editor')).id });
    assert.equal(res.status, 201);
    assert.doesNotMatch(JSON.stringify(res.body), /argon2|password|secreto|token/i);
    assert.equal(res.body.data.mfaConfigurado, false);
    const dup = await h.call(adminAgent, 'post', '/api/v1/usuarios', { email: 'INVITADO@example.gov.co', nombre: 'Duplicado', rolId: (await role('editor')).id });
    assert.equal(dup.status, 409, 'el correo es único sin distinguir mayúsculas');
  });

  test('roles: permisos inexistentes rechazados, rol admin inmutable, no se elimina un rol con usuarios', async () => {
    assert.equal((await h.call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Inválido', permisos: ['todo.poder'] })).status, 422);
    const adminRole = await role('administrador');
    assert.equal((await h.call(adminAgent, 'patch', `/api/v1/roles/${adminRole.id}`, { permisos: ['dashboard.access'] })).status, 403);
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/roles/${adminRole.id}`)).status, 403);

    const created = await h.call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Comunicaciones', permisos: ['news.read', 'news.update'] });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.permisos.includes('dashboard.access'));
    const u = await h.createUser({ email: 'comunicaciones@example.gov.co', rol: 'comunicaciones' });
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/roles/${created.body.data.id}`)).status, 409);
    const ua = await h.login(u);
    assert.equal((await h.call(ua, 'get', '/api/v1/noticias')).status, 200);
    assert.equal((await h.call(ua, 'get', '/api/v1/paginas')).status, 403);
    await h.call(adminAgent, 'patch', `/api/v1/roles/${created.body.data.id}`, { permisos: ['pages.read'] });
    assert.equal((await h.call(ua, 'get', '/api/v1/noticias')).status, 401);
    const ua2 = await h.login(u);
    assert.equal((await h.call(ua2, 'get', '/api/v1/noticias')).status, 403);
    assert.equal((await h.call(ua2, 'get', '/api/v1/paginas')).status, 200);
  });

  test('un rol con permisos de usuarios no puede asignar un rol con más permisos (sin escalada)', async () => {
    const r = await h.call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Talento Humano', permisos: ['users.read', 'users.update', 'users.create'] });
    const rrhh = await h.createUser({ email: 'rrhh@example.gov.co', rol: r.body.data.slug });
    const target = await h.createUser({ email: 'objetivo@example.gov.co' });
    const ra = await h.login(rrhh);
    const adminRole = await role('administrador');
    assert.equal((await h.call(ra, 'patch', `/api/v1/usuarios/${target.id}`, { rolId: adminRole.id })).status, 403);
    assert.equal((await h.call(ra, 'patch', `/api/v1/usuarios/${rrhh.id}`, { rolId: adminRole.id })).status, 403);
    assert.equal((await h.call(ra, 'post', '/api/v1/usuarios', { email: 'nuevoadmin@example.gov.co', nombre: 'Nuevo Admin', rolId: adminRole.id })).status, 403);
  });

  test('edición simultánea de un usuario: la versión antigua recibe 409 EDIT_CONFLICT', async () => {
    const u = await h.createUser({ email: 'version@example.gov.co' });
    const v = (await h.call(adminAgent, 'get', `/api/v1/usuarios/${u.id}`)).body.data.version;
    assert.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${u.id}`, { nombre: 'Primera edición', version: v })).status, 200);
    const stale = await h.call(adminAgent, 'patch', `/api/v1/usuarios/${u.id}`, { nombre: 'Edición vieja', version: v });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'EDIT_CONFLICT');
    assert.equal(stale.body.error.details.versionActual, v + 1);
  });
});

describe('CSRF', () => {
  test('sin token, con token de otra sesión o desde otro origen: 403', async () => {
    const noToken = await editorAgent.post('/api/v1/noticias').send({});
    assert.equal(noToken.status, 403);
    const other = await h.login(await h.createUser({ email: 'csrf@example.gov.co' }));
    const wrong = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', String(other.csrf)).send({});
    assert.equal(wrong.status, 403);
    const cross = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', String(editorAgent.csrf)).set('Origin', 'https://sitio-malicioso.example').send({});
    assert.equal(cross.status, 403);
  });

  test('GET no modifica datos: los endpoints de modificación no aceptan GET', async () => {
    for (const r of API().filter((x) => x.method !== 'get')) {
      if (API().some((x) => x.method === 'get' && x.path === r.path)) continue;
      const res = await h.call(adminAgent, 'get', fill(r.path));
      assert.equal(res.status, 404, `GET ${r.path} no debe existir`);
    }
  });
});
