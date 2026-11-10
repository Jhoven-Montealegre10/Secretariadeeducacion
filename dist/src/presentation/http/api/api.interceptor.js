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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiInterceptor = void 0;
exports.zodDetails = zodDetails;
/**
 * Interceptor de las rutas declaradas:
 *  - límite del cuerpo por ruta y recepción de archivos multipart (en memoria, con límites);
 *  - validación de entrada con Zod (params, query, body) → req.valid;
 *  - respuesta en el sobre { data, meta } y, fuera de producción, validación ESTRICTA del
 *    contrato de salida: si un controlador devolviera un campo no documentado (p. ej. un hash),
 *    la petición falla y las pruebas lo detectan;
 *  - Cache-Control: no-store en respuestas privadas.
 */
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const multer_1 = __importDefault(require("multer"));
const rxjs_1 = require("rxjs");
const errors_1 = require("../../../domain/errors");
const configuration_1 = require("../../../config/configuration");
const route_spec_1 = require("../route-spec");
const DEFAULT_BODY_LIMIT = 100 * 1024;
function zodDetails(error, prefix = '') {
    return error.issues.map((i) => ({ campo: [prefix, ...i.path.map(String)].filter(Boolean).join('.') || prefix || 'body', mensaje: i.message }));
}
let ApiInterceptor = class ApiInterceptor {
    reflector;
    config;
    constructor(reflector, config) {
        this.reflector = reflector;
        this.config = config;
    }
    intercept(context, next) {
        const spec = this.reflector.get(route_spec_1.ROUTE_SPEC, context.getHandler());
        if (!spec)
            return next.handle();
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        return (0, rxjs_1.from)(this.prepare(spec, req, res)).pipe((0, rxjs_1.mergeMap)(() => next.handle()), (0, rxjs_1.mergeMap)(async (result) => this.finish(spec, res, result)));
    }
    async prepare(spec, req, res) {
        if (spec.noStore ?? (spec.kind === 'api' && !spec.path.startsWith('/api/v1/public'))) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Pragma', 'no-cache');
        }
        const declared = Number(req.get('content-length') ?? 0);
        if (spec.upload)
            await this.receiveFiles(spec.upload, req, res);
        else if (spec.kind === 'api' && declared > (spec.bodyLimit ?? DEFAULT_BODY_LIMIT))
            throw new errors_1.PayloadTooLargeError('La solicitud supera el tamaño permitido.');
        const valid = {};
        for (const part of ['params', 'query', 'body']) {
            const schema = spec.request?.[part];
            if (!schema)
                continue;
            const result = schema.safeParse(req[part] ?? {});
            if (!result.success)
                throw new errors_1.ValidationError(undefined, zodDetails(result.error, part === 'body' ? '' : part));
            valid[part] = result.data;
        }
        req.valid = valid;
    }
    /** Recepción multipart en memoria con límite TOTAL de la solicitud antes de leerla (evita agotar la memoria). */
    receiveFiles(upload, req, res) {
        const maxRequest = this.config.uploads.maxRequestBytes;
        const declared = Number(req.get('content-length') ?? 0);
        if (!req.get('content-length') || declared > maxRequest) {
            return Promise.reject(new errors_1.PayloadTooLargeError(`La carga supera el máximo de ${Math.round(maxRequest / 1048576)} MB por envío.`));
        }
        const maxBytes = upload.maxBytes(this.config);
        const m = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: maxBytes, files: upload.maxFiles, fields: 20, fieldSize: 20 * 1024, parts: upload.maxFiles + 20 } });
        const handler = upload.maxFiles > 1 ? m.array(upload.field, upload.maxFiles) : m.single(upload.field);
        return new Promise((resolve, reject) => {
            handler(req, res, (err) => {
                if (!err)
                    return resolve();
                const code = err.code;
                if (code === 'LIMIT_FILE_SIZE')
                    return reject(new errors_1.PayloadTooLargeError(`El archivo supera el máximo de ${Math.round(maxBytes / 1048576)} MB.`));
                if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE')
                    return reject(new errors_1.ValidationError(`Máximo ${upload.maxFiles} archivo(s) en el campo "${upload.field}".`));
                return reject(new errors_1.ValidationError('La carga del archivo no es válida.'));
            });
        });
    }
    finish(spec, res, result) {
        if (spec.kind === 'web' || spec.file || res.headersSent)
            return result;
        const status = (0, route_spec_1.successStatus)(spec);
        if (status === 204 || result === undefined) {
            res.status(204);
            return undefined;
        }
        const r = result;
        const body = r.meta ? { data: r.data, meta: r.meta } : { data: r.data };
        if (!this.config.isProd && spec.response?.schema) {
            const check = spec.response.schema.safeParse(body);
            if (!check.success)
                throw new Error(`Respuesta fuera de contrato en ${spec.method.toUpperCase()} ${spec.path}: ${JSON.stringify(check.error.issues.slice(0, 3))}`);
        }
        return body;
    }
};
exports.ApiInterceptor = ApiInterceptor;
exports.ApiInterceptor = ApiInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [core_1.Reflector, Object])
], ApiInterceptor);
//# sourceMappingURL=api.interceptor.js.map