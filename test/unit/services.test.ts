/**
 * Servicios de aplicación con dependencias aisladas (repositorios y auditoría simulados):
 * autorización, reglas de negocio, validaciones y conflictos. Casos exitosos, inválidos y no autorizados.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import type { AuditService } from '../../src/application/audit.service';
import type { AuthService } from '../../src/application/auth.service';
import { NewsService, PageService, SliderService } from '../../src/application/content.services';
import { RoleService, UserService } from '../../src/application/identity.services';
import type { MediaService } from '../../src/application/media.service';
import { PERMISOS_EDITOR, TODOS, type Actor } from '../../src/domain/permissions';
import type { PublicCache } from '../../src/infrastructure/cache/public-cache.service';
import type { Db } from '../../src/infrastructure/database/db.service';
import type { NewsRepository, PageRecord, PageRepository, SliderRecord, SliderRepository } from '../../src/infrastructure/repositories/content.repositories';
import type { CredentialRepository, RoleRecord, RoleRepository, UserRecord, UserRepository } from '../../src/infrastructure/repositories/identity.repositories';
import type { HtmlSanitizer } from '../../src/infrastructure/security/html-sanitizer.service';
import type { PasswordHasher } from '../../src/infrastructure/security/password-hasher.service';

const fake = <T>(o: Partial<Record<keyof T, unknown>>): T => o as unknown as T;

const fakeDb = fake<Db>({ transaction: async <R>(fn: () => Promise<R>) => fn(), afterCommit: () => undefined });
const audit = { events: [] as string[], record: async (e: { accion: string }) => void audit.events.push(e.accion) };
const auditSvc = audit as unknown as AuditService;
const cache = fake<PublicCache>({ invalidate: () => undefined, get: async <R>(_k: string, l: () => Promise<R>) => l() });

function actor(perms: readonly string[], over: Partial<Actor> = {}): Actor {
  return { id: 1, email: 'a@example.gov.co', nombre: 'A', rolId: 1, rolSlug: 'administrador', rolNombre: 'Administrador', permisos: new Set(perms), authVersion: 1, ...over };
}
const ADMIN = actor(TODOS);
const EDITOR = actor(PERMISOS_EDITOR, { id: 2, rolId: 2, rolSlug: 'editor', rolNombre: 'Editor' });

function role(id: number, slug: string, permisos: readonly string[], extra: Partial<RoleRecord> = {}): RoleRecord {
  return { id, slug, nombre: slug, descripcion: '', sistema: false, version: 1, creadoEn: '', actualizadoEn: '', totalUsuarios: 0, permisos: [...permisos], ...extra };
}
function user(id: number, over: Partial<UserRecord> = {}): UserRecord {
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

describe('UserService', () => {
  let users: Map<number, UserRecord>;
  let invited: string[];
  let svc: UserService;
  const roles = new Map<number, RoleRecord>([
    [1, role(1, 'administrador', TODOS, { sistema: true })],
    [2, role(2, 'editor', PERMISOS_EDITOR, { sistema: true })],
  ]);

  beforeEach(() => {
    users = new Map([
      [1, user(1, { rolId: 1, rolSlug: 'administrador' })],
      [5, user(5)],
    ]);
    invited = [];
    audit.events = [];
    const repo = fake<UserRepository>({
      findById: async (id: number) => users.get(id) ?? null,
      findByEmail: async (e: string) => [...users.values()].find((u) => u.email === e.toLowerCase()) ?? null,
      create: async (d: { email: string; rolId: number }) => {
        users.set(9, user(9, { email: d.email, rolId: d.rolId }));
        return 9;
      },
      update: async (id: number, f: Partial<UserRecord>) => {
        users.set(id, { ...(users.get(id) as UserRecord), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), version: (users.get(id)?.version ?? 0) + 1 });
        return 1;
      },
      countActiveAdmins: async (exclude: number) => [...users.values()].filter((u) => u.rolSlug === 'administrador' && u.activo && u.id !== exclude).length,
      bumpAuthVersion: async () => 2,
      delete: async (id: number) => Number(users.delete(id)),
    });
    svc = new UserService(
      fakeDb,
      repo,
      fake<RoleRepository>({ findById: async (id: number) => roles.get(id) ?? null }),
      fake<CredentialRepository>({ deleteSessionsOfUser: async () => 1 }),
      fake<PasswordHasher>({ hash: async () => '$argon2id$fake' }),
      fake<AuthService>({ sendInvitation: async (u: UserRecord) => void invited.push(u.email) }),
      auditSvc,
    );
  });

  test('sin sesión → 401; sin permiso → 403', async () => {
    await assert.rejects(svc.list(null, {}), { status: 401 });
    await assert.rejects(svc.create(EDITOR, { email: 'n@example.gov.co', nombre: 'Nuevo', rolId: 2 }, null), { status: 403 });
  });

  test('crear: normaliza el correo, invita y audita', async () => {
    const u = await svc.create(ADMIN, { email: ' NUEVO@Example.gov.co ', nombre: ' Nuevo ', rolId: 2 }, null);
    assert.equal(u.email, 'nuevo@example.gov.co');
    assert.deepEqual(invited, ['nuevo@example.gov.co']);
    assert.ok(audit.events.includes('usuario_crear'));
  });

  test('crear con correo duplicado → 409', async () => {
    await assert.rejects(svc.create(ADMIN, { email: 'u5@example.gov.co', nombre: 'Dup', rolId: 2 }, null), { status: 409 });
  });

  test('no se asigna un rol con permisos que el actor no tiene (sin escalada)', async () => {
    const rrhh = actor(['dashboard.access', 'users.create', 'users.update', 'users.read'], { id: 7, rolId: 3, rolSlug: 'rrhh' });
    await assert.rejects(svc.create(rrhh, { email: 'x@example.gov.co', nombre: 'Equis', rolId: 1 }, null), { status: 403 });
    await assert.rejects(svc.update(rrhh, 5, { rolId: 1 }, null), { status: 403 });
  });

  test('no puede cambiar su propio rol ni desactivarse', async () => {
    await assert.rejects(svc.update(ADMIN, 1, { rolId: 2 }, null), { status: 403 });
    await assert.rejects(svc.update(ADMIN, 1, { activo: false }, null), { status: 403 });
  });

  test('no se desactiva ni elimina al último administrador activo', async () => {
    users.set(3, user(3, { rolId: 1, rolSlug: 'administrador' }));
    const otherAdmin = actor(TODOS, { id: 3 });
    users.set(1, { ...(users.get(1) as UserRecord) });
    users.get(3)!.activo = true;
    // Con dos administradores sí se puede desactivar a uno…
    assert.equal((await svc.update(otherAdmin, 1, { activo: false }, null)).activo, false);
    // …pero no al último que queda.
    await assert.rejects(svc.remove(actor(TODOS, { id: 99 }), 3, null), { status: 409 });
  });

  test('versión desactualizada → 409 EDIT_CONFLICT; sin versión, se guarda', async () => {
    await assert.rejects(svc.update(ADMIN, 5, { nombre: 'Viejo', version: 2 }, null), { code: 'EDIT_CONFLICT' });
    assert.equal((await svc.update(ADMIN, 5, { nombre: 'Nuevo' }, null)).nombre, 'Nuevo');
  });

  test('usuario inexistente → 404', async () => {
    await assert.rejects(svc.get(ADMIN, 404), { status: 404 });
  });
});

describe('RoleService', () => {
  let created: { perms: string[] } | null;
  const svc = () =>
    new RoleService(
      fakeDb,
      fake<RoleRepository>({
        findBySlug: async () => null,
        nameExists: async (n: string) => n === 'Existente',
        create: async () => 10,
        setPermissions: async (_id: number, p: string[]) => void (created = { perms: p }),
        findById: async (id: number) => (id === 1 ? role(1, 'administrador', TODOS, { sistema: true }) : role(id, 'otro', ['dashboard.access'])),
      }),
      fake<UserRepository>({ countByRole: async (id: number) => (id === 4 ? 2 : 0) }),
      auditSvc,
    );

  test('permisos inexistentes → 422; conceder lo que no se tiene → 403', async () => {
    await assert.rejects(svc().create(ADMIN, { nombre: 'Malo', permisos: ['todo.poder'] }, null), { status: 422 });
    const limited = actor(['dashboard.access', 'roles.create'], { id: 8, rolId: 8 });
    await assert.rejects(svc().create(limited, { nombre: 'Escala', permisos: ['users.delete'] }, null), { status: 403 });
  });

  test('siempre agrega dashboard.access y rechaza nombres duplicados', async () => {
    created = null;
    await svc().create(ADMIN, { nombre: 'Comunicaciones', permisos: ['news.read'] }, null);
    assert.deepEqual(created, { perms: ['dashboard.access', 'news.read'] });
    await assert.rejects(svc().create(ADMIN, { nombre: 'Existente', permisos: ['news.read'] }, null), { status: 409 });
  });

  test('el rol Administrador es inmutable; un rol con usuarios no se elimina', async () => {
    await assert.rejects(svc().update(ADMIN, 1, { permisos: ['dashboard.access'] }, null), { status: 403 });
    await assert.rejects(svc().remove(ADMIN, 1, null), { status: 403 });
    await assert.rejects(svc().remove(ADMIN, 4, null), { status: 409 });
  });
});

describe('PageService y NewsService: publicación', () => {
  const page: PageRecord = { id: 3, slug: 'x', titulo: 'X', resumen: '', bloques: [], estado: 'publicada', sistema: false, creadoPor: 1, actualizadoPor: 1, publicadaEn: null, version: 2, creadoEn: '', actualizadoEn: '' };
  const media = fake<MediaService>({ assertUsable: async () => undefined, syncUsages: async () => undefined, clearUsages: async () => undefined });
  const sanitizer = fake<HtmlSanitizer>({ sanitizeRichText: (h: string) => h.replace(/<script.*?<\/script>/g, ''), stripTags: (h: string) => h.replace(/<[^>]+>/g, '') });
  const pages = new PageService(
    fakeDb,
    fake<PageRepository>({ findById: async () => page, slugExists: async () => false, update: async () => 1 }),
    media,
    sanitizer,
    auditSvc,
    cache,
  );

  test('editar una página publicada sin pages.publish → 403', async () => {
    const sinPublicar = actor(['dashboard.access', 'pages.update', 'pages.read'], { id: 4 });
    await assert.rejects(pages.update(sinPublicar, 3, { titulo: 'Cambio' }, null), { status: 403 });
  });

  test('página del sistema: no cambia de dirección ni se elimina', async () => {
    const sys = new PageService(fakeDb, fake<PageRepository>({ findById: async () => ({ ...page, sistema: true }) }), media, sanitizer, auditSvc, cache);
    await assert.rejects(sys.update(ADMIN, 3, { slug: 'otra' }, null), { status: 403 });
    await assert.rejects(sys.remove(ADMIN, 3, null), { status: 403 });
  });

  test('bloques inválidos → 422 con el campo exacto', async () => {
    await assert.rejects(pages.update(ADMIN, 3, { bloques: [{ tipo: 'boton', texto: 'x', enlace: 'javascript:x' }] }, null), (e: { status: number; details: Array<{ campo: string }> }) => {
      assert.equal(e.status, 422);
      assert.match(e.details[0].campo, /^bloques\.0/);
      return true;
    });
  });

  test('noticia: categoría inválida y contenido muy corto → 422; crear publicada sin news.publish → 403', async () => {
    const news = new NewsService(fakeDb, fake<NewsRepository>({ slugExists: async () => false }), media, sanitizer, auditSvc, cache);
    const base = { titulo: 'Título válido', resumen: 'Resumen válido', fechaPublicacion: '2026-01-01', estado: 'borrador' as const };
    await assert.rejects(news.create(ADMIN, { ...base, categoria: 'Inventada', contenido: '<p>Contenido suficientemente largo</p>' }, null), { status: 422 });
    await assert.rejects(news.create(ADMIN, { ...base, categoria: 'Cobertura', contenido: '<p>corto</p><script>x</script>' }, null), { status: 422 });
    const sinPublicar = actor(['dashboard.access', 'news.create'], { id: 4 });
    await assert.rejects(news.create(sinPublicar, { ...base, estado: 'publicada', categoria: 'Cobertura', contenido: '<p>Contenido suficientemente largo</p>' }, null), { status: 403 });
  });
});

describe('SliderService: orden y activación', () => {
  const slider: SliderRecord = { id: 1, nombre: 'P', ubicacion: 'inicio', activo: true, version: 4, creadoEn: '', actualizadoEn: '', diapositivas: [] };
  let reordered: number[] | null = null;
  const svc = new SliderService(
    fakeDb,
    fake<SliderRepository>({
      findById: async () => slider,
      slideIdsOf: async () => [10, 11, 12],
      reorder: async (_s: number, ids: number[]) => void (reordered = ids),
      touch: async () => undefined,
      locationExists: async (u: string) => u === 'pagina:contacto',
    }),
    fake<MediaService>({ syncUsages: async () => undefined, assertUsable: async () => undefined }),
    auditSvc,
    cache,
  );

  test('reordenar exige exactamente todas las diapositivas', async () => {
    await assert.rejects(svc.reorder(ADMIN, 1, [10, 11], null), { status: 422 });
    await svc.reorder(ADMIN, 1, [12, 10, 11], null);
    assert.deepEqual(reordered, [12, 10, 11]);
  });

  test('versión del slider desactualizada → 409; ubicación inválida → 422; ocupada → 409; sin permiso → 403', async () => {
    await assert.rejects(svc.reorder(ADMIN, 1, [10, 11, 12], null, 3), { code: 'EDIT_CONFLICT' });
    await assert.rejects(svc.create(ADMIN, { nombre: 'X', ubicacion: 'portada' }, null), { status: 422 });
    await assert.rejects(svc.create(ADMIN, { nombre: 'X', ubicacion: 'pagina:contacto' }, null), { status: 409 });
    await assert.rejects(svc.removeSlide(EDITOR, 1, 10, null), { status: 403 });
  });

  test('una diapositiva nueva exige imagen', async () => {
    await assert.rejects(svc.addSlide(ADMIN, 1, { titulo: 'Sin imagen' }, null), { status: 422 });
  });
});
