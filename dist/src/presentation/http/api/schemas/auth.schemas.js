"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MfaResult = exports.RecoveryCodes = exports.MfaSetup = exports.CsrfResponse = exports.SessionResponse = exports.SessionUser = exports.LoginStep = exports.ProfileBody = exports.ChangePasswordBody = exports.ResetBody = exports.RecoveryRequestBody = exports.ReauthBody = exports.MfaEnableBody = exports.MfaVerifyBody = exports.LoginBody = void 0;
exports.toSessionUser = toSessionUser;
const openapi_1 = require("../openapi");
const common_1 = require("./common");
const Email = common_1.z.string().trim().toLowerCase().email('Correo no válido').max(254).meta({ example: 'funcionario@example.gov.co' });
const Password = common_1.z.string().min(1).max(128).meta({ example: 'una frase larga y poco común' });
const NewPassword = common_1.z.string().min(12, 'Mínimo 12 caracteres').max(128).meta({ example: 'cometa verde sobre el nevado 2026' });
const Totp = common_1.z
    .string()
    .regex(/^\d{6}$/, 'El código tiene 6 dígitos')
    .meta({ example: '123456' });
exports.LoginBody = common_1.z.strictObject({ email: Email, password: Password });
exports.MfaVerifyBody = common_1.z
    .strictObject({
    codigo: Totp.optional(),
    codigoRecuperacion: common_1.z.string().trim().max(20).optional().meta({ example: 'ABCDE-FGHJK' }),
})
    .refine((v) => !!v.codigo !== !!v.codigoRecuperacion, 'Envíe el código de la aplicación o un código de recuperación (solo uno).');
exports.MfaEnableBody = common_1.z.strictObject({ codigo: Totp });
exports.ReauthBody = common_1.z.strictObject({ password: Password, codigo: Totp });
exports.RecoveryRequestBody = common_1.z.strictObject({ email: Email });
exports.ResetBody = common_1.z.strictObject({ token: common_1.z.string().min(20).max(200).meta({ example: 'token-ficticio-de-ejemplo-0000000000' }), password: NewPassword });
exports.ChangePasswordBody = common_1.z.strictObject({ actual: Password, nueva: NewPassword });
exports.ProfileBody = common_1.z.strictObject({ nombre: common_1.z.string().trim().min(3).max(120).meta({ example: 'Ana Gómez' }) });
exports.LoginStep = (0, common_1.single)('PasoLogin', common_1.z.strictObject({
    siguientePaso: common_1.z
        .enum(['mfa', 'configurar_mfa'])
        .meta({ description: '`mfa`: pida el código de la app. `configurar_mfa`: el usuario aún no tiene segundo factor y debe configurarlo.' }),
    csrfToken: common_1.z.string(),
}));
exports.SessionUser = (0, openapi_1.named)('UsuarioSesion', common_1.z.strictObject({
    id: common_1.z.number().int(),
    email: common_1.z.string(),
    nombre: common_1.z.string(),
    rol: common_1.z.strictObject({ id: common_1.z.number().int(), slug: common_1.z.string(), nombre: common_1.z.string() }),
    permisos: common_1.z.array(common_1.z.string()).meta({ example: ['dashboard.access', 'news.read'] }),
}));
exports.SessionResponse = (0, common_1.single)('Sesion', common_1.z.strictObject({ usuario: exports.SessionUser, csrfToken: common_1.z.string(), expiraPorInactividadEnSegundos: common_1.z.number().int() }));
exports.CsrfResponse = (0, common_1.single)('Csrf', common_1.z.strictObject({ csrfToken: common_1.z.string().meta({ example: 'k3J9-ejemplo-ficticio' }) }));
exports.MfaSetup = (0, common_1.single)('ConfiguracionMfa', common_1.z.strictObject({
    otpauthUri: common_1.z.string().meta({ example: 'otpauth://totp/SEM%20Ibagu%C3%A9:funcionario%40example.gov.co?secret=EJEMPLOFICTICIO&issuer=SEM%20Ibagu%C3%A9' }),
    qrDataUrl: common_1.z.string().meta({ description: 'Imagen PNG del código QR como data URL.' }),
    secretoManual: common_1.z.string().meta({ example: 'EJEMPLOFICTICIO234', description: 'Para escribir a mano en la aplicación si no puede escanear.' }),
}));
exports.RecoveryCodes = (0, common_1.single)('CodigosRecuperacion', common_1.z.strictObject({
    codigosRecuperacion: common_1.z.array(common_1.z.string()).meta({ example: ['ABCDE-FGHJK', 'LMNPQ-RSTUV'], description: 'Se muestran UNA sola vez. Guárdelos en un lugar seguro.' }),
    csrfToken: common_1.z.string().optional(),
}));
exports.MfaResult = (0, common_1.single)('ResultadoMfa', common_1.z.strictObject({ usuario: exports.SessionUser, csrfToken: common_1.z.string(), codigosRestantes: common_1.z.number().int() }));
function toSessionUser(actor) {
    return {
        id: actor.id,
        email: actor.email,
        nombre: actor.nombre,
        rol: { id: actor.rolId, slug: actor.rolSlug, nombre: actor.rolNombre },
        permisos: [...actor.permisos].sort(),
    };
}
//# sourceMappingURL=auth.schemas.js.map