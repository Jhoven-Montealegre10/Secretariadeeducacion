/**
 * Errores del dominio. Los servicios lanzan estos errores; el filtro global de la capa
 * HTTP los traduce a códigos y respuestas JSON/HTML de forma centralizada.
 */
export interface ErrorDetail {
  campo: string;
  mensaje: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Los datos enviados no son válidos.', details?: ErrorDetail[]) {
    super(message, { status: 422, code: 'VALIDATION_ERROR', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Debe iniciar sesión.', code = 'UNAUTHORIZED') {
    super(message, { status: 401, code });
  }
}

export class ForbiddenError extends AppError {
  /** Permiso requerido (solo para la auditoría; nunca se envía al cliente). */
  permiso: string | null = null;
  constructor(message = 'No tiene permisos para realizar esta acción.') {
    super(message, { status: 403, code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'El recurso no existe.') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown, code = 'CONFLICT') {
    super(message, { status: 409, code, details });
  }
}

/** Otro usuario guardó el recurso después de que usted lo abrió (bloqueo optimista). */
export class EditConflictError extends ConflictError {
  constructor(versionActual: number) {
    super(
      'Otra persona modificó este contenido después de que usted lo abrió. Recargue para ver la versión actual antes de guardar.',
      { versionActual },
      'EDIT_CONFLICT',
    );
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados intentos. Espere unos minutos.') {
    super(message, { status: 429, code: 'TOO_MANY_REQUESTS' });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'El archivo o la solicitud supera el tamaño permitido.') {
    super(message, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
}
