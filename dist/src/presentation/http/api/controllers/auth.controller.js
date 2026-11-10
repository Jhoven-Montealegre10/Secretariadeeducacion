"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
/**
 * Autenticación en dos pasos:
 *   1. POST /auth/login  → contraseña correcta: sesión "pendiente" (sin acceso al panel).
 *   2. POST /auth/mfa/verificar (o configurar + activar la primera vez) → sesión completa.
 * Mi cuenta: cambio de contraseña y de dispositivo MFA con reautenticación reciente.
 */
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../../../../application/audit.service");
const auth_service_1 = require("../../../../application/auth.service");
const identity_services_1 = require("../../../../application/identity.services");
const errors_1 = require("../../../../domain/errors");
const configuration_1 = require("../../../../config/configuration");
const route_spec_1 = require("../../route-spec");
const csrf_service_1 = require("../../security/csrf.service");
const session_helpers_1 = require("../../session/session.helpers");
const S = __importStar(require("../schemas/auth.schemas"));
const common_2 = require("../schemas/common");
const TAG = ['Autenticación'];
const ACCOUNT = ['Mi cuenta'];
const MAX_PENDING_ATTEMPTS = 5;
const MFA_SETUP_MS = 10 * 60 * 1000;
let AuthController = class AuthController {
    auth;
    users;
    audit;
    csrf;
    config;
    constructor(auth, users, audit, csrf, config) {
        this.auth = auth;
        this.users = users;
        this.audit = audit;
        this.csrf = csrf;
        this.config = config;
    }
    async completeLogin(req, userId) {
        await (0, session_helpers_1.establish)(req, userId, (await this.auth.currentAuthVersion(userId)) ?? 0);
        const actor = await this.auth.loadActor(userId, req.session.auth?.authVersion ?? -1);
        if (!actor)
            throw new errors_1.UnauthorizedError();
        req.actor = actor;
        return { usuario: S.toSessionUser(actor), csrfToken: this.csrf.ensureToken(req) };
    }
    requireFreshReauth(req) {
        if (!req.session.reauthAt || Date.now() - req.session.reauthAt > this.config.session.reauthMs) {
            throw new errors_1.UnauthorizedError('Confirme su identidad (contraseña y código) para continuar.', 'REAUTH_REQUIRED');
        }
    }
    sessionData(req) {
        if (!req.actor)
            throw new errors_1.UnauthorizedError();
        return {
            usuario: S.toSessionUser(req.actor),
            csrfToken: this.csrf.ensureToken(req),
            expiraPorInactividadEnSegundos: Math.round(this.config.session.idleMs / 1000),
        };
    }
    csrfToken(req) {
        return { data: { csrfToken: this.csrf.ensureToken(req) } };
    }
    async login(req) {
        const body = (0, session_helpers_1.valid)(req, 'body', S.LoginBody);
        const { userId, siguientePaso } = await this.auth.verifyPassword(body.email, body.password, (0, session_helpers_1.clientIp)(req));
        await (0, session_helpers_1.regenerate)(req);
        req.session.pending = { userId, siguientePaso, expiresAt: Date.now() + this.config.session.pendingMfaMs, intentos: 0 };
        const csrfToken = this.csrf.ensureToken(req);
        await (0, session_helpers_1.save)(req);
        return { data: { siguientePaso, csrfToken } };
    }
    async verifyMfa(req) {
        const pending = req.session.pending;
        if (!pending)
            throw new errors_1.UnauthorizedError('Inicie sesión de nuevo.', 'LOGIN_REQUIRED');
        if (pending.siguientePaso !== 'mfa')
            throw new errors_1.UnauthorizedError('Debe configurar el segundo factor.', 'MFA_SETUP_REQUIRED');
        try {
            const { userId, codigosRestantes } = await this.auth.verifySecondFactor(pending.userId, (0, session_helpers_1.valid)(req, 'body', S.MfaVerifyBody), (0, session_helpers_1.clientIp)(req));
            const data = await this.completeLogin(req, userId);
            return { data: { ...data, codigosRestantes } };
        }
        catch (err) {
            pending.intentos += 1;
            if (pending.intentos >= MAX_PENDING_ATTEMPTS)
                delete req.session.pending;
            await (0, session_helpers_1.save)(req);
            throw err;
        }
    }
    async setupMfa(req) {
        const pending = req.session.pending;
        if (!pending || pending.siguientePaso !== 'configurar_mfa')
            throw new errors_1.UnauthorizedError('El segundo factor ya está configurado.', 'MFA_ALREADY_CONFIGURED');
        const setup = await this.auth.startEnrollment(pending.userId);
        req.session.mfaSetup = { secret: setup.secret, expiresAt: Date.now() + MFA_SETUP_MS };
        await (0, session_helpers_1.save)(req);
        return { data: { otpauthUri: setup.uri, qrDataUrl: setup.qrDataUrl, secretoManual: setup.secret } };
    }
    async enableMfa(req) {
        const pending = req.session.pending;
        const setup = req.session.mfaSetup;
        if (!pending || pending.siguientePaso !== 'configurar_mfa' || !setup || setup.expiresAt < Date.now()) {
            throw new errors_1.UnauthorizedError('Genere de nuevo el código QR.', 'MFA_SETUP_EXPIRED');
        }
        const { codigosRecuperacion } = await this.auth.confirmEnrollment(pending.userId, setup.secret, (0, session_helpers_1.valid)(req, 'body', S.MfaEnableBody).codigo, (0, session_helpers_1.clientIp)(req));
        const { csrfToken } = await this.completeLogin(req, pending.userId);
        return { data: { codigosRecuperacion, csrfToken } };
    }
    async logout(req, res) {
        const actor = req.actor;
        await (0, session_helpers_1.destroy)(req, res, this.config.isProd);
        if (actor)
            await this.audit.record({ actor, accion: 'logout', recurso: 'usuario', recursoId: actor.id, ip: (0, session_helpers_1.clientIp)(req) });
        return undefined;
    }
    session(req) {
        return { data: this.sessionData(req) };
    }
    async requestReset(req) {
        await this.auth.requestPasswordReset((0, session_helpers_1.valid)(req, 'body', S.RecoveryRequestBody).email, (0, session_helpers_1.clientIp)(req));
        return { data: { ok: true } };
    }
    async reset(req) {
        const body = (0, session_helpers_1.valid)(req, 'body', S.ResetBody);
        await this.auth.resetPassword(body.token, body.password, (0, session_helpers_1.clientIp)(req));
        return { data: { ok: true } };
    }
    // --- Mi cuenta ---
    async reauth(req) {
        const body = (0, session_helpers_1.valid)(req, 'body', S.ReauthBody);
        await this.auth.reauthenticate(req.actor.id, body.password, body.codigo, (0, session_helpers_1.clientIp)(req));
        req.session.reauthAt = Date.now();
        return { data: { ok: true } };
    }
    async accountSetupMfa(req) {
        this.requireFreshReauth(req);
        const setup = await this.auth.startEnrollment(req.actor.id);
        req.session.mfaSetup = { secret: setup.secret, expiresAt: Date.now() + MFA_SETUP_MS };
        return { data: { otpauthUri: setup.uri, qrDataUrl: setup.qrDataUrl, secretoManual: setup.secret } };
    }
    async accountEnableMfa(req) {
        this.requireFreshReauth(req);
        const actor = req.actor;
        const setup = req.session.mfaSetup;
        if (!setup || setup.expiresAt < Date.now())
            throw new errors_1.UnauthorizedError('Genere de nuevo el código QR.', 'MFA_SETUP_EXPIRED');
        const { codigosRecuperacion } = await this.auth.confirmEnrollment(actor.id, setup.secret, (0, session_helpers_1.valid)(req, 'body', S.MfaEnableBody).codigo, (0, session_helpers_1.clientIp)(req));
        const { csrfToken } = await this.completeLogin(req, actor.id);
        return { data: { codigosRecuperacion, csrfToken } };
    }
    async regenerateCodes(req) {
        this.requireFreshReauth(req);
        return { data: await this.auth.regenerateRecoveryCodes(req.actor.id, (0, session_helpers_1.clientIp)(req)) };
    }
    async changePassword(req) {
        const actor = req.actor;
        const body = (0, session_helpers_1.valid)(req, 'body', S.ChangePasswordBody);
        await this.auth.changePassword(actor.id, body.actual, body.nueva, (0, session_helpers_1.clientIp)(req));
        const { csrfToken } = await this.completeLogin(req, actor.id);
        return { data: { csrfToken } };
    }
    async profile(req) {
        const actor = req.actor;
        await this.users.updateOwnProfile(actor, (0, session_helpers_1.valid)(req, 'body', S.ProfileBody), (0, session_helpers_1.clientIp)(req));
        req.actor = await this.auth.loadActor(actor.id, actor.authVersion);
        return { data: this.sessionData(req) };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/auth/csrf', {
        tags: TAG,
        auth: 'public',
        summary: 'Obtener el token CSRF de la sesión',
        description: 'Crea (si no existe) y devuelve el token anti-CSRF asociado a la cookie de sesión. Debe enviarse en `X-CSRF-Token`.',
        response: { description: 'Token CSRF', schema: S.CsrfResponse },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "csrfToken", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/login', {
        status: 200,
        tags: TAG,
        auth: 'public',
        rateLimit: 'login',
        summary: 'Primer factor: correo y contraseña',
        description: 'La respuesta de error es idéntica si el correo no existe, la contraseña es incorrecta o la cuenta está bloqueada (5 intentos → 15 min). No da acceso al panel hasta completar el segundo factor.',
        request: { body: S.LoginBody },
        errors: [401],
        response: { description: 'Contraseña correcta; falta el segundo factor', schema: S.LoginStep },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/mfa/verificar', {
        status: 200,
        tags: TAG,
        auth: 'pending',
        rateLimit: 'mfa',
        summary: 'Segundo factor: código TOTP o código de recuperación',
        description: 'Rechaza códigos ya usados. Tras 5 errores se cancela el inicio de sesión y la cuenta se bloquea 15 minutos.',
        request: { body: S.MfaVerifyBody },
        errors: [401],
        response: { description: 'Sesión iniciada', schema: S.MfaResult },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyMfa", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/mfa/configuracion', {
        status: 200,
        tags: TAG,
        auth: 'pending',
        rateLimit: 'mfa',
        summary: 'Primer ingreso: generar el secreto TOTP',
        description: 'Solo para usuarios sin segundo factor, tras verificar la contraseña. El secreto queda en la sesión (servidor) hasta su activación.',
        response: { description: 'Datos para la aplicación autenticadora', schema: S.MfaSetup },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "setupMfa", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/mfa/activar', {
        status: 200,
        tags: TAG,
        auth: 'pending',
        rateLimit: 'mfa',
        summary: 'Primer ingreso: activar el segundo factor e iniciar sesión',
        description: 'Verifica un código de la aplicación, guarda el secreto cifrado y devuelve 10 códigos de recuperación (se muestran una sola vez).',
        request: { body: S.MfaEnableBody },
        errors: [401],
        response: { description: 'Segundo factor activo; sesión iniciada', schema: S.RecoveryCodes },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "enableMfa", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/logout', {
        status: 204,
        tags: TAG,
        auth: 'public',
        summary: 'Cerrar sesión',
        description: 'Destruye la sesión en el servidor y elimina la cookie.',
        response: { description: 'Sesión cerrada' },
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/auth/sesion', {
        tags: TAG,
        auth: 'authenticated',
        summary: 'Usuario y permisos de la sesión actual',
        response: { description: 'Sesión activa', schema: S.SessionResponse },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "session", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/recuperacion', {
        status: 202,
        tags: TAG,
        auth: 'public',
        rateLimit: 'recovery',
        summary: 'Solicitar enlace para restablecer la contraseña',
        description: 'Responde siempre 202, exista o no el correo. El enlace es de un solo uso y vence en 30 minutos.',
        request: { body: S.RecoveryRequestBody },
        response: { description: 'Si el correo existe, se envió el enlace', schema: common_2.Ok },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestReset", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/auth/recuperacion/restablecer', {
        status: 200,
        tags: TAG,
        auth: 'public',
        rateLimit: 'recovery',
        summary: 'Definir una contraseña nueva con el token recibido',
        description: 'Consume el token, revoca todas las sesiones del usuario y NO inicia sesión: el siguiente ingreso sigue exigiendo el segundo factor. También sirve para activar cuentas invitadas.',
        request: { body: S.ResetBody },
        response: { description: 'Contraseña actualizada', schema: common_2.Ok },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "reset", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/cuenta/reautenticar', {
        status: 200,
        tags: ACCOUNT,
        auth: 'authenticated',
        rateLimit: 'mfa',
        summary: 'Confirmar identidad para operaciones sensibles',
        description: 'Contraseña + código TOTP. Habilita durante 5 minutos el cambio de dispositivo MFA y la regeneración de códigos.',
        request: { body: S.ReauthBody },
        errors: [401],
        response: { description: 'Identidad confirmada', schema: common_2.Ok },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "reauth", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/cuenta/mfa/configuracion', {
        status: 200,
        tags: ACCOUNT,
        auth: 'authenticated',
        rateLimit: 'mfa',
        summary: 'Cambiar de dispositivo MFA: generar un secreto nuevo',
        description: 'Requiere reautenticación reciente.',
        errors: [401],
        response: { description: 'Datos para la aplicación autenticadora', schema: S.MfaSetup },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "accountSetupMfa", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/cuenta/mfa/activar', {
        status: 200,
        tags: ACCOUNT,
        auth: 'authenticated',
        rateLimit: 'mfa',
        summary: 'Cambiar de dispositivo MFA: confirmar el secreto nuevo',
        description: 'Reemplaza el secreto anterior, genera códigos de recuperación nuevos y cierra las demás sesiones.',
        request: { body: S.MfaEnableBody },
        errors: [401],
        response: { description: 'Nuevo dispositivo activo', schema: S.RecoveryCodes },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "accountEnableMfa", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/cuenta/mfa/codigos-recuperacion', {
        status: 200,
        tags: ACCOUNT,
        auth: 'authenticated',
        summary: 'Regenerar códigos de recuperación',
        description: 'Invalida los anteriores. Requiere reautenticación reciente.',
        errors: [401],
        response: { description: 'Códigos nuevos (se muestran una sola vez)', schema: S.RecoveryCodes },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "regenerateCodes", null);
__decorate([
    (0, route_spec_1.Endpoint)('put', '/api/v1/cuenta/password', {
        tags: ACCOUNT,
        auth: 'authenticated',
        rateLimit: 'mfa',
        summary: 'Cambiar mi contraseña',
        description: 'Verifica la contraseña actual y rechaza contraseñas comunes o débiles. Cierra todas las demás sesiones; la actual se renueva.',
        request: { body: S.ChangePasswordBody },
        response: { description: 'Contraseña actualizada', schema: S.CsrfResponse },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, route_spec_1.Endpoint)('patch', '/api/v1/cuenta/perfil', {
        tags: ACCOUNT,
        auth: 'authenticated',
        summary: 'Actualizar mi nombre',
        description: 'Solo permite cambiar el nombre visible; el rol y el correo los gestiona un administrador.',
        request: { body: S.ProfileBody },
        response: { description: 'Perfil actualizado', schema: S.SessionResponse },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "profile", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)(),
    __param(4, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        identity_services_1.UserService,
        audit_service_1.AuditService,
        csrf_service_1.CsrfService, Object])
], AuthController);
//# sourceMappingURL=auth.controller.js.map