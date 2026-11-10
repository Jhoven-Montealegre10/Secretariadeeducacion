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
exports.AuthService = exports.normalizeCode = exports.GENERIC_LOGIN = exports.RECOVERY_CODES = exports.INVITE_TTL_MS = exports.RESET_TTL_MS = exports.LOCK_MS = exports.MAX_MFA_FAILURES = exports.MAX_LOGIN_FAILURES = void 0;
exports.newRecoveryCode = newRecoveryCode;
/**
 * Casos de uso de autenticación: contraseña (Argon2id), segundo factor TOTP obligatorio,
 * códigos de recuperación, cambio y restablecimiento de contraseña.
 * La gestión de la sesión HTTP (regenerar, guardar estado) vive en la capa de presentación.
 */
const node_crypto_1 = __importDefault(require("node:crypto"));
const common_1 = require("@nestjs/common");
const errors_1 = require("../domain/errors");
const password_policy_1 = require("../domain/password-policy");
const configuration_1 = require("../config/configuration");
const db_service_1 = require("../infrastructure/database/db.service");
const mailer_service_1 = require("../infrastructure/mail/mailer.service");
const identity_repositories_1 = require("../infrastructure/repositories/identity.repositories");
const crypto_service_1 = require("../infrastructure/security/crypto.service");
const password_hasher_service_1 = require("../infrastructure/security/password-hasher.service");
const password_strength_service_1 = require("../infrastructure/security/password-strength.service");
const totp_service_1 = require("../infrastructure/security/totp.service");
const audit_service_1 = require("./audit.service");
const clock_1 = require("./clock");
exports.MAX_LOGIN_FAILURES = 5;
exports.MAX_MFA_FAILURES = 5;
exports.LOCK_MS = 15 * 60 * 1000;
exports.RESET_TTL_MS = 30 * 60 * 1000;
exports.INVITE_TTL_MS = 72 * 60 * 60 * 1000;
exports.RECOVERY_CODES = 10;
exports.GENERIC_LOGIN = 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.';
/** 10 caracteres base32 (~50 bits) en dos grupos: fácil de transcribir. */
function newRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const chars = [...node_crypto_1.default.randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}
const normalizeCode = (c) => String(c ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
exports.normalizeCode = normalizeCode;
let AuthService = class AuthService {
    db;
    users;
    roles;
    credentials;
    hasher;
    strength;
    totp;
    crypto;
    mailer;
    audit;
    config;
    clock;
    constructor(db, users, roles, credentials, hasher, strength, totp, crypto, mailer, audit, config, clock) {
        this.db = db;
        this.users = users;
        this.roles = roles;
        this.credentials = credentials;
        this.hasher = hasher;
        this.strength = strength;
        this.totp = totp;
        this.crypto = crypto;
        this.mailer = mailer;
        this.audit = audit;
        this.config = config;
        this.clock = clock;
    }
    checkPolicy(password, user) {
        const error = (0, password_policy_1.validarPassword)(password, this.strength.evaluate, [user?.email, user?.nombre, user?.email?.split('@')[0]]);
        if (error)
            throw new errors_1.ValidationError(error, [{ campo: 'password', mensaje: error }]);
    }
    async issueResetToken(user, ttlMs, kind) {
        const token = this.crypto.randomToken(32);
        await this.credentials.createResetToken(user.id, this.crypto.tokenHash(token), this.clock.now() + ttlMs);
        const link = `${this.config.appUrl}/admin/restablecer#token=${token}`;
        const invite = kind === 'invitacion';
        await this.mailer.send({
            to: user.email,
            subject: invite ? 'Active su cuenta del portal de la Secretaría de Educación' : 'Restablecer su contraseña del portal',
            text: `${invite ? 'Se creó una cuenta para usted en el panel del portal.' : 'Recibimos una solicitud para restablecer su contraseña.'}\n\n` +
                `Use este enlace (válido ${Math.round(ttlMs / 60000)} minutos, de un solo uso):\n${link}\n\n` +
                'Si usted no lo solicitó, ignore este mensaje. Nunca le pediremos su contraseña ni sus códigos por correo.',
        });
    }
    isLocked(user) {
        return user.bloqueadoHasta !== null && user.bloqueadoHasta > this.clock.now();
    }
    /** Primer factor. Devuelve el usuario y el siguiente paso, o lanza un error genérico. */
    async verifyPassword(email, password, ip) {
        const user = await this.users.findByEmail(String(email ?? '')
            .trim()
            .toLowerCase());
        const fail = async (detalle) => {
            await this.audit.record({ email, accion: 'login', recurso: 'usuario', recursoId: user?.id ?? null, resultado: 'fallo', detalle, ip });
            return new errors_1.UnauthorizedError(exports.GENERIC_LOGIN, 'INVALID_CREDENTIALS');
        };
        // Mismo costo de cómputo exista o no la cuenta (evita enumeración por tiempo de respuesta).
        if (!user) {
            await this.hasher.verifyDummy(password);
            throw await fail('usuario inexistente');
        }
        if (!user.activo) {
            await this.hasher.verifyDummy(password);
            throw await fail('usuario inactivo');
        }
        if (this.isLocked(user)) {
            await this.hasher.verifyDummy(password);
            throw await fail('cuenta bloqueada');
        }
        if (!(await this.hasher.verify(password, user.passwordHash))) {
            const { bloqueado } = await this.users.incrementLoginFailures(user.id, exports.MAX_LOGIN_FAILURES, exports.LOCK_MS);
            throw await fail(bloqueado ? 'contraseña incorrecta; cuenta bloqueada 15 min' : 'contraseña incorrecta');
        }
        if (this.hasher.needsRehash(user.passwordHash)) {
            await this.users.setPasswordHash(user.id, await this.hasher.hash(password), { rotateSessions: false });
        }
        return { userId: user.id, siguientePaso: user.mfaActivo ? 'mfa' : 'configurar_mfa' };
    }
    /** Segundo factor con código TOTP o código de recuperación. */
    async verifySecondFactor(userId, input, ip) {
        const user = await this.users.findById(userId);
        if (!user || !user.activo || !user.mfaActivo || !user.mfaSecretoEnc)
            throw new errors_1.UnauthorizedError('La verificación no es válida. Inicie sesión de nuevo.', 'MFA_INVALID');
        if (this.isLocked(user))
            throw new errors_1.TooManyRequestsError('Cuenta bloqueada temporalmente por intentos fallidos.');
        let ok;
        let metodo = 'totp';
        if (input.codigoRecuperacion) {
            metodo = 'codigo_recuperacion';
            ok = await this.credentials.consumeRecoveryCode(user.id, this.crypto.tokenHash((0, exports.normalizeCode)(input.codigoRecuperacion)));
        }
        else {
            const step = this.totp.verify(this.crypto.decrypt(user.mfaSecretoEnc), input.codigo, this.clock.now());
            ok = step !== null && (await this.users.consumeTotpStep(user.id, step)); // rechaza códigos ya usados
        }
        const actor = { id: user.id, email: user.email };
        if (!ok) {
            const { bloqueado } = await this.users.incrementMfaFailures(user.id, exports.MAX_MFA_FAILURES, exports.LOCK_MS);
            await this.audit.record({ actor, accion: 'mfa_verificar', recurso: 'usuario', recursoId: user.id, resultado: 'fallo', detalle: metodo, ip });
            if (bloqueado)
                throw new errors_1.TooManyRequestsError('Demasiados códigos incorrectos. La cuenta quedó bloqueada 15 minutos.');
            throw new errors_1.UnauthorizedError('Código incorrecto o ya utilizado.', 'MFA_INVALID');
        }
        await this.users.recordLoginSuccess(user.id);
        await this.audit.record({ actor, accion: 'login', recurso: 'usuario', recursoId: user.id, resultado: 'exito', detalle: metodo, ip });
        return { userId: user.id, codigosRestantes: await this.credentials.remainingRecoveryCodes(user.id) };
    }
    /** Genera un secreto TOTP nuevo (aún no activo) y su código QR. */
    async startEnrollment(userId) {
        const user = await this.users.findById(userId);
        if (!user)
            throw new errors_1.UnauthorizedError();
        const secret = this.totp.createSecret();
        const { uri, qrDataUrl } = await this.totp.enrollment(secret, user.email);
        return { secret, uri, qrDataUrl };
    }
    async newRecoveryCodes(userId) {
        const codes = Array.from({ length: exports.RECOVERY_CODES }, newRecoveryCode);
        await this.credentials.replaceRecoveryCodes(userId, codes.map((c) => this.crypto.tokenHash((0, exports.normalizeCode)(c))));
        return codes;
    }
    /** Confirma el enrolamiento con un código válido; devuelve los códigos de recuperación (una sola vez). */
    async confirmEnrollment(userId, secret, codigo, ip) {
        const user = await this.users.findById(userId);
        if (!user || !secret)
            throw new errors_1.UnauthorizedError('Inicie de nuevo la configuración del segundo factor.', 'MFA_SETUP_EXPIRED');
        const step = this.totp.verify(secret, codigo, this.clock.now());
        if (step === null)
            throw new errors_1.ValidationError('El código no coincide. Verifique la hora de su teléfono e intente de nuevo.', [
                { campo: 'codigo', mensaje: 'Código incorrecto' },
            ]);
        const codes = await this.db.transaction(async () => {
            await this.users.setMfa(user.id, { secretoEnc: this.crypto.encrypt(secret), activo: true });
            await this.users.consumeTotpStep(user.id, step);
            const generated = await this.newRecoveryCodes(user.id);
            await this.users.recordLoginSuccess(user.id);
            await this.audit.record({ actor: user, accion: 'mfa_configurar', recurso: 'usuario', recursoId: user.id, ip });
            return generated;
        });
        return { codigosRecuperacion: codes };
    }
    async regenerateRecoveryCodes(userId, ip) {
        const user = await this.users.findById(userId);
        if (!user)
            throw new errors_1.UnauthorizedError();
        const codes = await this.db.transaction(async () => {
            const generated = await this.newRecoveryCodes(user.id);
            await this.audit.record({ actor: user, accion: 'mfa_regenerar_codigos', recurso: 'usuario', recursoId: user.id, ip });
            return generated;
        });
        return { codigosRecuperacion: codes };
    }
    /** Reautenticación (contraseña + código) para operaciones sensibles sobre la propia cuenta. */
    async reauthenticate(userId, password, codigo, ip) {
        const user = await this.users.findById(userId);
        const passwordOk = !!user && (await this.hasher.verify(password, user.passwordHash));
        const step = passwordOk && user?.mfaActivo && user.mfaSecretoEnc ? this.totp.verify(this.crypto.decrypt(user.mfaSecretoEnc), codigo, this.clock.now()) : null;
        if (!user || !passwordOk || step === null || !(await this.users.consumeTotpStep(user.id, step))) {
            await this.audit.record({ actor: user, accion: 'reautenticar', recurso: 'usuario', recursoId: userId, resultado: 'fallo', ip });
            throw new errors_1.UnauthorizedError('Contraseña o código incorrectos.', 'REAUTH_FAILED');
        }
        await this.audit.record({ actor: user, accion: 'reautenticar', recurso: 'usuario', recursoId: userId, ip });
    }
    /** Cambia la contraseña y revoca las demás sesiones; devuelve la nueva versión de autenticación. */
    async changePassword(userId, actual, nueva, ip) {
        const user = await this.users.findById(userId);
        if (!user)
            throw new errors_1.UnauthorizedError();
        if (!(await this.hasher.verify(actual, user.passwordHash))) {
            await this.audit.record({ actor: user, accion: 'cambiar_password', recurso: 'usuario', recursoId: userId, resultado: 'fallo', ip });
            throw new errors_1.ValidationError('La contraseña actual no es correcta.', [{ campo: 'actual', mensaje: 'Incorrecta' }]);
        }
        this.checkPolicy(nueva, user);
        const hash = await this.hasher.hash(nueva);
        await this.db.transaction(async () => {
            await this.users.setPasswordHash(user.id, hash);
            await this.credentials.deleteSessionsOfUser(user.id);
            await this.audit.record({ actor: user, accion: 'cambiar_password', recurso: 'usuario', recursoId: userId, ip });
        });
        return (await this.users.findById(user.id))?.authVersion ?? 0;
    }
    /** Siempre responde igual, exista o no el correo (evita enumeración). */
    async requestPasswordReset(email, ip) {
        const user = await this.users.findByEmail(String(email ?? '')
            .trim()
            .toLowerCase());
        await this.audit.record({
            email,
            accion: 'solicitar_recuperacion',
            recurso: 'usuario',
            recursoId: user?.id ?? null,
            resultado: user?.activo ? 'exito' : 'fallo',
            ip,
        });
        if (user?.activo)
            await this.issueResetToken(user, exports.RESET_TTL_MS, 'recuperacion');
    }
    async sendInvitation(user) {
        await this.issueResetToken(user, exports.INVITE_TTL_MS, 'invitacion');
    }
    /**
     * Restablece la contraseña con un token válido, de un solo uso. No inicia sesión ni desactiva
     * el segundo factor: el siguiente ingreso sigue exigiendo TOTP.
     */
    async resetPassword(token, nueva, ip) {
        const invalid = () => new errors_1.ValidationError('El enlace no es válido o expiró. Solicite uno nuevo.', [{ campo: 'token', mensaje: 'Inválido o expirado' }]);
        const record = await this.credentials.findResetToken(this.crypto.tokenHash(String(token ?? '')));
        if (!record || record.usadoEn || record.expiraEn < this.clock.now())
            throw invalid();
        const user = await this.users.findById(record.usuarioId);
        if (!user || !user.activo)
            throw invalid();
        this.checkPolicy(nueva, user);
        const hash = await this.hasher.hash(nueva);
        await this.db.transaction(async () => {
            if (!(await this.credentials.consumeResetToken(record.id)))
                throw invalid();
            await this.users.setPasswordHash(user.id, hash);
            await this.credentials.deleteSessionsOfUser(user.id);
            await this.audit.record({ actor: user, accion: 'restablecer_password', recurso: 'usuario', recursoId: user.id, ip });
        });
    }
    /** Construye el actor (identidad + permisos) desde la base de datos, nunca desde el navegador. */
    async loadActor(userId, authVersion) {
        const user = await this.users.findById(userId);
        if (!user || !user.activo || !user.mfaActivo || user.authVersion !== authVersion)
            return null;
        return {
            id: user.id,
            email: user.email,
            nombre: user.nombre,
            rolId: user.rolId,
            rolSlug: user.rolSlug,
            rolNombre: user.rolNombre,
            permisos: new Set(await this.roles.permissionsOf(user.rolId)),
            authVersion: user.authVersion,
        };
    }
    async currentAuthVersion(userId) {
        return (await this.users.findById(userId))?.authVersion;
    }
    async findUser(userId) {
        return this.users.findById(userId);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(10, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __param(11, (0, common_1.Inject)(clock_1.CLOCK)),
    __metadata("design:paramtypes", [db_service_1.Db,
        identity_repositories_1.UserRepository,
        identity_repositories_1.RoleRepository,
        identity_repositories_1.CredentialRepository,
        password_hasher_service_1.PasswordHasher,
        password_strength_service_1.PasswordStrength,
        totp_service_1.TotpService,
        crypto_service_1.CryptoService,
        mailer_service_1.Mailer,
        audit_service_1.AuditService, Object, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map