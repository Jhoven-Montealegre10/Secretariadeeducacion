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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityGuard = void 0;
/**
 * Guard global, en este orden:
 *   1. denegación por defecto: una ruta sin declaración @Endpoint/@WebRoute nunca se ejecuta;
 *   2. límites de peticiones (general, API y el específico de la ruta);
 *   3. acceso: público, sesión pendiente (primer factor), autenticado o permiso concreto;
 *   4. CSRF en métodos que modifican (token sincronizador + verificación de Origin).
 */
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const errors_1 = require("../../../domain/errors");
const route_spec_1 = require("../route-spec");
const csrf_service_1 = require("./csrf.service");
const rate_limiter_service_1 = require("./rate-limiter.service");
let SecurityGuard = class SecurityGuard {
    reflector;
    limiter;
    csrf;
    constructor(reflector, limiter, csrf) {
        this.reflector = reflector;
        this.limiter = limiter;
        this.csrf = csrf;
    }
    async canActivate(context) {
        const spec = this.reflector.get(route_spec_1.ROUTE_SPEC, context.getHandler());
        if (!spec)
            throw new errors_1.ForbiddenError('Ruta no declarada.'); // denegación por defecto
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const ip = req.ip ?? '';
        await this.limiter.hit('general', ip);
        if (spec.kind === 'api')
            await this.limiter.hit('api', ip);
        if (spec.rateLimit)
            this.headers(res, await this.limiter.hit(spec.rateLimit, ip));
        this.checkAccess(spec, req);
        if ((0, route_spec_1.needsCsrf)(spec))
            this.csrf.verify(req);
        return true;
    }
    headers(res, r) {
        res.setHeader('RateLimit-Policy', `${r.limit};w=${r.resetSeconds}`);
        res.setHeader('RateLimit', `limit=${r.limit}, remaining=${r.remaining}, reset=${r.resetSeconds}`);
    }
    checkAccess(spec, req) {
        if (spec.auth === 'public')
            return;
        if (spec.auth === 'pending') {
            const pending = req.session?.pending;
            if (pending?.userId && pending.expiresAt > Date.now())
                return;
            throw new errors_1.UnauthorizedError('Inicie sesión de nuevo.', 'LOGIN_REQUIRED');
        }
        if (!req.actor)
            throw new errors_1.UnauthorizedError();
        if (!req.actor.permisos.has('dashboard.access'))
            throw new errors_1.ForbiddenError();
        if (spec.auth !== 'authenticated' && !req.actor.permisos.has(spec.auth)) {
            const err = new errors_1.ForbiddenError();
            err.permiso = spec.auth;
            throw err;
        }
    }
};
exports.SecurityGuard = SecurityGuard;
exports.SecurityGuard = SecurityGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        rate_limiter_service_1.RateLimiter,
        csrf_service_1.CsrfService])
], SecurityGuard);
//# sourceMappingURL=security.guard.js.map