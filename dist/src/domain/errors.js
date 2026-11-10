"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayloadTooLargeError = exports.TooManyRequestsError = exports.EditConflictError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    status;
    code;
    details;
    constructor(message, options = {}) {
        super(message);
        this.name = new.target.name;
        this.status = options.status ?? 500;
        this.code = options.code ?? 'INTERNAL_ERROR';
        this.details = options.details;
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message = 'Los datos enviados no son válidos.', details) {
        super(message, { status: 422, code: 'VALIDATION_ERROR', details });
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends AppError {
    constructor(message = 'Debe iniciar sesión.', code = 'UNAUTHORIZED') {
        super(message, { status: 401, code });
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    /** Permiso requerido (solo para la auditoría; nunca se envía al cliente). */
    permiso = null;
    constructor(message = 'No tiene permisos para realizar esta acción.') {
        super(message, { status: 403, code: 'FORBIDDEN' });
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(message = 'El recurso no existe.') {
        super(message, { status: 404, code: 'NOT_FOUND' });
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message, details, code = 'CONFLICT') {
        super(message, { status: 409, code, details });
    }
}
exports.ConflictError = ConflictError;
/** Otro usuario guardó el recurso después de que usted lo abrió (bloqueo optimista). */
class EditConflictError extends ConflictError {
    constructor(versionActual) {
        super('Otra persona modificó este contenido después de que usted lo abrió. Recargue para ver la versión actual antes de guardar.', { versionActual }, 'EDIT_CONFLICT');
    }
}
exports.EditConflictError = EditConflictError;
class TooManyRequestsError extends AppError {
    constructor(message = 'Demasiados intentos. Espere unos minutos.') {
        super(message, { status: 429, code: 'TOO_MANY_REQUESTS' });
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class PayloadTooLargeError extends AppError {
    constructor(message = 'El archivo o la solicitud supera el tamaño permitido.') {
        super(message, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
    }
}
exports.PayloadTooLargeError = PayloadTooLargeError;
//# sourceMappingURL=errors.js.map