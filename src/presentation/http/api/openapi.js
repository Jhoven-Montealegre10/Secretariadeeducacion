'use strict';
/**
 * Registro OpenAPI 3.1. Los esquemas Zod que validan cada endpoint son los mismos que se
 * documentan: la especificación se GENERA desde el código, no se escribe a mano.
 */
const { z } = require('zod');
const { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } = require('@asteasolutions/zod-to-openapi');

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
const routes = []; // metadatos de cada ruta registrada (para pruebas de contrato y la doc pública)

registry.registerComponent('securitySchemes', 'sessionCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sem.sid',
  description:
    'Cookie de sesión HttpOnly emitida al completar el inicio de sesión con segundo factor. En producción se llama `__Host-sem.sid` y solo viaja por HTTPS. No es accesible desde JavaScript.',
});
registry.registerComponent('securitySchemes', 'csrfToken', {
  type: 'apiKey',
  in: 'header',
  name: 'X-CSRF-Token',
  description: 'Token anti-CSRF ligado a la sesión. Se obtiene con `GET /api/v1/auth/csrf` y es obligatorio en toda petición POST, PUT, PATCH o DELETE.',
});

const ErrorSchema = registry.register(
  'Error',
  z
    .object({
      error: z.object({
        code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
        message: z.string().openapi({ example: 'Los datos enviados no son válidos.' }),
        details: z.array(z.object({ campo: z.string(), mensaje: z.string() })).optional(),
        requestId: z.string().openapi({ example: '6f1c2a9e-3b2d-4c1a-9f0e-7d8c5b4a3e21' }),
      }),
    })
    .openapi({ description: 'Formato único de error para toda la API.' }),
);

const PageMeta = registry.register(
  'PaginacionMeta',
  z.object({
    page: z.number().int().openapi({ example: 1 }),
    pageSize: z.number().int().openapi({ example: 20 }),
    total: z.number().int().openapi({ example: 42 }),
    totalPages: z.number().int().openapi({ example: 3 }),
  }),
);

const ERROR_DESCRIPTIONS = {
  400: 'Solicitud mal formada.',
  401: 'No autenticado o la sesión expiró.',
  403: 'Sin permiso para esta operación, o token CSRF inválido.',
  404: 'El recurso no existe o no es visible para usted.',
  409: 'Conflicto con el estado actual (duplicado, en uso, último administrador…).',
  413: 'El cuerpo o el archivo supera el tamaño permitido.',
  422: 'Error de validación de los datos.',
  429: 'Demasiadas solicitudes; intente más tarde.',
  503: 'El análisis antimalware no está disponible; intente cargar el archivo más tarde.',
};

function errorResponses(codes) {
  return Object.fromEntries(codes.map((c) => [c, { description: ERROR_DESCRIPTIONS[c], content: { 'application/json': { schema: ErrorSchema } } }]));
}

const INFO = {
  title: 'API del Portal de la Secretaría de Educación de Ibagué',
  version: '1.0.0',
  description: [
    'API REST del portal. Se divide en **endpoints públicos** (`/api/v1/public/*`, contenido publicado, sin autenticación) y',
    '**endpoints privados** (administración: requieren sesión con segundo factor, permiso por módulo/acción y token CSRF).',
    '',
    '**Política de versiones:** `v1` es estable. Los cambios compatibles (campos nuevos opcionales, endpoints nuevos) se',
    'agregan sin cambiar la versión. Un cambio incompatible se publica en `/api/v2`; `v1` se mantiene al menos 6 meses',
    'y sus respuestas incluyen las cabeceras `Deprecation` y `Sunset`.',
    '',
    '**Paginación:** `page` (desde 1) y `pageSize` (máx. 100). **Orden:** `sort=campo` o `sort=-campo` (descendente).',
    'Todos los ejemplos son ficticios.',
  ].join('\n'),
};

function buildDocument({ audience = 'full', serverUrl = '/' } = {}) {
  const definitions =
    audience === 'public' ? registry.definitions.filter((d) => d.type !== 'route' || d.route.path.startsWith('/api/v1/public')) : registry.definitions;
  const doc = new OpenApiGeneratorV31(definitions).generateDocument({
    openapi: '3.1.0',
    info: { ...INFO, title: audience === 'public' ? `${INFO.title} (pública)` : INFO.title },
    servers: [{ url: serverUrl }],
    tags: TAGS.filter((t) => audience !== 'public' || t.name === 'Público'),
  });
  if (audience === 'public') delete doc.components?.securitySchemes;
  return doc;
}

const TAGS = [
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
];

module.exports = { z, registry, routes, ErrorSchema, PageMeta, errorResponses, buildDocument };
