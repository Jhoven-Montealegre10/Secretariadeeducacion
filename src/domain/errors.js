'use strict';
/**
 * Errores del dominio. Los servicios lanzan estos errores; la capa de presentación
 * los traduce a códigos HTTP y respuestas JSON/HTML de forma centralizada.
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, details?: any, expose?: boolean }} [options]
   */
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = undefined, expose = true } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos.', details) {
    super(message, { status: 422, code: 'VALIDATION_ERROR', details });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Debe iniciar sesión.', code = 'UNAUTHORIZED') {
    super(message, { status: 401, code });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'No tiene permisos para realizar esta acción.') {
    super(message, { status: 403, code: 'FORBIDDEN' });
    /** @type {string | null} permiso requerido (solo para la auditoría) */
    this.permiso = null;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'El recurso no existe.') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends AppError {
  constructor(message, details) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados intentos. Espere unos minutos.') {
    super(message, { status: 429, code: 'TOO_MANY_REQUESTS' });
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message = 'El archivo o la solicitud supera el tamaño permitido.') {
    super(message, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  PayloadTooLargeError,
};
