"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Autorización: visitante, editor, administrador, reglas de usuarios/roles y CSRF (ASVS V4). */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const supertest_1 = __importDefault(require("supertest"));
const identity_repositories_1 = require("../../src/infrastructure/repositories/identity.repositories");
const route_spec_1 = require("../../src/presentation/http/route-spec");
const harness_1 = require("../support/harness");
let h;
let admin;
let editor;
let adminAgent;
let editorAgent;
(0, node_test_1.before)(async () => {
    h = await (0, harness_1.createHarness)();
    admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
    editor = await h.createUser({ email: 'editor@example.gov.co', rol: 'editor' });
    adminAgent = await h.login(admin);
    editorAgent = await h.login(editor);
});
(0, node_test_1.after)(async () => h?.close());
const API = () => route_spec_1.ROUTES.filter((r) => r.kind === 'api');
const fill = (p) => p.replace(/{[^}]+}/g, '1');
const role = async (slug) => (await h.get(identity_repositories_1.RoleRepository).findBySlug(slug));
(0, node_test_1.describe)('Visitante (sin sesión)', () => {
    (0, node_test_1.test)('ningún endpoint privado responde a un visitante', async () => {
        const privateRoutes = API().filter((r) => r.auth !== 'public');
        strict_1.default.ok(privateRoutes.length > 50, `rutas privadas: ${privateRoutes.length}`);
        for (const r of privateRoutes) {
            const res = await (0, supertest_1.default)(h.app.getHttpServer())[r.method](fill(r.path)).set('Accept', 'application/json');
            strict_1.default.ok([401, 403].includes(res.status), `${r.method.toUpperCase()} ${r.path} devolvió ${res.status}`);
        }
    });
    (0, node_test_1.test)('el panel redirige al ingreso y la documentación completa de la API está protegida', async () => {
        const srv = () => (0, supertest_1.default)(h.app.getHttpServer());
        strict_1.default.equal((await srv().get('/admin')).headers.location, '/admin/login');
        strict_1.default.equal((await srv().get('/admin/noticias')).headers.location, '/admin/login');
        strict_1.default.equal((await srv().get('/api/v1/openapi.json').set('Accept', 'application/json')).status, 401);
        strict_1.default.equal((await srv().get('/admin/api-docs')).status, 302);
        strict_1.default.equal((await srv().get('/admin/vista-previa/paginas/1').set('Accept', 'application/json')).status, 401);
        strict_1.default.equal((await srv().get('/api/v1/sistema/metricas').set('Accept', 'application/json')).status, 401);
    });
    (0, node_test_1.test)('la salud no revela información sensible', async () => {
        const res = await (0, supertest_1.default)(h.app.getHttpServer()).get('/health/ready');
        strict_1.default.deepEqual(Object.keys(res.body), ['estado']);
    });
});
(0, node_test_1.describe)('Matriz de permisos del rol Editor', () => {
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
    (0, node_test_1.test)('puede acceder a contenidos y multimedia', async () => {
        for (const [m, p] of ALLOWED)
            strict_1.default.equal((await h.call(editorAgent, m, `/api/v1${p}`)).status, 200, `${m} ${p}`);
    });
    (0, node_test_1.test)('no puede ejecutar operaciones administrativas ni eliminar definitivamente (403 en la API, no solo en la interfaz)', async () => {
        for (const [m, p, body] of FORBIDDEN) {
            const res = await h.call(editorAgent, m, `/api/v1${p}`, body);
            strict_1.default.equal(res.status, 403, `${m.toUpperCase()} ${p} devolvió ${res.status}`);
        }
    });
    (0, node_test_1.test)('no puede cambiar su propio rol enviando campos extra a su perfil', async () => {
        const adminRole = await role('administrador');
        const res = await h.call(editorAgent, 'patch', '/api/v1/cuenta/perfil', { nombre: 'Editor', rolId: adminRole.id });
        strict_1.default.equal(res.status, 422, 'el esquema estricto rechaza campos no permitidos');
        strict_1.default.equal((await h.get(identity_repositories_1.UserRepository).findById(editor.id))?.rolSlug, 'editor');
    });
    (0, node_test_1.test)('los accesos denegados quedan en la auditoría', async () => {
        await h.call(editorAgent, 'get', '/api/v1/usuarios');
        const res = await h.call(adminAgent, 'get', '/api/v1/auditoria').query({ resultado: 'denegado' });
        strict_1.default.ok(res.body.data.some((e) => e.usuarioEmail === editor.email && e.accion === 'acceso_denegado'));
    });
});
(0, node_test_1.describe)('Reglas de usuarios y roles', () => {
    (0, node_test_1.test)('no se puede desactivar ni eliminar al último administrador activo', async () => {
        strict_1.default.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: false })).status, 403);
        strict_1.default.equal((await h.call(adminAgent, 'delete', `/api/v1/usuarios/${admin.id}`)).status, 403);
        const admin2 = await h.createUser({ email: 'admin2@example.gov.co', rol: 'administrador' });
        const a2 = await h.login(admin2);
        strict_1.default.equal((await h.call(a2, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: false })).status, 200);
        strict_1.default.equal((await h.call(adminAgent, 'get', '/api/v1/usuarios')).status, 401, 'la sesión del desactivado se revocó');
        strict_1.default.equal((await h.call(a2, 'delete', `/api/v1/usuarios/${admin2.id}`)).status, 403, 'no puede eliminarse a sí mismo');
        const editorRole = await role('editor');
        strict_1.default.equal((await h.call(a2, 'patch', `/api/v1/usuarios/${admin2.id}`, { rolId: editorRole.id })).status, 403, 'no puede cambiar su propio rol');
        strict_1.default.equal((await h.call(a2, 'patch', `/api/v1/usuarios/${admin.id}`, { activo: true })).status, 200);
        adminAgent = await h.login(admin);
        strict_1.default.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${admin2.id}`, { activo: false })).status, 200);
        const last = await h.call(adminAgent, 'patch', `/api/v1/usuarios/${admin.id}`, { rolId: editorRole.id });
        strict_1.default.equal(last.status, 403);
    });
    (0, node_test_1.test)('dos administradores no pueden desactivarse mutuamente a la vez (siempre queda uno)', async () => {
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
        strict_1.default.ok(statuses.includes(200), JSON.stringify(statuses));
        const active = await h.db.scalar("SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.slug = 'administrador' AND u.activo");
        strict_1.default.ok(active >= 1, 'siempre queda al menos un administrador activo');
        await h.db.run("UPDATE usuarios SET activo = true WHERE rol_id = (SELECT id FROM roles WHERE slug = 'administrador')");
        adminAgent = await h.login(admin);
    });
    (0, node_test_1.test)('crear usuario envía invitación y no devuelve hashes ni secretos', async () => {
        const res = await h.call(adminAgent, 'post', '/api/v1/usuarios', { email: 'invitado@example.gov.co', nombre: 'Persona Invitada', rolId: (await role('editor')).id });
        strict_1.default.equal(res.status, 201);
        strict_1.default.doesNotMatch(JSON.stringify(res.body), /argon2|password|secreto|token/i);
        strict_1.default.equal(res.body.data.mfaConfigurado, false);
        const dup = await h.call(adminAgent, 'post', '/api/v1/usuarios', { email: 'INVITADO@example.gov.co', nombre: 'Duplicado', rolId: (await role('editor')).id });
        strict_1.default.equal(dup.status, 409, 'el correo es único sin distinguir mayúsculas');
    });
    (0, node_test_1.test)('roles: permisos inexistentes rechazados, rol admin inmutable, no se elimina un rol con usuarios', async () => {
        strict_1.default.equal((await h.call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Inválido', permisos: ['todo.poder'] })).status, 422);
        const adminRole = await role('administrador');
        strict_1.default.equal((await h.call(adminAgent, 'patch', `/api/v1/roles/${adminRole.id}`, { permisos: ['dashboard.access'] })).status, 403);
        strict_1.default.equal((await h.call(adminAgent, 'delete', `/api/v1/roles/${adminRole.id}`)).status, 403);
        const created = await h.call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Comunicaciones', permisos: ['news.read', 'news.update'] });
        strict_1.default.equal(created.status, 201);
        strict_1.default.ok(created.body.data.permisos.includes('dashboard.access'));
        const u = await h.createUser({ email: 'comunicaciones@example.gov.co', rol: 'comunicaciones' });
        strict_1.default.equal((await h.call(adminAgent, 'delete', `/api/v1/roles/${created.body.data.id}`)).status, 409);
        const ua = await h.login(u);
        strict_1.default.equal((await h.call(ua, 'get', '/api/v1/noticias')).status, 200);
        strict_1.default.equal((await h.call(ua, 'get', '/api/v1/paginas')).status, 403);
        await h.call(adminAgent, 'patch', `/api/v1/roles/${created.body.data.id}`, { permisos: ['pages.read'] });
        strict_1.default.equal((await h.call(ua, 'get', '/api/v1/noticias')).status, 401);
        const ua2 = await h.login(u);
        strict_1.default.equal((await h.call(ua2, 'get', '/api/v1/noticias')).status, 403);
        strict_1.default.equal((await h.call(ua2, 'get', '/api/v1/paginas')).status, 200);
    });
    (0, node_test_1.test)('un rol con permisos de usuarios no puede asignar un rol con más permisos (sin escalada)', async () => {
        const r = await h.call(adminAgent, 'post', '/api/v1/roles', { nombre: 'Talento Humano', permisos: ['users.read', 'users.update', 'users.create'] });
        const rrhh = await h.createUser({ email: 'rrhh@example.gov.co', rol: r.body.data.slug });
        const target = await h.createUser({ email: 'objetivo@example.gov.co' });
        const ra = await h.login(rrhh);
        const adminRole = await role('administrador');
        strict_1.default.equal((await h.call(ra, 'patch', `/api/v1/usuarios/${target.id}`, { rolId: adminRole.id })).status, 403);
        strict_1.default.equal((await h.call(ra, 'patch', `/api/v1/usuarios/${rrhh.id}`, { rolId: adminRole.id })).status, 403);
        strict_1.default.equal((await h.call(ra, 'post', '/api/v1/usuarios', { email: 'nuevoadmin@example.gov.co', nombre: 'Nuevo Admin', rolId: adminRole.id })).status, 403);
    });
    (0, node_test_1.test)('edición simultánea de un usuario: la versión antigua recibe 409 EDIT_CONFLICT', async () => {
        const u = await h.createUser({ email: 'version@example.gov.co' });
        const v = (await h.call(adminAgent, 'get', `/api/v1/usuarios/${u.id}`)).body.data.version;
        strict_1.default.equal((await h.call(adminAgent, 'patch', `/api/v1/usuarios/${u.id}`, { nombre: 'Primera edición', version: v })).status, 200);
        const stale = await h.call(adminAgent, 'patch', `/api/v1/usuarios/${u.id}`, { nombre: 'Edición vieja', version: v });
        strict_1.default.equal(stale.status, 409);
        strict_1.default.equal(stale.body.error.code, 'EDIT_CONFLICT');
        strict_1.default.equal(stale.body.error.details.versionActual, v + 1);
    });
});
(0, node_test_1.describe)('CSRF', () => {
    (0, node_test_1.test)('sin token, con token de otra sesión o desde otro origen: 403', async () => {
        const noToken = await editorAgent.post('/api/v1/noticias').send({});
        strict_1.default.equal(noToken.status, 403);
        const other = await h.login(await h.createUser({ email: 'csrf@example.gov.co' }));
        const wrong = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', String(other.csrf)).send({});
        strict_1.default.equal(wrong.status, 403);
        const cross = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', String(editorAgent.csrf)).set('Origin', 'https://sitio-malicioso.example').send({});
        strict_1.default.equal(cross.status, 403);
    });
    (0, node_test_1.test)('GET no modifica datos: los endpoints de modificación no aceptan GET', async () => {
        for (const r of API().filter((x) => x.method !== 'get')) {
            if (API().some((x) => x.method === 'get' && x.path === r.path))
                continue;
            const res = await h.call(adminAgent, 'get', fill(r.path));
            strict_1.default.equal(res.status, 404, `GET ${r.path} no debe existir`);
        }
    });
});
//# sourceMappingURL=authorization.test.js.map