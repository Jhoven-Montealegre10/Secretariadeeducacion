"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoolQuery = exports.BoolString = exports.Ok = exports.single = exports.paginated = exports.VersionOutput = exports.VersionInput = exports.Estado = exports.FechaHora = exports.Fecha = exports.IdParams = exports.Id = exports.z = void 0;
exports.listQuery = listQuery;
exports.paged = paged;
/** Esquemas compartidos por varios módulos de la API v1. */
const openapi_1 = require("../openapi");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return openapi_1.z; } });
exports.Id = openapi_1.z.coerce.number().int().positive().max(2_147_483_647);
exports.IdParams = openapi_1.z.object({ id: exports.Id.meta({ example: 12 }) });
exports.Fecha = openapi_1.z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
exports.FechaHora = openapi_1.z.string().meta({ example: '2026-11-10 14:32:05', description: 'Fecha y hora UTC' });
exports.Estado = openapi_1.z.enum(['borrador', 'publicada']).meta({ example: 'publicada' });
/** Versión para el bloqueo optimista (opcional por compatibilidad con clientes anteriores). */
exports.VersionInput = openapi_1.z.number().int().min(1).optional().meta({ description: 'Versión que se editó. Si otra persona guardó antes, responde 409 EDIT_CONFLICT.', example: 3 });
exports.VersionOutput = openapi_1.z.number().int().meta({ description: 'Versión actual (envíela al guardar).', example: 3 });
/** Parámetros de paginación con límites máximos y orden por lista blanca. */
function listQuery(sortFields, extra = {}) {
    const sorts = sortFields.flatMap((f) => [f, `-${f}`]);
    return openapi_1.z.object({
        page: openapi_1.z.coerce.number().int().min(1).max(10000).default(1).meta({ example: 1 }),
        pageSize: openapi_1.z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20, description: 'Máximo 100' }),
        sort: (sorts.length ? openapi_1.z.enum(sorts) : openapi_1.z.string().max(40))
            .optional()
            .meta({ example: sorts[1] ?? sorts[0], description: `Valores permitidos: ${sorts.join(', ') || 'ninguno'}` }),
        q: openapi_1.z.string().trim().max(100).optional().meta({ example: 'matrícula', description: 'Búsqueda de texto' }),
        ...extra,
    });
}
const paginated = (name, item) => (0, openapi_1.named)(name, openapi_1.z.strictObject({ data: openapi_1.z.array(item), meta: openapi_1.PageMeta }));
exports.paginated = paginated;
const single = (name, item) => (0, openapi_1.named)(name, openapi_1.z.strictObject({ data: item }));
exports.single = single;
exports.Ok = (0, openapi_1.named)('Ok', openapi_1.z.strictObject({ data: openapi_1.z.strictObject({ ok: openapi_1.z.literal(true) }) }));
/** Booleano en multipart/query: acepta "true"/"false". */
exports.BoolString = openapi_1.z.union([openapi_1.z.boolean(), openapi_1.z.enum(['true', 'false']).transform((v) => v === 'true')]);
exports.BoolQuery = openapi_1.z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional();
/** Resultado de un listado paginado en el formato estándar { data, meta }. */
function paged(result, mapItem) {
    return {
        data: result.items.map(mapItem),
        meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)) },
    };
}
//# sourceMappingURL=common.js.map