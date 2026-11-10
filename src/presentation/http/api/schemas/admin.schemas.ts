/** DTOs de usuarios, roles, auditoría, estadísticas y sistema. Los presentadores eligen los campos de salida. */
import { TODOS } from '../../../../domain/permissions';
import type { RoleRecord, UserRecord } from '../../../../infrastructure/repositories/identity.repositories';
import { named } from '../openapi';
import { Fecha, FechaHora, Id, listQuery, paginated, single, VersionInput, VersionOutput, z } from './common';

// --- Usuarios ---
export const User = named(
  'Usuario',
  z.strictObject({
    id: z.number().int().meta({ example: 7 }),
    email: z.string().meta({ example: 'editor@example.gov.co' }),
    nombre: z.string().meta({ example: 'Carlos Ruiz' }),
    rol: z.strictObject({ id: z.number().int(), slug: z.string(), nombre: z.string() }),
    activo: z.boolean(),
    mfaConfigurado: z.boolean(),
    ultimoAcceso: FechaHora.nullable(),
    creadoEn: FechaHora,
    version: VersionOutput,
  }),
);
export const UserList = paginated('ListaUsuarios', User);
export const UserOne = single('UsuarioRespuesta', User);
export const UserQuery = listQuery(['nombre', 'email', 'creadoEn', 'ultimoAcceso'], {
  rolId: Id.optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export const UserCreate = z
  .strictObject({
    email: z.string().trim().toLowerCase().email().max(254).meta({ example: 'nuevo@example.gov.co' }),
    nombre: z.string().trim().min(3).max(120).meta({ example: 'María Pérez' }),
    rolId: Id.meta({ example: 2 }),
  })
  .meta({ description: 'La persona recibe un correo de invitación de un solo uso para definir su contraseña y configurar el segundo factor.' });
export const UserUpdate = z
  .strictObject({
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    nombre: z.string().trim().min(3).max(120).optional(),
    rolId: Id.optional(),
    activo: z.boolean().optional(),
    version: VersionInput,
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Envíe al menos un campo.');

export const toUser = (u: UserRecord) => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  rol: { id: u.rolId, slug: u.rolSlug, nombre: u.rolNombre },
  activo: !!u.activo,
  mfaConfigurado: !!u.mfaActivo,
  ultimoAcceso: u.ultimoAcceso ?? null,
  creadoEn: u.creadoEn,
  version: u.version,
});

// --- Roles ---
const Permiso = z.enum(TODOS as unknown as [string, ...string[]]);
export const Role = named(
  'Rol',
  z.strictObject({
    id: z.number().int(),
    slug: z.string().meta({ example: 'comunicaciones' }),
    nombre: z.string().meta({ example: 'Comunicaciones' }),
    descripcion: z.string(),
    sistema: z.boolean(),
    totalUsuarios: z.number().int(),
    permisos: z.array(z.string()).meta({ example: ['dashboard.access', 'news.read', 'news.update'] }),
    version: VersionOutput,
  }),
);
export const RoleList = single('ListaRoles', z.array(Role));
export const RoleOne = single('RolRespuesta', Role);
export const RoleCreate = z.strictObject({
  nombre: z.string().trim().min(3).max(60).meta({ example: 'Comunicaciones' }),
  descripcion: z.string().trim().max(300).default(''),
  permisos: z.array(Permiso).min(1).max(TODOS.length),
});
export const RoleUpdate = z
  .strictObject({
    nombre: z.string().trim().min(3).max(60).optional(),
    descripcion: z.string().trim().max(300).optional(),
    permisos: z.array(Permiso).min(1).max(TODOS.length).optional(),
    version: VersionInput,
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Envíe al menos un campo.');
export const PermissionCatalog = single(
  'CatalogoPermisos',
  z.array(
    z.strictObject({
      modulo: z.string(),
      nombre: z.string(),
      acciones: z.array(z.strictObject({ permiso: z.string(), descripcion: z.string() })),
    }),
  ),
);
export const toRole = (r: RoleRecord) => ({
  id: r.id,
  slug: r.slug,
  nombre: r.nombre,
  descripcion: r.descripcion,
  sistema: !!r.sistema,
  totalUsuarios: r.totalUsuarios,
  permisos: r.permisos,
  version: r.version,
});

// --- Auditoría ---
export const AuditEvent = named(
  'EventoAuditoria',
  z.strictObject({
    id: z.number().int(),
    usuarioId: z.number().int().nullable(),
    usuarioEmail: z.string().nullable(),
    accion: z.string().meta({ example: 'noticia_publicar' }),
    recurso: z.string().nullable(),
    recursoId: z.string().nullable(),
    resultado: z.enum(['exito', 'fallo', 'denegado']),
    detalle: z.string().nullable(),
    creadoEn: FechaHora,
  }),
);
export const AuditList = paginated('ListaAuditoria', AuditEvent);
export const AuditQuery = listQuery([], {
  usuarioId: Id.optional(),
  accion: z.string().max(60).optional(),
  resultado: z.enum(['exito', 'fallo', 'denegado']).optional(),
  desde: Fecha.optional(),
  hasta: Fecha.optional(),
}).omit({ sort: true });
export const AuditIntegrity = single('IntegridadAuditoria', z.strictObject({ integra: z.boolean(), idAlterado: z.number().int().nullable() }));
export const toAudit = (e: Record<string, unknown>) => ({
  id: Number(e.id),
  usuarioId: (e.usuarioId as number | null) ?? null,
  usuarioEmail: (e.usuarioEmail as string | null) ?? null,
  accion: e.accion as string,
  recurso: (e.recurso as string | null) ?? null,
  recursoId: (e.recursoId as string | null) ?? null,
  resultado: e.resultado as 'exito' | 'fallo' | 'denegado',
  detalle: (e.detalle as string | null) ?? null,
  creadoEn: e.creadoEn as string,
});

// --- Estadísticas ---
const Count = z.strictObject({ valor: z.string(), visitas: z.number().int() });
export const StatsReport = single(
  'ReporteEstadisticas',
  z.strictObject({
    desde: z.string(),
    hasta: z.string(),
    vacio: z.boolean().meta({ description: 'true si no hay datos en el rango: no se inventan cifras.' }),
    resumen: z.strictObject({
      visitas: z.number().int(),
      visitantesUnicosEstimados: z.number().int().meta({ description: 'Suma de visitantes distintos por día (estimado; sin cookies).' }),
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
export const StatsQuery = z.object({ desde: Fecha.optional().meta({ example: '2026-10-01' }), hasta: Fecha.optional().meta({ example: '2026-10-31' }) });

// --- Sistema ---
const Latency = z.strictObject({
  solicitudes: z.number().int(),
  errores5xx: z.number().int(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
  maxMs: z.number(),
});
export const SystemMetrics = single(
  'MetricasSistema',
  z.strictObject({
    instancia: z.string(),
    version: z.string(),
    node: z.string(),
    inicioEn: z.string(),
    tiempoActivoSegundos: z.number().int(),
    memoria: z.strictObject({ rssMb: z.number(), heapUsadoMb: z.number(), heapTotalMb: z.number() }),
    cpu: z.strictObject({ usuarioMs: z.number(), sistemaMs: z.number() }),
    eventLoopRetrasoP99Ms: z.number(),
    baseDeDatos: z.strictObject({
      poolMaximo: z.number().int(),
      conexiones: z.number().int(),
      libres: z.number().int(),
      enEspera: z.number().int(),
      conexionesServidor: z.number().int().nullable(),
    }),
    cache: z.strictObject({ entradas: z.number().int(), aciertos: z.number().int(), fallos: z.number().int(), escuchandoInvalidaciones: z.boolean() }),
    estadisticas: z.strictObject({ pendientes: z.number().int(), descartadas: z.number().int() }),
    http: z.strictObject({ ventanaMinutos: z.number().int(), total: Latency, porRuta: z.array(Latency.extend({ ruta: z.string() })) }),
  }),
);
