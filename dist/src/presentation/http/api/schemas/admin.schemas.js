"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemMetrics = exports.StatsQuery = exports.StatsReport = exports.toAudit = exports.AuditIntegrity = exports.AuditQuery = exports.AuditList = exports.AuditEvent = exports.toRole = exports.PermissionCatalog = exports.RoleUpdate = exports.RoleCreate = exports.RoleOne = exports.RoleList = exports.Role = exports.toUser = exports.UserUpdate = exports.UserCreate = exports.UserQuery = exports.UserOne = exports.UserList = exports.User = void 0;
/** DTOs de usuarios, roles, auditoría, estadísticas y sistema. Los presentadores eligen los campos de salida. */
const permissions_1 = require("../../../../domain/permissions");
const openapi_1 = require("../openapi");
const common_1 = require("./common");
// --- Usuarios ---
exports.User = (0, openapi_1.named)('Usuario', common_1.z.strictObject({
    id: common_1.z.number().int().meta({ example: 7 }),
    email: common_1.z.string().meta({ example: 'editor@example.gov.co' }),
    nombre: common_1.z.string().meta({ example: 'Carlos Ruiz' }),
    rol: common_1.z.strictObject({ id: common_1.z.number().int(), slug: common_1.z.string(), nombre: common_1.z.string() }),
    activo: common_1.z.boolean(),
    mfaConfigurado: common_1.z.boolean(),
    ultimoAcceso: common_1.FechaHora.nullable(),
    creadoEn: common_1.FechaHora,
    version: common_1.VersionOutput,
}));
exports.UserList = (0, common_1.paginated)('ListaUsuarios', exports.User);
exports.UserOne = (0, common_1.single)('UsuarioRespuesta', exports.User);
exports.UserQuery = (0, common_1.listQuery)(['nombre', 'email', 'creadoEn', 'ultimoAcceso'], {
    rolId: common_1.Id.optional(),
    activo: common_1.z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
});
exports.UserCreate = common_1.z
    .strictObject({
    email: common_1.z.string().trim().toLowerCase().email().max(254).meta({ example: 'nuevo@example.gov.co' }),
    nombre: common_1.z.string().trim().min(3).max(120).meta({ example: 'María Pérez' }),
    rolId: common_1.Id.meta({ example: 2 }),
})
    .meta({ description: 'La persona recibe un correo de invitación de un solo uso para definir su contraseña y configurar el segundo factor.' });
exports.UserUpdate = common_1.z
    .strictObject({
    email: common_1.z.string().trim().toLowerCase().email().max(254).optional(),
    nombre: common_1.z.string().trim().min(3).max(120).optional(),
    rolId: common_1.Id.optional(),
    activo: common_1.z.boolean().optional(),
    version: common_1.VersionInput,
})
    .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Envíe al menos un campo.');
