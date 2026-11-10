/**
 * Declaración única de cada ruta. Con un solo decorador se definen:
 *   acceso (público, sesión pendiente, autenticado o permiso) → límite de peticiones → CSRF →
 *   validación Zod de params/query/body → contrato de respuesta → documentación OpenAPI.
 * El guard global NIEGA cualquier ruta que no tenga esta declaración (denegación por defecto).
 */
import { applyDecorators, HttpCode, RequestMapping, RequestMethod, SetMetadata } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiExcludeEndpoint, ApiExtension, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import type { Permiso } from '../../domain/permissions';
import type { AppConfig } from '../../config/configuration';
import { toOpenApi } from './api/openapi';

export const ROUTE_SPEC = 'semibague:route-spec';

export type Access = 'public' | 'pending' | 'authenticated' | Permiso;

export type RateBucket = 'login' | 'mfa' | 'recovery' | 'upload' | 'pqrsd' | 'consulta';

export interface UploadSpec {
  field: string;
  maxFiles: number;
  maxBytes: (c: AppConfig) => number;
  /** Esquema documentado del formulario multipart. */
  form: z.ZodType;
}

export interface RouteSpec {
  auth: Access;
  rateLimit?: RateBucket;
  /** CSRF: por defecto obligatorio en POST/PUT/PATCH/DELETE. */
  csrf?: boolean;
  /** Ruta JSON de la API (sobre { data, meta }) o HTML/archivo. */
  kind: 'api' | 'web';
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tags?: string[];
  summary?: string;
  description?: string;
  status?: number;
  request?: { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };
  response?: { description: string; schema?: z.ZodType };
  errors?: number[];
  upload?: UploadSpec;
  /** Respuesta binaria (descarga): el controlador escribe la respuesta. */
  file?: { description: string; mime: string };
  /** Tamaño máximo del cuerpo JSON en bytes (por defecto 100 KB). */
  bodyLimit?: number;
  /** Respuesta con datos privados: Cache-Control no-store (por defecto en rutas privadas). */
  noStore?: boolean;
}

/** Registro de todas las rutas declaradas (para OpenAPI, pruebas de contrato y la matriz de permisos). */
export const ROUTES: Array<RouteSpec & { operationId: string }> = [];

const UNSAFE = new Set(['post', 'put', 'patch', 'delete']);
export const isUnsafe = (spec: Pick<RouteSpec, 'method'>) => UNSAFE.has(spec.method);
export const needsCsrf = (spec: RouteSpec) => spec.csrf ?? isUnsafe(spec);

function describeAuth(auth: Access): string {
  if (auth === 'public') return '**Acceso:** público.';
  if (auth === 'pending') return '**Acceso:** sesión con el primer factor (contraseña) verificado y el segundo factor pendiente.';
  if (auth === 'authenticated') return '**Acceso:** usuario autenticado con segundo factor (cualquier rol del panel).';
  return `**Acceso:** usuario autenticado con el permiso \`${auth}\`.`;
}

export function successStatus(spec: Pick<RouteSpec, 'status' | 'method'>): number {
  return spec.status ?? (spec.method === 'post' ? 201 : 200);
}

/** Códigos de error que puede devolver la ruta (documentados en OpenAPI). */
export function errorCodes(spec: RouteSpec): number[] {
  const errors = new Set(spec.errors ?? []);
  if (spec.auth !== 'public') {
    errors.add(401);
    errors.add(403);
  }
  if (needsCsrf(spec)) errors.add(403);
  if (spec.request?.body || spec.request?.query || spec.upload) errors.add(422);
  if (spec.rateLimit) errors.add(429);
  if (spec.upload || spec.request?.body) errors.add(413);
  if (spec.request?.params) errors.add(404);
  return [...errors].sort();
}

function objectProperties(schema: z.ZodType | undefined): Array<{ name: string; schema: Record<string, unknown>; required: boolean; description?: string }> {
  if (!schema) return [];
  const json = toOpenApi(schema, 'input') as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, s]) => ({
    name,
    schema: s,
    required: (json.required ?? []).includes(name),
    description: s.description as string | undefined,
  }));
}

type Spec = Omit<RouteSpec, 'kind' | 'method' | 'path'>;

function decorate(kind: RouteSpec['kind'], method: RouteSpec['method'], path: string, input: Spec): MethodDecorator {
  const spec: RouteSpec = { ...input, kind, method, path };
  const status = successStatus(spec);
  const register: MethodDecorator = (target, key) => {
    ROUTES.push({ ...spec, operationId: `${(target as { constructor: { name: string } }).constructor.name}_${String(key)}` });
  };
  const METHODS = {
    get: RequestMethod.GET,
    post: RequestMethod.POST,
    put: RequestMethod.PUT,
    patch: RequestMethod.PATCH,
    delete: RequestMethod.DELETE,
  } as const;
  // La ruta se declara UNA vez (formato OpenAPI {param}) y se registra en Nest como :param.
  const nestPath = path.replace(/\{(\w+)\}/g, ':$1');
  const decorators: Array<ClassDecorator | MethodDecorator | PropertyDecorator> = [
    RequestMapping({ path: nestPath, method: METHODS[method] }),
    SetMetadata(ROUTE_SPEC, spec),
    register,
    HttpCode(status),
  ];

  if (kind === 'web') {
    decorators.push(ApiExcludeEndpoint());
    return applyDecorators(...decorators);
  }

  decorators.push(
    ApiTags(...(spec.tags ?? [])),
    ApiOperation({
      summary: spec.summary,
      description: [spec.description, describeAuth(spec.auth), needsCsrf(spec) ? '**CSRF:** requiere la cabecera `X-CSRF-Token`.' : '']
        .filter(Boolean)
        .join('\n\n'),
    }),
  );
  if (typeof spec.auth === 'string' && spec.auth.includes('.')) decorators.push(ApiExtension('x-permiso', spec.auth));
  for (const p of objectProperties(spec.request?.params)) decorators.push(ApiParam({ name: p.name, required: true, schema: p.schema }));
  for (const q of objectProperties(spec.request?.query))
    decorators.push(ApiQuery({ name: q.name, required: q.required, schema: q.schema, description: q.description }));
  if (spec.upload) decorators.push(ApiConsumes('multipart/form-data'), ApiBody({ required: true, schema: toOpenApi(spec.upload.form, 'input') }));
  else if (spec.request?.body) decorators.push(ApiBody({ required: true, schema: toOpenApi(spec.request.body, 'input') }));

  if (spec.file) {
    decorators.push(
      ApiProduces(spec.file.mime),
      ApiResponse({ status, description: spec.file.description, content: { [spec.file.mime]: { schema: { type: 'string', format: 'binary' } } } }),
    );
  } else if (spec.response?.schema) {
    decorators.push(ApiResponse({ status, description: spec.response.description, schema: toOpenApi(spec.response.schema) }));
  } else {
    decorators.push(ApiResponse({ status, description: spec.response?.description ?? 'Operación exitosa, sin contenido.' }));
  }
  return applyDecorators(...decorators);
}

const factory =
  (kind: RouteSpec['kind']) =>
  (method: RouteSpec['method'], path: string, spec: Spec): MethodDecorator =>
    decorate(kind, method, path, spec);

/** Endpoint JSON de /api/v1 (con documentación OpenAPI). `path` es la ruta OpenAPI completa. */
export const Endpoint = factory('api');
/** Ruta HTML del sitio o del panel (sin documentación OpenAPI). */
export const WebRoute = factory('web');
