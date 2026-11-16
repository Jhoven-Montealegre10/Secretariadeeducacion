/**
 * Construye el documento OpenAPI desde los controladores (SwaggerModule de @nestjs/swagger) y lo
 * completa con lo declarado en cada @Endpoint: seguridad (cookie + CSRF), errores posibles,
 * permiso requerido y esquemas con nombre.
 *  - audiencia 'public': solo /api/v1/public/* (sin esquemas de seguridad).
 *  - audiencia 'full': toda la API (solo con sesión del panel).
 */
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { errorCodes, needsCsrf, ROUTES } from '../route-spec';
import { API_INFO, API_TAGS, ERROR_DESCRIPTIONS, ErrorSchema, openApiComponents, toOpenApi } from './openapi';

type Operation = Record<string, unknown> & { operationId?: string; responses?: Record<string, unknown> };

export function buildOpenApiDocument(app: INestApplication, audience: 'public' | 'full' = 'full'): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(audience === 'public' ? `${API_INFO.title} (pública)` : API_INFO.title)
    .setDescription(API_INFO.description)
    .setVersion(API_INFO.version)
    .addServer('/')
    .build();
  const doc = SwaggerModule.createDocument(app, config, { operationIdFactory: (controller, method) => `${controller}_${method}` });
  const errorRef = toOpenApi(ErrorSchema);
  const byId = new Map(ROUTES.filter((r) => r.kind === 'api').map((r) => [r.operationId, r]));

  for (const [path, item] of Object.entries(doc.paths)) {
    if (audience === 'public' && !path.startsWith('/api/v1/public')) {
      delete doc.paths[path];
      continue;
    }
    for (const op of Object.values(item as Record<string, Operation>)) {
      const spec = op.operationId ? byId.get(op.operationId) : undefined;
      if (!spec) continue;
      const unsafe = needsCsrf(spec);
      op.security = spec.auth === 'public' && !unsafe ? [] : [{ sessionCookie: [], ...(unsafe ? { csrfToken: [] } : {}) }];
      op.responses ??= {};
      for (const code of errorCodes(spec)) {
        op.responses[String(code)] = { description: ERROR_DESCRIPTIONS[code] ?? 'Error', content: { 'application/json': { schema: errorRef } } };
      }
    }
  }

  doc.tags = API_TAGS.filter((t) => audience !== 'public' || t.name === 'Público');
  doc.components ??= {};
  doc.components.schemas = { ...(doc.components.schemas ?? {}), ...(openApiComponents() as Record<string, object>) };
  if (audience === 'public') {
    // Solo los esquemas referenciados por las rutas públicas.
    const used = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (k === '$ref' && typeof v === 'string') {
          const name = v.split('/').pop() as string;
          if (!used.has(name)) {
            used.add(name);
            walk(doc.components?.schemas?.[name]);
          }
        } else walk(v);
      }
    };
    walk(doc.paths);
    doc.components.schemas = Object.fromEntries(Object.entries(doc.components.schemas).filter(([k]) => used.has(k)));
  } else {
    doc.components.securitySchemes = {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'sem.sid',
        description:
          'Cookie de sesión HttpOnly emitida al completar el inicio de sesión con segundo factor. En producción se llama `__Host-sem.sid` y solo viaja por HTTPS. No es accesible desde JavaScript.',
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Token anti-CSRF ligado a la sesión. Se obtiene con `GET /api/v1/auth/csrf` y es obligatorio en toda petición POST, PUT, PATCH o DELETE.',
      },
    };
  }
  return doc;
}

/** Página HTML de Swagger UI servida desde swagger-ui-dist (sin scripts en línea: compatible con la CSP). */
export function swaggerPage({ title, specUrl, mode }: { title: string; specUrl: string; mode: 'public' | 'admin' | 'readonly' }): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css"><link rel="stylesheet" href="/assets/css/swagger.css"></head>
<body><div class="docs-bar">GOV.CO · ${esc(title)}</div><div id="swagger" data-spec="${esc(specUrl)}" data-mode="${mode}"></div>
<script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/assets/js/swagger-init.js"></script></body></html>`;
}
