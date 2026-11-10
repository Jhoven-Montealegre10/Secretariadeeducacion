'use strict';
/** Autorización: visitante, editor, administrador, reglas de usuarios/roles y CSRF (ASVS V4). */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, createUser, login, call, roleRepository, userRepository } = require('./helpers');
const { routes } = require('../src/presentation/http/api/openapi');

let admin, editor, adminAgent, editorAgent;
before(async () => {
  admin = await createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
  editor = await createUser({ email: 'editor@example.gov.co', rol: 'editor' });
  adminAgent = await login(admin);
  editorAgent = await login(editor);
});

const fill = (path) => path.replace('/api/v1', '').replace(/{[^}]+}/g, '1');

describe('Visitante (sin sesión)', () => {
  test('ningún endpoint privado responde a un visitante', async () => {
    const privateRoutes = routes.filter((r) => r.auth !== 'public');
    assert.ok(privateRoutes.length > 35);
    for (const r of privateRoutes) {
      const client = request(app);
      const res = await client[r.method](`/api/v1${fill(r.path)}`).set('Accept', 'application/json');
      assert.ok([401, 403].includes(res.status), `${r.method.toUpperCase()} ${r.path} devolvió ${res.status}`);
    }
  });

  test('el panel redirige al ingreso y la documentación completa de la API está protegida', async () => {
    assert.equal((await request(app).get('/admin')).headers.location, '/admin/login');
    assert.equal((await request(app).get('/admin/noticias')).headers.location, '/admin/login');
    assert.equal((await request(app).get('/api/v1/openapi.json').set('Accept', 'application/json')).status, 401);
    assert.equal((await request(app).get('/admin/api-docs')).status, 302);
    assert.equal((await request(app).get('/admin/vista-previa/paginas/1').set('Accept', 'application/json')).status, 401);
  });
});

describe('Matriz de permisos del rol Editor', () => {
  const ALLOWED = [
    ['get', '/noticias'],
    ['get', '/paginas'],
    ['get', '/medios'],
    ['get', '/sliders'],
    ['get', '/documentos'],
    ['get', '/auth/sesion'],
  ];
  const FORBIDDEN = [
    ['get', '/usuarios'],
    ['post', '/usuarios', { email: 'x@example.gov.co', nombre: 'Equis', rolId: 1 }],
    ['get', '/roles'],
    ['get', '/permisos'],
    ['post', '/roles', { nombre: 'Escalada', permisos: ['users.read'] }],
    ['get', '/estadisticas'],
    ['get', '/auditoria'],
    ['get', '/pqrsd'],
    ['delete', '/noticias/1'],
    ['delete', '/paginas/1'],
    ['delete', '/medios/1'],
    ['delete', '/sliders/1'],
    ['delete', '/documentos/1'],
    ['delete', '/sliders/1/diapositivas/1'],
    ['patch', `/usuarios/1`, { rolId: 1 }],
    ['post', '/usuarios/1/mfa/restablecer'],
  ];

  test('puede acceder a contenidos y multimedia', async () => {
    for (const [m, p] of ALLOWED) assert.equal((await call(editorAgent, m, `/api/v1${p}`)).status, 200, `${m} ${p}`);
  });

  test('no puede ejecutar operaciones administrativas ni eliminar definitivamente (403 en la API, no solo en la interfaz)', async () => {
    for (const [m, p, body] of FORBIDDEN) {
      const res = await call(editorAgent, m, `/api/v1${p}`, body);
      assert.equal(res.status, 403, `${m.toUpperCase()} ${p} devolvió ${res.status}`);
    }
  });

  test('no puede cambiar su propio rol enviando campos extra a su perfil', async () => {
    const adminRole = roleRepository.findBySlug('administrador');
    const res = await call(editorAgent, 'patch', '/api/v1/cuenta/perfil', { nombre: 'Editor', rolId: adminRole.id });
    assert.equal(res.status, 422, 'el esquema estricto rechaza campos no permitidos');
    assert.equal(userRepository.findById(editor.id).rolSlug, 'editor');
  });

  test('los accesos denegados quedan en la auditoría', async () => {
    await call(editorAgent, 'get', '/api/v1/usuarios');
    const res = await call(adminAgent, 'get', '/api/v1/auditoria', undefined).query({ resultado: 'denegado' });
    assert.ok(res.body.data.some((e) => e.usuarioEmail === editor.email && e.accion === 'acceso_denegado'));
  });
});

