/**
 * Interceptor de las rutas declaradas:
 *  - límite del cuerpo por ruta y recepción de archivos multipart (en memoria, con límites);
 *  - validación de entrada con Zod (params, query, body) → req.valid;
 *  - respuesta en el sobre { data, meta } y, fuera de producción, validación ESTRICTA del
 *    contrato de salida: si un controlador devolviera un campo no documentado (p. ej. un hash),
 *    la petición falla y las pruebas lo detectan;
 *  - Cache-Control: no-store en respuestas privadas.
 */
import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import multer from 'multer';
import { from, mergeMap, type Observable } from 'rxjs';
import type { z } from 'zod';
import { PayloadTooLargeError, ValidationError } from '../../../domain/errors';
import { APP_CONFIG, type AppConfig } from '../../../config/configuration';
import type { AppRequest } from '../http.types';
import { ROUTE_SPEC, successStatus, type RouteSpec, type UploadSpec } from '../route-spec';

const DEFAULT_BODY_LIMIT = 100 * 1024;

export function zodDetails(error: z.ZodError, prefix = ''): Array<{ campo: string; mensaje: string }> {
  return error.issues.map((i) => ({ campo: [prefix, ...i.path.map(String)].filter(Boolean).join('.') || prefix || 'body', mensaje: i.message }));
}

@Injectable()
export class ApiInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<RouteSpec | undefined>(ROUTE_SPEC, context.getHandler());
    if (!spec) return next.handle();
    const req = context.switchToHttp().getRequest<AppRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    return from(this.prepare(spec, req, res)).pipe(
      mergeMap(() => next.handle()),
      mergeMap(async (result: unknown) => this.finish(spec, res, result)),
    );
  }

  private async prepare(spec: RouteSpec, req: AppRequest, res: Response): Promise<void> {
    if (spec.noStore ?? (spec.kind === 'api' && !spec.path.startsWith('/api/v1/public'))) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }
    const declared = Number(req.get('content-length') ?? 0);
    if (spec.upload) await this.receiveFiles(spec.upload, req, res);
    else if (spec.kind === 'api' && declared > (spec.bodyLimit ?? DEFAULT_BODY_LIMIT))
      throw new PayloadTooLargeError('La solicitud supera el tamaño permitido.');

    const valid: AppRequest['valid'] = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = spec.request?.[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) throw new ValidationError(undefined, zodDetails(result.error, part === 'body' ? '' : part));
      valid[part] = result.data;
    }
    req.valid = valid;
  }

  /** Recepción multipart en memoria con límite TOTAL de la solicitud antes de leerla (evita agotar la memoria). */
  private receiveFiles(upload: UploadSpec, req: AppRequest, res: Response): Promise<void> {
    const maxRequest = this.config.uploads.maxRequestBytes;
    const declared = Number(req.get('content-length') ?? 0);
    if (!req.get('content-length') || declared > maxRequest) {
      return Promise.reject(new PayloadTooLargeError(`La carga supera el máximo de ${Math.round(maxRequest / 1048576)} MB por envío.`));
    }
    const maxBytes = upload.maxBytes(this.config);
    const m = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: maxBytes, files: upload.maxFiles, fields: 20, fieldSize: 20 * 1024, parts: upload.maxFiles + 20 },
    });
    const handler = upload.maxFiles > 1 ? m.array(upload.field, upload.maxFiles) : m.single(upload.field);
    return new Promise((resolve, reject) => {
      handler(req, res, (err?: unknown) => {
        if (!err) return resolve();
        const code = (err as { code?: string }).code;
        if (code === 'LIMIT_FILE_SIZE') return reject(new PayloadTooLargeError(`El archivo supera el máximo de ${Math.round(maxBytes / 1048576)} MB.`));
        if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE')
          return reject(new ValidationError(`Máximo ${upload.maxFiles} archivo(s) en el campo "${upload.field}".`));
        return reject(new ValidationError('La carga del archivo no es válida.'));
      });
    });
  }

  private finish(spec: RouteSpec, res: Response, result: unknown): unknown {
    if (spec.kind === 'web' || spec.file || res.headersSent) return result;
    const status = successStatus(spec);
    if (status === 204 || result === undefined) {
      res.status(204);
      return undefined;
    }
    const r = result as { data: unknown; meta?: unknown };
    const body = r.meta ? { data: r.data, meta: r.meta } : { data: r.data };
    if (!this.config.isProd && spec.response?.schema) {
      const check = spec.response.schema.safeParse(body);
      if (!check.success)
        throw new Error(`Respuesta fuera de contrato en ${spec.method.toUpperCase()} ${spec.path}: ${JSON.stringify(check.error.issues.slice(0, 3))}`);
    }
    return body;
  }
}
