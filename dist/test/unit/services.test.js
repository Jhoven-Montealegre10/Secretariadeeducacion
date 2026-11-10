"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Servicios de aplicación con dependencias aisladas (repositorios y auditoría simulados):
 * autorización, reglas de negocio, validaciones y conflictos. Casos exitosos, inválidos y no autorizados.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const content_services_1 = require("../../src/application/content.services");
const identity_services_1 = require("../../src/application/identity.services");
const permissions_1 = require("../../src/domain/permissions");
const fake = (o) => o;
const fakeDb = fake({ transaction: async (fn) => fn(), afterCommit: () => undefined });
const audit = { events: [], record: async (e) => void audit.events.push(e.accion) };
const auditSvc = audit;
const cache = fake({ invalidate: () => undefined, get: async (_k, l) => l() });
function actor(perms, over = {}) {
    return { id: 1, email: 'a@example.gov.co', nombre: 'A', rolId: 1, rolSlug: 'administrador', rolNombre: 'Administrador', permisos: new Set(perms), authVersion: 1, ...over };
}
const ADMIN = actor(permissions_1.TODOS);
const EDITOR = actor(permissions_1.PERMISOS_EDITOR, { id: 2, rolId: 2, rolSlug: 'editor', rolNombre: 'Editor' });
function role(id, slug, permisos, extra = {}) {
    return { id, slug, nombre: slug, descripcion: '', sistema: false, version: 1, creadoEn: '', actualizadoEn: '', totalUsuarios: 0, permisos: [...permisos], ...extra };
}
function user(id, over = {}) {
    return {
        id,
        email: `u${id}@example.gov.co`,
        nombre: `Usuario ${id}`,
        rolId: 2,
        rolSlug: 'editor',
        rolNombre: 'Editor',
        activo: true,
        passwordHash: 'x',
        intentosFallidos: 0,
        bloqueadoHasta: null,
        ultimoAcceso: null,
        mfaSecretoEnc: null,
        mfaActivo: true,
        mfaUltimoPaso: 0,
        mfaIntentosFallidos: 0,
        authVersion: 1,
        passwordActualizadaEn: '',
        version: 3,
        creadoEn: '',
        actualizadoEn: '',
        ...over,
    };
}
(0, node_test_1.describe)('UserService', () => {
    let users;
    let invited;
    let svc;
    const roles = new Map([
        [1, role(1, 'administrador', permissions_1.TODOS, { sistema: true })],
        [2, role(2, 'editor', permissions_1.PERMISOS_EDITOR, { sistema: true })],
    ]);
    (0, node_test_1.beforeEach)(() => {
        users = new Map([
            [1, user(1, { rolId: 1, rolSlug: 'administrador' })],
            [5, user(5)],
        ]);
        invited = [];
        audit.events = [];
        const repo = fake({
            findById: async (id) => users.get(id) ?? null,
            findByEmail: async (e) => [...users.values()].find((u) => u.email === e.toLowerCase()) ?? null,
            create: async (d) => {
                users.set(9, user(9, { email: d.email, rolId: d.rolId }));
                return 9;
            },
            update: async (id, f) => {
                users.set(id, { ...users.get(id), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), version: (users.get(id)?.version ?? 0) + 1 });
                return 1;
            },
            countActiveAdmins: async (exclude) => [...users.values()].filter((u) => u.rolSlug === 'administrador' && u.activo && u.id !== exclude).length,
            bumpAuthVersion: async () => 2,
            delete: async (id) => Number(users.delete(id)),
        });
        svc = new identity_services_1.UserService(fakeDb, repo, fake({ findById: async (id) => roles.get(id) ?? null }), fake({ deleteSessionsOfUser: async () => 1 }), fake({ hash: async () => '$argon2id$fake' }), fake({ sendInvitation: async (u) => void invited.push(u.email) }), auditSvc);
    });
    (0, node_test_1.test)('sin sesión → 401; sin permiso → 403', async () => {
        await strict_1.default.rejects(svc.list(null, {}), { status: 401 });
        await strict_1.default.rejects(svc.create(EDITOR, { email: 'n@example.gov.co', nombre: 'Nuevo', rolId: 2 }, null), { status: 403 });
    });
    (0, node_test_1.test)('crear: normaliza el correo, invita y audita', async () => {
        const u = await svc.create(ADMIN, { email: ' NUEVO@Example.gov.co ', nombre: ' Nuevo ', rolId: 2 }, null);
        strict_1.default.equal(u.email, 'nuevo@example.gov.co');
        strict_1.default.deepEqual(invited, ['nuevo@example.gov.co']);
        strict_1.default.ok(audit.events.includes('usuario_crear'));
    });
    (0, node_test_1.test)('crear con correo duplicado → 409', async () => {
        await strict_1.default.rejects(svc.create(ADMIN, { email: 'u5@example.gov.co', nombre: 'Dup', rolId: 2 }, null), { status: 409 });
    });
    (0, node_test_1.test)('no se asigna un rol con permisos que el actor no tiene (sin escalada)', async () => {
        const rrhh = actor(['dashboard.access', 'users.create', 'users.update', 'users.read'], { id: 7, rolId: 3, rolSlug: 'rrhh' });
        await strict_1.default.rejects(svc.create(rrhh, { email: 'x@example.gov.co', nombre: 'Equis', rolId: 1 }, null), { status: 403 });
        await strict_1.default.rejects(svc.update(rrhh, 5, { rolId: 1 }, null), { status: 403 });
    });
    (0, node_test_1.test)('no puede cambiar su propio rol ni desactivarse', async () => {
        await strict_1.default.rejects(svc.update(ADMIN, 1, { rolId: 2 }, null), { status: 403 });
        await strict_1.default.rejects(svc.update(ADMIN, 1, { activo: false }, null), { status: 403 });
    });
    (0, node_test_1.test)('no se desactiva ni elimina al último administrador activo', async () => {
        users.set(3, user(3, { rolId: 1, rolSlug: 'administrador' }));
        const otherAdmin = actor(permissions_1.TODOS, { id: 3 });
        users.set(1, { ...users.get(1) });
        users.get(3).activo = true;
        // Con dos administradores sí se puede desactivar a uno…
        strict_1.default.equal((await svc.update(otherAdmin, 1, { activo: false }, null)).activo, false);
        // …pero no al último que queda.
        await strict_1.default.rejects(svc.remove(actor(permissions_1.TODOS, { id: 99 }), 3, null), { status: 409 });
    });
    (0, node_test_1.test)('versión desactualizada → 409 EDIT_CONFLICT; sin versión, se guarda', async () => {
        await strict_1.default.rejects(svc.update(ADMIN, 5, { nombre: 'Viejo', version: 2 }, null), { code: 'EDIT_CONFLICT' });
        strict_1.default.equal((await svc.update(ADMIN, 5, { nombre: 'Nuevo' }, null)).nombre, 'Nuevo');
    });
    (0, node_test_1.test)('usuario inexistente → 404', async () => {
        await strict_1.default.rejects(svc.get(ADMIN, 404), { status: 404 });
    });
});
(0, node_test_1.describe)('RoleService', () => {
    let created;
    const svc = () => new identity_services_1.RoleService(fakeDb, fake({
        findBySlug: async () => null,
        nameExists: async (n) => n === 'Existente',
        create: async () => 10,
        setPermissions: async (_id, p) => void (created = { perms: p }),
        findById: async (id) => (id === 1 ? role(1, 'administrador', permissions_1.TODOS, { sistema: true }) : role(id, 'otro', ['dashboard.access'])),
    }), fake({ countByRole: async (id) => (id === 4 ? 2 : 0) }), auditSvc);
    (0, node_test_1.test)('permisos inexistentes → 422; conceder lo que no se tiene → 403', async () => {
        await strict_1.default.rejects(svc().create(ADMIN, { nombre: 'Malo', permisos: ['todo.poder'] }, null), { status: 422 });
        const limited = actor(['dashboard.access', 'roles.create'], { id: 8, rolId: 8 });
        await strict_1.default.rejects(svc().create(limited, { nombre: 'Escala', permisos: ['users.delete'] }, null), { status: 403 });
    });
    (0, node_test_1.test)('siempre agrega dashboard.access y rechaza nombres duplicados', async () => {
        created = null;
        await svc().create(ADMIN, { nombre: 'Comunicaciones', permisos: ['news.read'] }, null);
        strict_1.default.deepEqual(created, { perms: ['dashboard.access', 'news.read'] });
        await strict_1.default.rejects(svc().create(ADMIN, { nombre: 'Existente', permisos: ['news.read'] }, null), { status: 409 });
    });
    (0, node_test_1.test)('el rol Administrador es inmutable; un rol con usuarios no se elimina', async () => {
        await strict_1.default.rejects(svc().update(ADMIN, 1, { permisos: ['dashboard.access'] }, null), { status: 403 });
        await strict_1.default.rejects(svc().remove(ADMIN, 1, null), { status: 403 });
        await strict_1.default.rejects(svc().remove(ADMIN, 4, null), { status: 409 });
    });
});
(0, node_test_1.describe)('PageService y NewsService: publicación', () => {
    const page = { id: 3, slug: 'x', titulo: 'X', resumen: '', bloques: [], estado: 'publicada', sistema: false, creadoPor: 1, actualizadoPor: 1, publicadaEn: null, version: 2, creadoEn: '', actualizadoEn: '' };
    const media = fake({ assertUsable: async () => undefined, syncUsages: async () => undefined, clearUsages: async () => undefined });
    const sanitizer = fake({ sanitizeRichText: (h) => h.replace(/<script.*?<\/script>/g, ''), stripTags: (h) => h.replace(/<[^>]+>/g, '') });
    const pages = new content_services_1.PageService(fakeDb, fake({ findById: async () => page, slugExists: async () => false, update: async () => 1 }), media, sanitizer, auditSvc, cache);
    (0, node_test_1.test)('editar una página publicada sin pages.publish → 403', async () => {
        const sinPublicar = actor(['dashboard.access', 'pages.update', 'pages.read'], { id: 4 });
        await strict_1.default.rejects(pages.update(sinPublicar, 3, { titulo: 'Cambio' }, null), { status: 403 });
    });
    (0, node_test_1.test)('página del sistema: no cambia de dirección ni se elimina', async () => {
        const sys = new content_services_1.PageService(fakeDb, fake({ findById: async () => ({ ...page, sistema: true }) }), media, sanitizer, auditSvc, cache);
        await strict_1.default.rejects(sys.update(ADMIN, 3, { slug: 'otra' }, null), { status: 403 });
        await strict_1.default.rejects(sys.remove(ADMIN, 3, null), { status: 403 });
    });
    (0, node_test_1.test)('bloques inválidos → 422 con el campo exacto', async () => {
        await strict_1.default.rejects(pages.update(ADMIN, 3, { bloques: [{ tipo: 'boton', texto: 'x', enlace: 'javascript:x' }] }, null), (e) => {
            strict_1.default.equal(e.status, 422);
            strict_1.default.match(e.details[0].campo, /^bloques\.0/);
            return true;
        });
    });
    (0, node_test_1.test)('noticia: categoría inválida y contenido muy corto → 422; crear publicada sin news.publish → 403', async () => {
        const news = new content_services_1.NewsService(fakeDb, fake({ slugExists: async () => false }), media, sanitizer, auditSvc, cache);
        const base = { titulo: 'Título válido', resumen: 'Resumen válido', fechaPublicacion: '2026-01-01', estado: 'borrador' };
        await strict_1.default.rejects(news.create(ADMIN, { ...base, categoria: 'Inventada', contenido: '<p>Contenido suficientemente largo</p>' }, null), { status: 422 });
        await strict_1.default.rejects(news.create(ADMIN, { ...base, categoria: 'Cobertura', contenido: '<p>corto</p><script>x</script>' }, null), { status: 422 });
        const sinPublicar = actor(['dashboard.access', 'news.create'], { id: 4 });
        await strict_1.default.rejects(news.create(sinPublicar, { ...base, estado: 'publicada', categoria: 'Cobertura', contenido: '<p>Contenido suficientemente largo</p>' }, null), { status: 403 });
    });
});
(0, node_test_1.describe)('SliderService: orden y activación', () => {
    const slider = { id: 1, nombre: 'P', ubicacion: 'inicio', activo: true, version: 4, creadoEn: '', actualizadoEn: '', diapositivas: [] };
    let reordered = null;
    const svc = new content_services_1.SliderService(fakeDb, fake({
        findById: async () => slider,
        slideIdsOf: async () => [10, 11, 12],
        reorder: async (_s, ids) => void (reordered = ids),
        touch: async () => undefined,
        locationExists: async (u) => u === 'pagina:contacto',
    }), fake({ syncUsages: async () => undefined, assertUsable: async () => undefined }), auditSvc, cache);
    (0, node_test_1.test)('reordenar exige exactamente todas las diapositivas', async () => {
        await strict_1.default.rejects(svc.reorder(ADMIN, 1, [10, 11], null), { status: 422 });
        await svc.reorder(ADMIN, 1, [12, 10, 11], null);
        strict_1.default.deepEqual(reordered, [12, 10, 11]);
    });
    (0, node_test_1.test)('versión del slider desactualizada → 409; ubicación inválida → 422; ocupada → 409; sin permiso → 403', async () => {
        await strict_1.default.rejects(svc.reorder(ADMIN, 1, [10, 11, 12], null, 3), { code: 'EDIT_CONFLICT' });
        await strict_1.default.rejects(svc.create(ADMIN, { nombre: 'X', ubicacion: 'portada' }, null), { status: 422 });
        await strict_1.default.rejects(svc.create(ADMIN, { nombre: 'X', ubicacion: 'pagina:contacto' }, null), { status: 409 });
        await strict_1.default.rejects(svc.removeSlide(EDITOR, 1, 10, null), { status: 403 });
    });
    (0, node_test_1.test)('una diapositiva nueva exige imagen', async () => {
        await strict_1.default.rejects(svc.addSlide(ADMIN, 1, { titulo: 'Sin imagen' }, null), { status: 422 });
    });
});
//# sourceMappingURL=services.test.js.map