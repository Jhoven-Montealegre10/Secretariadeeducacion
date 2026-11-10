"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebRoute = exports.Endpoint = exports.needsCsrf = exports.isUnsafe = exports.ROUTES = exports.ROUTE_SPEC = void 0;
exports.successStatus = successStatus;
exports.errorCodes = errorCodes;
/**
 * Declaración única de cada ruta. Con un solo decorador se definen:
 *   acceso (público, sesión pendiente, autenticado o permiso) → límite de peticiones → CSRF →
 *   validación Zod de params/query/body → contrato de respuesta → documentación OpenAPI.
 * El guard global NIEGA cualquier ruta que no tenga esta declaración (denegación por defecto).
 */
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const openapi_1 = require("./api/openapi");
exports.ROUTE_SPEC = 'semibague:route-spec';
/** Registro de todas las rutas declaradas (para OpenAPI, pruebas de contrato y la matriz de permisos). */
exports.ROUTES = [];
const UNSAFE = new Set(['post', 'put', 'patch', 'delete']);
const isUnsafe = (spec) => UNSAFE.has(spec.method);
exports.isUnsafe = isUnsafe;
const needsCsrf = (spec) => spec.csrf ?? (0, exports.isUnsafe)(spec);
exports.needsCsrf = needsCsrf;
function describeAuth(auth) {
    if (auth === 'public')
        return '**Acceso:** público.';
    if (auth === 'pending')
        return '**Acceso:** sesión con el primer factor (contraseña) verificado y el segundo factor pendiente.';
    if (auth === 'authenticated')
        return '**Acceso:** usuario autenticado con segundo factor (cualquier rol del panel).';
    return `**Acceso:** usuario autenticado con el permiso \`${auth}\`.`;
}
function successStatus(spec) {
    return spec.status ?? (spec.method === 'post' ? 201 : 200);
}
/** Códigos de error que puede devolver la ruta (documentados en OpenAPI). */
function errorCodes(spec) {
    const errors = new Set(spec.errors ?? []);
    if (spec.auth !== 'public') {
        errors.add(401);
        errors.add(403);
    }
    if ((0, exports.needsCsrf)(spec))
        errors.add(403);
    if (spec.request?.body || spec.request?.query || spec.upload)
        errors.add(422);
    if (spec.rateLimit)
        errors.add(429);
    if (spec.upload || spec.request?.body)
        errors.add(413);
    if (spec.request?.params)
        errors.add(404);
    return [...errors].sort();
}
function objectProperties(schema) {
    if (!schema)
        return [];
    const json = (0, openapi_1.toOpenApi)(schema, 'input');
    return Object.entries(json.properties ?? {}).map(([name, s]) => ({
        name,
        schema: s,
        required: (json.required ?? []).includes(name),
        description: s.description,
    }));
}
function decorate(kind, method, path, input) {
    const spec = { ...input, kind, method, path };
    const status = successStatus(spec);
    const register = (target, key) => {
        exports.ROUTES.push({ ...spec, operationId: `${target.constructor.name}_${String(key)}` });
    };
    const METHODS = {
        get: common_1.RequestMethod.GET,
        post: common_1.RequestMethod.POST,
        put: common_1.RequestMethod.PUT,
        patch: common_1.RequestMethod.PATCH,
        delete: common_1.RequestMethod.DELETE,
    };
    // La ruta se declara UNA vez (formato OpenAPI {param}) y se registra en Nest como :param.
    const nestPath = path.replace(/\{(\w+)\}/g, ':$1');
    const decorators = [
        (0, common_1.RequestMapping)({ path: nestPath, method: METHODS[method] }),
        (0, common_1.SetMetadata)(exports.ROUTE_SPEC, spec),
        register,
        (0, common_1.HttpCode)(status),
    ];
    if (kind === 'web') {
        decorators.push((0, swagger_1.ApiExcludeEndpoint)());
        return (0, common_1.applyDecorators)(...decorators);
    }
    decorators.push((0, swagger_1.ApiTags)(...(spec.tags ?? [])), (0, swagger_1.ApiOperation)({
        summary: spec.summary,
        description: [spec.description, describeAuth(spec.auth), (0, exports.needsCsrf)(spec) ? '**CSRF:** requiere la cabecera `X-CSRF-Token`.' : '']
            .filter(Boolean)
            .join('\n\n'),
    }));
    if (typeof spec.auth === 'string' && spec.auth.includes('.'))
        decorators.push((0, swagger_1.ApiExtension)('x-permiso', spec.auth));
    for (const p of objectProperties(spec.request?.params))
        decorators.push((0, swagger_1.ApiParam)({ name: p.name, required: true, schema: p.schema }));
    for (const q of objectProperties(spec.request?.query))
        decorators.push((0, swagger_1.ApiQuery)({ name: q.name, required: q.required, schema: q.schema, description: q.description }));
    if (spec.upload)
        decorators.push((0, swagger_1.ApiConsumes)('multipart/form-data'), (0, swagger_1.ApiBody)({ required: true, schema: (0, openapi_1.toOpenApi)(spec.upload.form, 'input') }));
    else if (spec.request?.body)
        decorators.push((0, swagger_1.ApiBody)({ required: true, schema: (0, openapi_1.toOpenApi)(spec.request.body, 'input') }));
    if (spec.file) {
        decorators.push((0, swagger_1.ApiProduces)(spec.file.mime), (0, swagger_1.ApiResponse)({ status, description: spec.file.description, content: { [spec.file.mime]: { schema: { type: 'string', format: 'binary' } } } }));
    }
    else if (spec.response?.schema) {
        decorators.push((0, swagger_1.ApiResponse)({ status, description: spec.response.description, schema: (0, openapi_1.toOpenApi)(spec.response.schema) }));
    }
    else {
        decorators.push((0, swagger_1.ApiResponse)({ status, description: spec.response?.description ?? 'Operación exitosa, sin contenido.' }));
    }
    return (0, common_1.applyDecorators)(...decorators);
}
const factory = (kind) => (method, path, spec) => decorate(kind, method, path, spec);
/** Endpoint JSON de /api/v1 (con documentación OpenAPI). `path` es la ruta OpenAPI completa. */
exports.Endpoint = factory('api');
/** Ruta HTML del sitio o del panel (sin documentación OpenAPI). */
exports.WebRoute = factory('web');
//# sourceMappingURL=route-spec.js.map