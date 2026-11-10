'use strict';
/** DTOs de usuarios, roles, auditoría y estadísticas. Los presentadores eligen los campos de salida. */
const { registry } = require('../../openapi');
const { z, Id, Fecha, FechaHora, listQuery, paginated, single } = require('./common');
const { TODOS } = require('../../../../../domain/permissions');

// --- Usuarios ---
const User = registry.register(
  'Usuario',
  z.strictObject({
    id: z.number().int().openapi({ example: 7 }),
    email: z.string().openapi({ example: 'editor@example.gov.co' }),
    nombre: z.string().openapi({ example: 'Carlos Ruiz' }),
    rol: z.strictObject({ id: z.number().int(), slug: z.string(), nombre: z.string() }),
    activo: z.boolean(),
    mfaConfigurado: z.boolean(),
    ultimoAcceso: FechaHora.nullable(),
    creadoEn: FechaHora,
  }),
);
const UserList = paginated('ListaUsuarios', User);
const UserOne = single('UsuarioRespuesta', User);
const UserQuery = listQuery(['nombre', 'email', 'creadoEn', 'ultimoAcceso'], {
  rolId: Id.optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
const UserCreate = z
  .strictObject({
    email: z.string().trim().toLowerCase().email().max(254).openapi({ example: 'nuevo@example.gov.co' }),
    nombre: z.string().trim().min(3).max(120).openapi({ example: 'María Pérez' }),
    rolId: Id.openapi({ example: 2 }),
  })
  .openapi({ description: 'La persona recibe un correo de invitación de un solo uso para definir su contraseña y configurar el segundo factor.' });
const UserUpdate = z
  .strictObject({
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    nombre: z.string().trim().min(3).max(120).optional(),
    rolId: Id.optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');

const toUser = (u) => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  rol: { id: u.rolId, slug: u.rolSlug, nombre: u.rolNombre },
  activo: !!u.activo,
  mfaConfigurado: !!u.mfaActivo,
  ultimoAcceso: u.ultimoAcceso ?? null,
  creadoEn: u.creadoEn,
});

// --- Roles ---
const Permiso = z.enum(TODOS);
const Role = registry.register(
  'Rol',
  z.strictObject({
    id: z.number().int(),
    slug: z.string().openapi({ example: 'comunicaciones' }),
    nombre: z.string().openapi({ example: 'Comunicaciones' }),
    descripcion: z.string(),
    sistema: z.boolean(),
    totalUsuarios: z.number().int(),
    permisos: z.array(z.string()).openapi({ example: ['dashboard.access', 'news.read', 'news.update'] }),
  }),
);
const RoleList = single('ListaRoles', z.array(Role));
const RoleOne = single('RolRespuesta', Role);
const RoleCreate = z.strictObject({
  nombre: z.string().trim().min(3).max(60).openapi({ example: 'Comunicaciones' }),
  descripcion: z.string().trim().max(300).default(''),
  permisos: z.array(Permiso).min(1).max(TODOS.length),
});
const RoleUpdate = z
  .strictObject({
    nombre: z.string().trim().min(3).max(60).optional(),
    descripcion: z.string().trim().max(300).optional(),
    permisos: z.array(Permiso).min(1).max(TODOS.length).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');
const PermissionCatalog = single(
  'CatalogoPermisos',
  z.array(
    z.strictObject({
      modulo: z.string(),
      nombre: z.string(),
      acciones: z.array(z.strictObject({ permiso: z.string(), descripcion: z.string() })),
    }),
  ),
);
const toRole = (r) => ({
  id: r.id,
  slug: r.slug,
  nombre: r.nombre,
  descripcion: r.descripcion,
  sistema: !!r.sistema,
  totalUsuarios: r.totalUsuarios,
  permisos: r.permisos,
});

// --- Auditoría ---
const AuditEvent = registry.register(
  'EventoAuditoria',
  z.strictObject({
    id: z.number().int(),
    usuarioId: z.number().int().nullable(),
    usuarioEmail: z.string().nullable(),
    accion: z.string().openapi({ example: 'noticia_publicar' }),
    recurso: z.string().nullable(),
    recursoId: z.string().nullable(),
    resultado: z.enum(['exito', 'fallo', 'denegado']),
    detalle: z.string().nullable(),
    creadoEn: FechaHora,
  }),
);
const AuditList = paginated('ListaAuditoria', AuditEvent);
const AuditQuery = listQuery([], {
  usuarioId: Id.optional(),
  accion: z.string().max(60).optional(),
  resultado: z.enum(['exito', 'fallo', 'denegado']).optional(),
  desde: Fecha.optional(),
  hasta: Fecha.optional(),
}).omit({ sort: true });
const AuditIntegrity = single('IntegridadAuditoria', z.strictObject({ integra: z.boolean(), idAlterado: z.number().int().nullable() }));
const toAudit = (e) => ({
  id: e.id,
  usuarioId: e.usuarioId,
  usuarioEmail: e.usuarioEmail,
  accion: e.accion,
  recurso: e.recurso,
  recursoId: e.recursoId,
  resultado: e.resultado,
  detalle: e.detalle,
  creadoEn: e.creadoEn,
});

// --- Estadísticas ---
const Count = z.strictObject({ valor: z.string(), visitas: z.number().int() });
const StatsReport = single(
  'ReporteEstadisticas',
  z.strictObject({
    desde: z.string(),
    hasta: z.string(),
    vacio: z.boolean().openapi({ description: 'true si no hay datos en el rango: no se inventan cifras.' }),
    resumen: z.strictObject({
      visitas: z.number().int(),
      visitantesUnicosEstimados: z.number().int().openapi({ description: 'Suma de visitantes distintos por día (estimado; sin cookies).' }),
    }),
    porDia: z.array(z.strictObject({ fecha: z.string(), visitas: z.number().int(), visitantes: z.number().int() })),
    paginas: z.array(z.strictObject({ ruta: z.string(), visitas: z.number().int() })),
    fuentes: z.array(Count),
    referentes: z.array(Count),
    dispositivos: z.array(Count),
    paises: z.array(Count),
    retencionDias: z.number().int(),
  }),
);
const StatsQuery = z.object({ desde: Fecha.optional().openapi({ example: '2026-10-01' }), hasta: Fecha.optional().openapi({ example: '2026-10-31' }) });

module.exports = {
  User,
  UserList,
  UserOne,
  UserQuery,
  UserCreate,
  UserUpdate,
  toUser,
  RoleList,
  RoleOne,
  RoleCreate,
  RoleUpdate,
  PermissionCatalog,
  toRole,
  AuditList,
  AuditQuery,
  AuditIntegrity,
  toAudit,
  StatsReport,
  StatsQuery,
};
