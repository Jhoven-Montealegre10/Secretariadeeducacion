'use strict';
/** Esquemas compartidos por varios módulos de la API v1. */
const { z, registry, PageMeta } = require('../../openapi');

const Id = z.coerce.number().int().positive().max(2_147_483_647);
const IdParams = z.object({ id: Id.openapi({ param: { name: 'id', in: 'path' }, example: 12 }) });
const Fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
const FechaHora = z.string().openapi({ example: '2026-11-10 14:32:05', description: 'Fecha y hora UTC' });
const Estado = z.enum(['borrador', 'publicada']).openapi({ example: 'publicada' });

/** Parámetros de paginación con límites máximos y orden por lista blanca. */
function listQuery(sortFields, extra = {}) {
  const sorts = sortFields.flatMap((f) => [f, `-${f}`]);
  return z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1).openapi({ example: 1 }),
    pageSize: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20, description: 'Máximo 100' }),
    sort: (sorts.length ? z.enum(sorts) : z.string())
      .optional()
      .openapi({ example: sorts[1] || sorts[0], description: `Valores permitidos: ${sorts.join(', ')}` }),
    q: z.string().trim().max(100).optional().openapi({ example: 'matrícula', description: 'Búsqueda de texto' }),
    ...extra,
  });
}

const paginated = (name, item) => registry.register(name, z.strictObject({ data: z.array(item), meta: PageMeta }));
const single = (name, item) => registry.register(name, z.strictObject({ data: item }));

const Ok = registry.register('Ok', z.strictObject({ data: z.strictObject({ ok: z.literal(true) }) }));

/** Booleano en multipart/query: acepta "true"/"false". */
const BoolString = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

module.exports = { z, Id, IdParams, Fecha, FechaHora, Estado, listQuery, paginated, single, Ok, BoolString };
