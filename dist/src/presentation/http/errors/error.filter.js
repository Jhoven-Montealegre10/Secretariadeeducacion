"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorFilter = void 0;
exports.normalizeError = normalizeError;
/**
 * Manejo centralizado de errores. Al público nunca se envían trazas, consultas, rutas internas
 * ni mensajes técnicos: solo un código, un mensaje comprensible y un ID de solicitud.
 * Los accesos denegados quedan en la bitácora de auditoría. Los errores de PostgreSQL por
 * tiempo de espera o pool agotado se responden como 503 (reintentable), sin detalles.
 */
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../../../application/audit.service");
const errors_1 = require("../../../domain/errors");
const configuration_1 = require("../../../config/configuration");
const db_service_1 = require("../../../infrastructure/database/db.service");
const site_1 = require("../../../config/site");
const TITLES = {
    401: 'Inicie sesión',
    403: 'Acceso denegado',
    404: 'Página no encontrada',
    413: 'Archivo demasiado grande',
    429: 'Demasiadas solicitudes',
    503: 'Servicio temporalmente no disponible',
};
function normalizeError(err) {
    if (err instanceof errors_1.AppError)
        return err;
    const e = err;
    if (e?.type === 'entity.too.large')
        return new errors_1.AppError('La solicitud supera el tamaño permitido.', { status: 413, code: 'PAYLOAD_TOO_LARGE' });
    if (e?.type === 'entity.parse.failed')
        return new errors_1.AppError('El cuerpo de la solicitud no es JSON válido.', { status: 400, code: 'BAD_REQUEST' });
    if (err instanceof common_1.HttpException) {
        const status = err.getStatus();
        if (status === 404)
            return new errors_1.AppError('El recurso no existe.', { status: 404, code: 'NOT_FOUND' });
        if (status === 405)
            return new errors_1.AppError('Método no permitido.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
        if (status < 500)
            return new errors_1.AppError('La solicitud no es válida.', { status, code: 'BAD_REQUEST' });
    }
    const code = (0, db_service_1.pgCode)(err);
    const message = String(e?.message ?? '');
    if (code === db_service_1.PG.QUERY_CANCELED ||
        code === db_service_1.PG.LOCK_TIMEOUT ||
        code === db_service_1.PG.DEADLOCK ||
        code === db_service_1.PG.SERIALIZATION_FAILURE ||
        /timeout exceeded when trying to connect/i.test(message)) {
        return Object.assign(new errors_1.AppError('El servicio está ocupado. Intente de nuevo en unos segundos.', { status: 503, code: 'SERVICE_BUSY' }), { cause: err });
    }
    return Object.assign(new errors_1.AppError('Ocurrió un error inesperado. Intente de nuevo más tarde.', { status: 500, code: 'INTERNAL_ERROR' }), { cause: err });
}
let ErrorFilter = class ErrorFilter {
    audit;
    config;
    logger = new common_1.Logger('HTTP');
    constructor(audit, config) {
        this.audit = audit;
        this.config = config;
    }
    async catch(raw, host) {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest();
        const res = ctx.getResponse();
        const err = normalizeError(raw);
        if (err.status >= 500 && !this.config.isTest) {
            // Solo método, ruta e ID: nunca cuerpo ni cabeceras (pueden contener credenciales).
            const cause = err.cause;
            this.logger.error(`[${req.id}] ${req.method} ${req.path}: ${cause?.stack ?? cause?.message ?? err.stack ?? err.message}`);
        }
        if (err.status === 503)
            res.setHeader('Retry-After', '5');
        if (err.status === 403 && req.actor) {
            await this.audit
                .record({
                actor: req.actor,
                accion: 'acceso_denegado',
                recurso: req.path.slice(0, 120),
                resultado: 'denegado',
                detalle: raw instanceof errors_1.ForbiddenError && raw.permiso ? `requiere ${raw.permiso}` : err.code,
            })
                .catch(() => undefined); // la auditoría no debe ocultar el error original
        }
        if (res.headersSent)
            return;
        const rate = raw.rate;
        if (rate)
            res.setHeader('Retry-After', String(rate.resetSeconds));
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
            site: site_1.SITE,
            path: req.path,
            vistaPrevia: false,
            actor: req.actor ?? null,
            csrfToken: () => '',
        });
    }
};
exports.ErrorFilter = ErrorFilter;
exports.ErrorFilter = ErrorFilter = __decorate([
    (0, common_1.Catch)(),
    __param(1, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [audit_service_1.AuditService, Object])
], ErrorFilter);
//# sourceMappingURL=error.filter.js.map