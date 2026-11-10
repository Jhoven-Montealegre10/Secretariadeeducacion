"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOpenApiDocument = buildOpenApiDocument;
exports.swaggerPage = swaggerPage;
const swagger_1 = require("@nestjs/swagger");
const route_spec_1 = require("../route-spec");
const openapi_1 = require("./openapi");
function buildOpenApiDocument(app, audience = 'full') {
    const config = new swagger_1.DocumentBuilder()
        .setTitle(audience === 'public' ? `${openapi_1.API_INFO.title} (pública)` : openapi_1.API_INFO.title)
        .setDescription(openapi_1.API_INFO.description)
        .setVersion(openapi_1.API_INFO.version)
        .addServer('/')
        .build();
    const doc = swagger_1.SwaggerModule.createDocument(app, config, { operationIdFactory: (controller, method) => `${controller}_${method}` });
    const errorRef = (0, openapi_1.toOpenApi)(openapi_1.ErrorSchema);
    const byId = new Map(route_spec_1.ROUTES.filter((r) => r.kind === 'api').map((r) => [r.operationId, r]));
    for (const [path, item] of Object.entries(doc.paths)) {
        if (audience === 'public' && !path.startsWith('/api/v1/public')) {
            delete doc.paths[path];
            continue;
        }
        for (const op of Object.values(item)) {
            const spec = op.operationId ? byId.get(op.operationId) : undefined;
            if (!spec)
                continue;
            const unsafe = (0, route_spec_1.needsCsrf)(spec);
            op.security = spec.auth === 'public' && !unsafe ? [] : [{ sessionCookie: [], ...(unsafe ? { csrfToken: [] } : {}) }];
            op.responses ??= {};
            for (const code of (0, route_spec_1.errorCodes)(spec)) {
                op.responses[String(code)] = { description: openapi_1.ERROR_DESCRIPTIONS[code] ?? 'Error', content: { 'application/json': { schema: errorRef } } };
            }
        }
    }
    doc.tags = openapi_1.API_TAGS.filter((t) => audience !== 'public' || t.name === 'Público');
    doc.components ??= {};
    doc.components.schemas = { ...(doc.components.schemas ?? {}), ...(0, openapi_1.openApiComponents)() };
    if (audience === 'public') {
        // Solo los esquemas referenciados por las rutas públicas.
        const used = new Set();
        const walk = (node) => {
            if (Array.isArray(node))
                return node.forEach(walk);
            if (!node || typeof node !== 'object')
                return;
            for (const [k, v] of Object.entries(node)) {
                if (k === '$ref' && typeof v === 'string') {
                    const name = v.split('/').pop();
                    if (!used.has(name)) {
                        used.add(name);
                        walk(doc.components?.schemas?.[name]);
                    }
                }
                else
                    walk(v);
            }
        };
        walk(doc.paths);
        doc.components.schemas = Object.fromEntries(Object.entries(doc.components.schemas).filter(([k]) => used.has(k)));
    }
    else {
        doc.components.securitySchemes = {
            sessionCookie: {
                type: 'apiKey',
                in: 'cookie',
                name: 'sem.sid',
                description: 'Cookie de sesión HttpOnly emitida al completar el inicio de sesión con segundo factor. En producción se llama `__Host-sem.sid` y solo viaja por HTTPS. No es accesible desde JavaScript.',
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
function swaggerPage({ title, specUrl, mode }) {
    const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css"><link rel="stylesheet" href="/assets/css/swagger.css"></head>
<body><div class="docs-bar">GOV.CO · ${esc(title)}</div><div id="swagger" data-spec="${esc(specUrl)}" data-mode="${mode}"></div>
<script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/assets/js/swagger-init.js"></script></body></html>`;
}
//# sourceMappingURL=openapi-document.js.map