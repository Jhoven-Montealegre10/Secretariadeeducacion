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
exports.CsrfService = void 0;
/**
 * Protección CSRF para operaciones con cookie de sesión:
 *  1. token sincronizador secreto por sesión (cabecera X-CSRF-Token o campo _csrf del formulario);
 *  2. si el navegador envía Origin, debe ser el mismo sitio (defensa adicional);
 *  3. la cookie es SameSite=Strict.
 */
const common_1 = require("@nestjs/common");
const errors_1 = require("../../../domain/errors");
const crypto_service_1 = require("../../../infrastructure/security/crypto.service");
let CsrfService = class CsrfService {
    crypto;
    constructor(crypto) {
        this.crypto = crypto;
    }
    ensureToken(req) {
        if (!req.session.csrf)
            req.session.csrf = this.crypto.randomToken();
        return req.session.csrf;
    }
    sameOrigin(req) {
        const origin = req.get('origin');
        if (!origin)
            return true;
        try {
            return new URL(origin).host === req.get('host');
        }
        catch {
            return false;
        }
    }
    verify(req) {
        const body = req.body;
        const sent = req.get('x-csrf-token') ?? (typeof body?._csrf === 'string' ? body._csrf : undefined);
        const expected = req.session?.csrf;
        if (!this.sameOrigin(req) || !sent || !expected || !this.crypto.safeEqual(sent, expected)) {
            const err = new errors_1.ForbiddenError('La sesión del formulario expiró o la solicitud no es válida. Recargue la página e intente de nuevo.');
            Object.assign(err, { code: 'CSRF_INVALID' });
            throw err;
        }
    }
};
exports.CsrfService = CsrfService;
exports.CsrfService = CsrfService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [crypto_service_1.CryptoService])
], CsrfService);
//# sourceMappingURL=csrf.service.js.map