const toUser = (u) => ({
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
exports.toUser = toUser;
// --- Roles ---
const Permiso = common_1.z.enum(permissions_1.TODOS);
exports.Role = (0, openapi_1.named)('Rol', common_1.z.strictObject({
    id: common_1.z.number().int(),
    slug: common_1.z.string().meta({ example: 'comunicaciones' }),
    nombre: common_1.z.string().meta({ example: 'Comunicaciones' }),
    descripcion: common_1.z.string(),
    sistema: common_1.z.boolean(),
    totalUsuarios: common_1.z.number().int(),
    permisos: common_1.z.array(common_1.z.string()).meta({ example: ['dashboard.access', 'news.read', 'news.update'] }),
    version: common_1.VersionOutput,
}));
exports.RoleList = (0, common_1.single)('ListaRoles', common_1.z.array(exports.Role));
exports.RoleOne = (0, common_1.single)('RolRespuesta', exports.Role);
exports.RoleCreate = common_1.z.strictObject({
    nombre: common_1.z.string().trim().min(3).max(60).meta({ example: 'Comunicaciones' }),
    descripcion: common_1.z.string().trim().max(300).default(''),
    permisos: common_1.z.array(Permiso).min(1).max(permissions_1.TODOS.length),
});
exports.RoleUpdate = common_1.z
    .strictObject({
    nombre: common_1.z.string().trim().min(3).max(60).optional(),
    descripcion: common_1.z.string().trim().max(300).optional(),
    permisos: common_1.z.array(Permiso).min(1).max(permissions_1.TODOS.length).optional(),
    version: common_1.VersionInput,
})
    .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Envíe al menos un campo.');
exports.PermissionCatalog = (0, common_1.single)('CatalogoPermisos', common_1.z.array(common_1.z.strictObject({
    modulo: common_1.z.string(),
    nombre: common_1.z.string(),
    acciones: common_1.z.array(common_1.z.strictObject({ permiso: common_1.z.string(), descripcion: common_1.z.string() })),
})));
const toRole = (r) => ({
    id: r.id,
    slug: r.slug,
    nombre: r.nombre,
    descripcion: r.descripcion,
    sistema: !!r.sistema,
    totalUsuarios: r.totalUsuarios,
    permisos: r.permisos,
    version: r.version,
});
exports.toRole = toRole;
// --- Auditoría ---
exports.AuditEvent = (0, openapi_1.named)('EventoAuditoria', common_1.z.strictObject({
    id: common_1.z.number().int(),
    usuarioId: common_1.z.number().int().nullable(),
    usuarioEmail: common_1.z.string().nullable(),
    accion: common_1.z.string().meta({ example: 'noticia_publicar' }),
    recurso: common_1.z.string().nullable(),
    recursoId: common_1.z.string().nullable(),
    resultado: common_1.z.enum(['exito', 'fallo', 'denegado']),
    detalle: common_1.z.string().nullable(),
    creadoEn: common_1.FechaHora,
}));
exports.AuditList = (0, common_1.paginated)('ListaAuditoria', exports.AuditEvent);
exports.AuditQuery = (0, common_1.listQuery)([], {
    usuarioId: common_1.Id.optional(),
    accion: common_1.z.string().max(60).optional(),
    resultado: common_1.z.enum(['exito', 'fallo', 'denegado']).optional(),
    desde: common_1.Fecha.optional(),
    hasta: common_1.Fecha.optional(),
}).omit({ sort: true });
exports.AuditIntegrity = (0, common_1.single)('IntegridadAuditoria', common_1.z.strictObject({ integra: common_1.z.boolean(), idAlterado: common_1.z.number().int().nullable() }));
const toAudit = (e) => ({
    id: Number(e.id),
    usuarioId: e.usuarioId ?? null,
    usuarioEmail: e.usuarioEmail ?? null,
    accion: e.accion,
    recurso: e.recurso ?? null,
    recursoId: e.recursoId ?? null,
    resultado: e.resultado,
    detalle: e.detalle ?? null,
    creadoEn: e.creadoEn,
});
exports.toAudit = toAudit;
// --- Estadísticas ---
const Count = common_1.z.strictObject({ valor: common_1.z.string(), visitas: common_1.z.number().int() });
exports.StatsReport = (0, common_1.single)('ReporteEstadisticas', common_1.z.strictObject({
    desde: common_1.z.string(),
    hasta: common_1.z.string(),
    vacio: common_1.z.boolean().meta({ description: 'true si no hay datos en el rango: no se inventan cifras.' }),
    resumen: common_1.z.strictObject({
        visitas: common_1.z.number().int(),
        visitantesUnicosEstimados: common_1.z.number().int().meta({ description: 'Suma de visitantes distintos por día (estimado; sin cookies).' }),
    }),
    porDia: common_1.z.array(common_1.z.strictObject({ fecha: common_1.z.string(), visitas: common_1.z.number().int(), visitantes: common_1.z.number().int() })),
    paginas: common_1.z.array(common_1.z.strictObject({ ruta: common_1.z.string(), visitas: common_1.z.number().int() })),
    fuentes: common_1.z.array(Count),
    referentes: common_1.z.array(Count),
    dispositivos: common_1.z.array(Count),
    paises: common_1.z.array(Count),
    retencionDias: common_1.z.number().int(),
}));
exports.StatsQuery = common_1.z.object({ desde: common_1.Fecha.optional().meta({ example: '2026-10-01' }), hasta: common_1.Fecha.optional().meta({ example: '2026-10-31' }) });
// --- Sistema ---
const Latency = common_1.z.strictObject({
    solicitudes: common_1.z.number().int(),
    errores5xx: common_1.z.number().int(),
    p50Ms: common_1.z.number(),
    p95Ms: common_1.z.number(),
    p99Ms: common_1.z.number(),
    maxMs: common_1.z.number(),
});
exports.SystemMetrics = (0, common_1.single)('MetricasSistema', common_1.z.strictObject({
    instancia: common_1.z.string(),
    version: common_1.z.string(),
    node: common_1.z.string(),
    inicioEn: common_1.z.string(),
    tiempoActivoSegundos: common_1.z.number().int(),
    memoria: common_1.z.strictObject({ rssMb: common_1.z.number(), heapUsadoMb: common_1.z.number(), heapTotalMb: common_1.z.number() }),
    cpu: common_1.z.strictObject({ usuarioMs: common_1.z.number(), sistemaMs: common_1.z.number() }),
    eventLoopRetrasoP99Ms: common_1.z.number(),
    baseDeDatos: common_1.z.strictObject({
        poolMaximo: common_1.z.number().int(),
        conexiones: common_1.z.number().int(),
        libres: common_1.z.number().int(),
        enEspera: common_1.z.number().int(),
        conexionesServidor: common_1.z.number().int().nullable(),
    }),
    cache: common_1.z.strictObject({ entradas: common_1.z.number().int(), aciertos: common_1.z.number().int(), fallos: common_1.z.number().int(), escuchandoInvalidaciones: common_1.z.boolean() }),
    estadisticas: common_1.z.strictObject({ pendientes: common_1.z.number().int(), descartadas: common_1.z.number().int() }),
    http: common_1.z.strictObject({ ventanaMinutos: common_1.z.number().int(), total: Latency, porRuta: common_1.z.array(Latency.extend({ ruta: common_1.z.string() })) }),
}));
//# sourceMappingURL=admin.schemas.js.map