describe('Reglas de usuarios y roles', () => {
  test('no se puede desactivar ni eliminar al último administrador activo', async () => {
    const solo = await createUser({ email: 'otro-editor@example.gov.co' });
    assert.ok(solo);
    // El único admin intenta desactivarse / eliminarse
    assert.equal((await call(adminAgent, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: false })).status, 403);
    assert.equal((await call(adminAgent, 'delete', `/api/v1/usuarios/${admin.id}`)).status, 403);
    // Un segundo admin no puede desactivar al primero si eso dejara... (hay 2: sí puede), pero no al último
    const admin2 = await createUser({ email: 'admin2@example.gov.co', rol: 'administrador' });
    const a2 = await login(admin2);
    assert.equal((await call(a2, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: false })).status, 200);
    assert.equal((await call(adminAgent, 'get', '/api/v1/usuarios')).status, 401, 'la sesión del desactivado se revocó');
    assert.equal((await call(a2, 'delete', `/api/v1/usuarios/${admin2.id}`)).status, 403, 'no puede eliminarse a sí mismo');
    const res = await call(a2, 'patch', `/api/v1/usuarios/${admin2.id}`, { rolId: roleRepository.findBySlug('editor').id });
    assert.equal(res.status, 403, 'no puede cambiar su propio rol');
    // Reactiva al primero para el resto de pruebas
    assert.equal((await call(a2, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: true })).status, 200);
    adminAgent = await login(admin);
    assert.equal((await call(adminAgent, 'patch', `/api/v1/usuarios/${admin2.id}`, { activo: false })).status, 200);
    const last = await call(adminAgent, 'patch', `/api/v1/usuarios/${admin.id}`, { rolId: roleRepository.findBySlug('editor').id });
    assert.equal(last.status, 403);
  });

  test('crear usuario envía invitación y no devuelve hashes ni secretos', async () => {
    const res = await call(adminAgent, 'post', '/api/v1/usuarios', {
      email: 'invitado@example.gov.co',
      nombre: 'Persona Invitada',
      rolId: roleRepository.findBySlug('editor').id,
    });
    assert.equal(res.status, 201);
    const text = JSON.stringify(res.body);
    assert.doesNotMatch(text, /argon2|password|secreto|token/i);
    assert.equal(res.body.data.mfaConfigurado, false);
  });

  test('roles: permisos inexistentes rechazados, rol admin inmutable, no se elimina un rol con usuarios', async () => {
    assert.equal((await call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Inválido', permisos: ['todo.poder'] })).status, 422);
    const adminRole = roleRepository.findBySlug('administrador');
    assert.equal((await call(adminAgent, 'patch', `/api/v1/roles/${adminRole.id}`, { permisos: ['dashboard.access'] })).status, 403);
    assert.equal((await call(adminAgent, 'delete', `/api/v1/roles/${adminRole.id}`)).status, 403);

    const created = await call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Comunicaciones', permisos: ['news.read', 'news.update'] });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.permisos.includes('dashboard.access'));
    const u = await createUser({ email: 'comunicaciones@example.gov.co', rol: 'comunicaciones' });
    assert.equal((await call(adminAgent, 'delete', `/api/v1/roles/${created.body.data.id}`)).status, 409);
    const ua = await login(u);
    assert.equal((await call(ua, 'get', '/api/v1/noticias')).status, 200);
    assert.equal((await call(ua, 'get', '/api/v1/paginas')).status, 403);
    // Cambiar permisos del rol revoca/revalida sesiones de sus usuarios
    await call(adminAgent, 'patch', `/api/v1/roles/${created.body.data.id}`, { permisos: ['pages.read'] });
    assert.equal((await call(ua, 'get', '/api/v1/noticias')).status, 401);
    const ua2 = await login(u);
    assert.equal((await call(ua2, 'get', '/api/v1/noticias')).status, 403);
    assert.equal((await call(ua2, 'get', '/api/v1/paginas')).status, 200);
  });

  test('un rol con permisos de usuarios no puede asignar un rol con más permisos (sin escalada)', async () => {
    const r = await call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Talento Humano', permisos: ['users.read', 'users.update', 'users.create'] });
    const rrhh = await createUser({ email: 'rrhh@example.gov.co', rol: r.body.data.slug });
    const target = await createUser({ email: 'objetivo@example.gov.co' });
    const ra = await login(rrhh);
    const adminRole = roleRepository.findBySlug('administrador');
    assert.equal((await call(ra, 'patch', `/api/v1/usuarios/${target.id}`, { rolId: adminRole.id })).status, 403);
    assert.equal((await call(ra, 'patch', `/api/v1/usuarios/${rrhh.id}`, { rolId: adminRole.id })).status, 403);
    assert.equal((await call(ra, 'post', '/api/v1/usuarios', { email: 'nuevoadmin@example.gov.co', nombre: 'Nuevo Admin', rolId: adminRole.id })).status, 403);
  });
});

describe('CSRF', () => {
  test('sin token, con token de otra sesión o desde otro origen: 403', async () => {
    const noToken = await editorAgent.post('/api/v1/noticias').send({});
    assert.equal(noToken.status, 403);
    const other = await login(await createUser({ email: 'csrf@example.gov.co' }));
    const wrong = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', other.csrf).send({});
    assert.equal(wrong.status, 403);
    const cross = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', editorAgent.csrf).set('Origin', 'https://sitio-malicioso.example').send({});
    assert.equal(cross.status, 403);
  });

  test('GET no modifica datos: los endpoints de modificación no aceptan GET', async () => {
    for (const r of routes.filter((x) => x.method !== 'get')) {
      const sameGet = routes.some((x) => x.method === 'get' && x.path === r.path);
      if (sameGet) continue;
      const res = await call(adminAgent, 'get', `/api/v1${fill(r.path)}`);
      assert.equal(res.status, 404, `GET ${r.path} no debe existir`);
    }
  });
});
