/**
 * Manejo centralizado de errores. Al público nunca se envían trazas, consultas, rutas internas
 * ni mensajes técnicos: solo un código, un mensaje comprensible y un ID de solicitud.
 * Los accesos denegados quedan en la bitácora de auditoría. Los errores de PostgreSQL por
 * tiempo de espera o pool agotado se responden como 503 (reintentable), sin detalles.
 */
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../../../application/audit.service';
import { AppError, ForbiddenError } from '../../../domain/errors';
import { APP_CONFIG, type AppConfig } from '../../../config/configuration';
import { PG, pgCode } from '../../../infrastructure/database/db.service';
import type { AppRequest } from '../http.types';
import { SITE } from '../../../config/site';

const TITLES: Readonly<Record<number, string>> = {
  401: 'Inicie sesión',
  403: 'Acceso denegado',
  404: 'Página no encontrada',
  413: 'Archivo demasiado grande',
  429: 'Demasiadas solicitudes',
  503: 'Servicio temporalmente no disponible',
};

export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as { type?: string; status?: number; message?: string } | null;
  if (e?.type === 'entity.too.large') return new AppError('La solicitud supera el tamaño permitido.', { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  if (e?.type === 'entity.parse.failed') return new AppError('El cuerpo de la solicitud no es JSON válido.', { status: 400, code: 'BAD_REQUEST' });
  if (err instanceof HttpException) {
    const status = err.getStatus();
    if (status === 404) return new AppError('El recurso no existe.', { status: 404, code: 'NOT_FOUND' });
    if (status === 405) return new AppError('Método no permitido.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    if (status < 500) return new AppError('La solicitud no es válida.', { status, code: 'BAD_REQUEST' });
  }
  const code = pgCode(err);
  const message = String(e?.message ?? '');
  if (
    code === PG.QUERY_CANCELED ||
    code === PG.LOCK_TIMEOUT ||
    code === PG.DEADLOCK ||
    code === PG.SERIALIZATION_FAILURE ||
    /timeout exceeded when trying to connect/i.test(message)
  ) {
    return Object.assign(new AppError('El servicio está ocupado. Intente de nuevo en unos segundos.', { status: 503, code: 'SERVICE_BUSY' }), { cause: err });
  }
  return Object.assign(new AppError('Ocurrió un error inesperado. Intente de nuevo más tarde.', { status: 500, code: 'INTERNAL_ERROR' }), { cause: err });
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async catch(raw: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AppRequest>();
    const res = ctx.getResponse<Response>();
    const err = normalizeError(raw);

    if (err.status >= 500 && !this.config.isTest) {
      // Solo método, ruta e ID: nunca cuerpo ni cabeceras (pueden contener credenciales).
      const cause = (err as { cause?: { stack?: string; message?: string } }).cause;
      this.logger.error(`[${req.id}] ${req.method} ${req.path}: ${cause?.stack ?? cause?.message ?? err.stack ?? err.message}`);
    }
    if (err.status === 503) res.setHeader('Retry-After', '5');
    if (err.status === 403 && req.actor) {
      await this.audit
        .record({
          actor: req.actor,
          accion: 'acceso_denegado',
          recurso: req.path.slice(0, 120),
          resultado: 'denegado',
          detalle: raw instanceof ForbiddenError && raw.permiso ? `requiere ${raw.permiso}` : err.code,
        })
        .catch(() => undefined); // la auditoría no debe ocultar el error original
    }
    if (res.headersSent) return;

    const rate = (raw as { rate?: { limit: number; resetSeconds: number } }).rate;
    if (rate) res.setHeader('Retry-After', String(rate.resetSeconds));

    const wantsJson = req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
    if (wantsJson) {
      res
        .status(err.status)
        .json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}), requestId: req.id } });
      return;
    }
    res.status(err.status).render('errors/error', {
      title: TITLES[err.status] ?? 'Error',
      status: err.status,
      message: err.status === 404 ? 'La página que busca no existe o fue movida.' : err.message,
      requestId: req.id,
      nav: '',
      site: SITE,
      path: req.path,
      vistaPrevia: false,
      actor: req.actor ?? null,
      csrfToken: () => '',
    });
  }
}
