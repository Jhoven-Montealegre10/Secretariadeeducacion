'use strict';
/**
 * Manejo centralizado de errores. Al público nunca se envían trazas, consultas, rutas
 * internas ni mensajes técnicos: solo un código, un mensaje comprensible y un ID de
 * solicitud para soporte. Los accesos denegados quedan en la bitácora de auditoría.
 */
const crypto = require('node:crypto');
const config = require('../../../config');
const { AppError } = require('../../../domain/errors');

function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function normalize(err) {
  if (err instanceof AppError) return err;
  if (err?.type === 'entity.too.large') return new AppError('La solicitud supera el tamaño permitido.', { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  if (err?.type === 'entity.parse.failed') return new AppError('El cuerpo de la solicitud no es JSON válido.', { status: 400, code: 'BAD_REQUEST' });
  const wrapped = new AppError('Ocurrió un error inesperado. Intente de nuevo más tarde.', { status: 500, code: 'INTERNAL_ERROR' });
  /** @type {any} */ (wrapped).cause = err;
  return wrapped;
}

function createErrorHandler(audit) {
  // eslint-disable-next-line no-unused-vars
  return (rawErr, req, res, next) => {
    const err = normalize(rawErr);
    if (err.status >= 500 && !config.isTest) {
      // Solo método, ruta e ID: nunca cuerpo ni cabeceras (pueden contener credenciales).
      console.error(`[error ${req.id}] ${req.method} ${req.path}:`, /** @type {any} */ (err).cause?.stack || err.stack || err.message);
    }
    if (err.status === 403 && req.actor) {
      try {
        audit.record({
          actor: req.actor,
          accion: 'acceso_denegado',
          recurso: req.path.slice(0, 120),
          resultado: 'denegado',
          detalle: rawErr.permiso ? `requiere ${rawErr.permiso}` : err.code,
        });
      } catch {
        /* la auditoría no debe ocultar el error original */
      }
    }
    if (res.headersSent) return;

    const wantsJson = req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
    if (wantsJson) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}), requestId: req.id } });
      return;
    }
    const titles = {
      401: 'Inicie sesión',
      403: 'Acceso denegado',
      404: 'Página no encontrada',
      413: 'Archivo demasiado grande',
      429: 'Demasiadas solicitudes',
    };
    res.status(err.status).render('errors/error', {
      title: titles[err.status] || 'Error',
      status: err.status,
      message: err.status === 404 ? 'La página que busca no existe o fue movida.' : err.message,
      requestId: req.id,
      nav: '',
    });
  };
}

function notFound(req, res, next) {
  next(new AppError('El recurso no existe.', { status: 404, code: 'NOT_FOUND' }));
}

module.exports = { requestId, createErrorHandler, notFound };
