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
var AuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
/**
 * Registro de auditoría: quién, cuándo, qué acción, sobre qué recurso y con qué resultado.
 * NUNCA recibe contraseñas, tokens, secretos MFA ni códigos: solo identificadores y textos cortos.
 */
const common_1 = require("@nestjs/common");
const identity_repositories_1 = require("../infrastructure/repositories/identity.repositories");
const crypto_service_1 = require("../infrastructure/security/crypto.service");
const authorization_1 = require("./authorization");
// Defensa adicional: si un detalle parece un secreto (código de 6+ dígitos, token largo o hash
// de contraseña) se omite completo. Los servicios solo envían textos descriptivos.
const LOOKS_SECRET = /\b\d{6,}\b|[A-Za-z0-9_\-+/=]{24,}|\$argon2/;
let AuditService = AuditService_1 = class AuditService {
    repo;
    crypto;
    constructor(repo, crypto) {
        this.repo = repo;
        this.crypto = crypto;
    }
    static safeDetail(detalle) {
        const text = String(detalle ?? '');
        return LOOKS_SECRET.test(text) ? '[detalle omitido]' : text.slice(0, 300);
    }
    async record(e) {
        await this.repo.append({
            usuarioId: e.actor?.id ?? null,
            usuarioEmail: e.actor?.email ?? (e.email ? String(e.email).slice(0, 120) : null),
            accion: e.accion,
            recurso: e.recurso ?? null,
            recursoId: e.recursoId === null || e.recursoId === undefined ? null : String(e.recursoId),
            resultado: e.resultado ?? 'exito',
            detalle: AuditService_1.safeDetail(e.detalle),
            // Misma derivación que la versión anterior: la IP nunca se guarda en claro.
            ipHash: e.ip ? this.crypto.statsHash('audit-ip', e.ip).slice(0, 16) : null,
        });
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'audit.read');
        return this.repo.list(filters);
    }
    async verify(actor) {
        (0, authorization_1.authorize)(actor, 'audit.read');
        return this.repo.verifyChain();
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = AuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [identity_repositories_1.AuditRepository,
        crypto_service_1.CryptoService])
], AuditService);
//# sourceMappingURL=audit.service.js.map