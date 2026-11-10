/**
 * OpenAPI generado desde el código: los esquemas Zod que validan cada endpoint son los mismos
 * que se documentan (z.toJSONSchema nativo de Zod 4). Los esquemas con nombre (`named`) pasan a
 * `components.schemas` y se referencian con $ref.
 */
import { z } from 'zod';

export { z };

type JsonSchema = Record<string, unknown>;

const COMPONENT_PREFIX = '#/components/schemas/';
const components = new Map<string, JsonSchema>();
const MAX_SAFE = 9007199254740991;

/** Registra un esquema con nombre (aparece en components.schemas). */
export function named<T extends z.ZodType>(name: string, schema: T): T {
  return schema.meta({ id: name });
}

/** Limpia el JSON Schema: $ref a components, sin $id ni límites enteros por defecto de Zod. */
function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== 'object') return node;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node as JsonSchema)) {
    if (k === '$id' || k === '$schema' || k === 'definitions' || k === 'id') continue;
    if (k === '$ref' && typeof v === 'string') {
      out.$ref = v.replace('#/definitions/', COMPONENT_PREFIX);
      continue;
    }
    if ((k === 'minimum' && v === -MAX_SAFE) || (k === 'maximum' && v === MAX_SAFE)) continue;
    out[k] = clean(v);
  }
  return out;
}

/** Convierte un esquema Zod a OpenAPI 3.0 y acumula sus esquemas con nombre en components. */
export function toOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any', io, cycles: 'ref', reused: 'inline' }) as JsonSchema;
  const defs = (json.definitions ?? {}) as Record<string, JsonSchema>;
  for (const [name, def] of Object.entries(defs)) if (!components.has(name)) components.set(name, clean(def) as JsonSchema);
  const top = clean(json) as JsonSchema;
  // Esquema raíz con nombre: queda en components y se referencia.
  const id = (z.globalRegistry.get(schema) as { id?: string } | undefined)?.id;
  if (id) {
    if (!components.has(id)) components.set(id, top.$ref ? (clean(defs[id]) as JsonSchema) : top);
    return { $ref: `${COMPONENT_PREFIX}${id}` };
  }
  return top;
}

export function openApiComponents(): Record<string, JsonSchema> {
  return Object.fromEntries([...components.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

// ---------------------------------------------------------------- Comunes

export const ErrorSchema = named(
  'Error',
  z
    .object({
      error: z.object({
        code: z.string().meta({ example: 'VALIDATION_ERROR' }),
        message: z.string().meta({ example: 'Los datos enviados no son válidos.' }),
        details: z.unknown().optional().meta({ description: 'Lista { campo, mensaje } en errores de validación; datos del conflicto en 409.' }),
        requestId: z.string().meta({ example: '6f1c2a9e-3b2d-4c1a-9f0e-7d8c5b4a3e21' }),
      }),
    })
    .meta({ description: 'Formato único de error para toda la API.' }),
);

export const PageMeta = named(
  'PaginacionMeta',
  z.strictObject({
    page: z.number().int().meta({ example: 1 }),
    pageSize: z.number().int().meta({ example: 20 }),
    total: z.number().int().meta({ example: 42 }),
    totalPages: z.number().int().meta({ example: 3 }),
  }),
);

export const ERROR_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'Solicitud mal formada.',
  401: 'No autenticado o la sesión expiró.',
  403: 'Sin permiso para esta operación, o token CSRF inválido.',
  404: 'El recurso no existe o no es visible para usted.',
  409: 'Conflicto con el estado actual (duplicado, en uso, último administrador, o EDIT_CONFLICT: otra persona guardó antes).',
  413: 'El cuerpo o el archivo supera el tamaño permitido.',
  422: 'Error de validación de los datos.',
  429: 'Demasiadas solicitudes; intente más tarde.',
};

export const API_INFO = {
  title: 'API del Portal de la Secretaría de Educación de Ibagué',
  version: '1.1.0',
  description: [
    'API REST del portal. Se divide en **endpoints públicos** (`/api/v1/public/*`, contenido publicado, sin autenticación) y',
    '**endpoints privados** (administración: requieren sesión con segundo factor, permiso por módulo/acción y token CSRF).',
    '',
    '**Política de versiones:** `v1` es estable. Los cambios compatibles (campos nuevos opcionales, endpoints nuevos) se',
    'agregan sin cambiar la versión. Un cambio incompatible se publica en `/api/v2`; `v1` se mantiene al menos 6 meses',
    'y sus respuestas incluyen las cabeceras `Deprecation` y `Sunset`.',
    '',
    '**Ediciones concurrentes (1.1):** los recursos editables devuelven `version`. Envíela al guardar; si otra persona',
    'guardó antes, la API responde `409` con código `EDIT_CONFLICT` y `details.versionActual`. Si no se envía, el último',
    'guardado prevalece (compatibilidad con clientes anteriores).',
    '',
    '**Paginación:** `page` (desde 1) y `pageSize` (máx. 100). **Orden:** `sort=campo` o `sort=-campo` (descendente).',
    'Todos los ejemplos son ficticios.',
  ].join('\n'),
};

export const API_TAGS = [
  { name: 'Público', description: 'Contenido publicado para visitantes e integraciones de solo lectura.' },
  { name: 'Autenticación', description: 'Inicio de sesión, segundo factor, recuperación y cierre de sesión.' },
  { name: 'Mi cuenta', description: 'Operaciones del usuario autenticado sobre su propia cuenta.' },
  { name: 'Usuarios', description: 'Administración de usuarios (solo administradores).' },
  { name: 'Roles', description: 'Roles y permisos por módulo y acción (solo administradores).' },
  { name: 'Multimedia', description: 'Biblioteca de imágenes y audios.' },
  { name: 'Páginas', description: 'Páginas editables por bloques.' },
  { name: 'Noticias', description: 'Noticias con imagen principal y galería.' },
  { name: 'Sliders', description: 'Carruseles por ubicación y sus diapositivas.' },
  { name: 'Normatividad', description: 'Circulares, resoluciones, decretos y acuerdos.' },
  { name: 'PQRSD', description: 'Gestión de peticiones, quejas, reclamos, sugerencias y denuncias.' },
  { name: 'Estadísticas', description: 'Métricas agregadas de visitas (solo administradores).' },
  { name: 'Auditoría', description: 'Bitácora de acciones (solo administradores).' },
  { name: 'Sistema', description: 'Métricas operativas del servidor (solo administradores).' },
];
