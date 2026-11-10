/** Esquemas compartidos por varios módulos de la API v1. */
import { named, PageMeta, z } from '../openapi';

export { z };

export const Id = z.coerce.number().int().positive().max(2_147_483_647);
export const IdParams = z.object({ id: Id.meta({ example: 12 }) });
export const Fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
export const FechaHora = z.string().meta({ example: '2026-11-10 14:32:05', description: 'Fecha y hora UTC' });
export const Estado = z.enum(['borrador', 'publicada']).meta({ example: 'publicada' });
/** Versión para el bloqueo optimista (opcional por compatibilidad con clientes anteriores). */
export const VersionInput = z
  .number()
  .int()
  .min(1)
  .optional()
  .meta({ description: 'Versión que se editó. Si otra persona guardó antes, responde 409 EDIT_CONFLICT.', example: 3 });
export const VersionOutput = z.number().int().meta({ description: 'Versión actual (envíela al guardar).', example: 3 });

/** Parámetros de paginación con límites máximos y orden por lista blanca. */
export function listQuery<E extends z.ZodRawShape>(sortFields: readonly string[], extra: E = {} as E) {
  const sorts = sortFields.flatMap((f) => [f, `-${f}`]);
  return z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1).meta({ example: 1 }),
    pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20, description: 'Máximo 100' }),
    sort: (sorts.length ? z.enum(sorts as [string, ...string[]]) : z.string().max(40))
      .optional()
      .meta({ example: sorts[1] ?? sorts[0], description: `Valores permitidos: ${sorts.join(', ') || 'ninguno'}` }),
    q: z.string().trim().max(100).optional().meta({ example: 'matrícula', description: 'Búsqueda de texto' }),
    ...extra,
  });
}

export const paginated = <T extends z.ZodType>(name: string, item: T) => named(name, z.strictObject({ data: z.array(item), meta: PageMeta }));
export const single = <T extends z.ZodType>(name: string, item: T) => named(name, z.strictObject({ data: item }));

export const Ok = named('Ok', z.strictObject({ data: z.strictObject({ ok: z.literal(true) }) }));

/** Booleano en multipart/query: acepta "true"/"false". */
export const BoolString = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
export const BoolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Resultado de un listado paginado en el formato estándar { data, meta }. */
export function paged<I, O>(result: { items: I[]; total: number; page: number; pageSize: number }, mapItem: (item: I) => O) {
  return {
    data: result.items.map(mapItem),
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)) },
  };
}
