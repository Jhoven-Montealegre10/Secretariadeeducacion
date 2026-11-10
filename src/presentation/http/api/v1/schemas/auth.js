'use strict';
const { registry } = require('../../openapi');
const { z, single } = require('./common');

const Email = z.string().trim().toLowerCase().email('Correo no válido').max(254).openapi({ example: 'funcionario@example.gov.co' });
const Password = z.string().min(1).max(128).openapi({ example: 'una frase larga y poco común' });
const NewPassword = z.string().min(12, 'Mínimo 12 caracteres').max(128).openapi({ example: 'cometa verde sobre el nevado 2026' });
const Totp = z
  .string()
  .regex(/^\d{6}$/, 'El código tiene 6 dígitos')
  .openapi({ example: '123456' });

const LoginBody = z.strictObject({ email: Email, password: Password });
const MfaVerifyBody = z
  .strictObject({
    codigo: Totp.optional(),
    codigoRecuperacion: z.string().trim().max(20).optional().openapi({ example: 'ABCDE-FGHJK' }),
  })
  .refine((v) => !!v.codigo !== !!v.codigoRecuperacion, 'Envíe el código de la aplicación o un código de recuperación (solo uno).');
const MfaEnableBody = z.strictObject({ codigo: Totp });
const ReauthBody = z.strictObject({ password: Password, codigo: Totp });
const RecoveryRequestBody = z.strictObject({ email: Email });
const ResetBody = z.strictObject({ token: z.string().min(20).max(200).openapi({ example: 'token-ficticio-de-ejemplo-0000000000' }), password: NewPassword });
const ChangePasswordBody = z.strictObject({ actual: Password, nueva: NewPassword });
const ProfileBody = z.strictObject({ nombre: z.string().trim().min(3).max(120).openapi({ example: 'Ana Gómez' }) });

const LoginStep = single(
  'PasoLogin',
  z.strictObject({
    siguientePaso: z
      .enum(['mfa', 'configurar_mfa'])
      .openapi({ description: '`mfa`: pida el código de la app. `configurar_mfa`: el usuario aún no tiene segundo factor y debe configurarlo.' }),
    csrfToken: z.string(),
  }),
);

const SessionUser = registry.register(
  'UsuarioSesion',
  z.strictObject({
    id: z.number().int(),
    email: z.string(),
    nombre: z.string(),
    rol: z.strictObject({ id: z.number().int(), slug: z.string(), nombre: z.string() }),
    permisos: z.array(z.string()).openapi({ example: ['dashboard.access', 'news.read'] }),
  }),
);
const SessionResponse = single('Sesion', z.strictObject({ usuario: SessionUser, csrfToken: z.string(), expiraPorInactividadEnSegundos: z.number().int() }));
const CsrfResponse = single('Csrf', z.strictObject({ csrfToken: z.string().openapi({ example: 'k3J9-ejemplo-ficticio' }) }));
const MfaSetup = single(
  'ConfiguracionMfa',
  z.strictObject({
    otpauthUri: z
      .string()
      .openapi({ example: 'otpauth://totp/SEM%20Ibagu%C3%A9:funcionario%40example.gov.co?secret=EJEMPLOFICTICIO&issuer=SEM%20Ibagu%C3%A9' }),
    qrDataUrl: z.string().openapi({ description: 'Imagen PNG del código QR como data URL.' }),
    secretoManual: z.string().openapi({ example: 'EJEMPLOFICTICIO234', description: 'Para escribir a mano en la aplicación si no puede escanear.' }),
  }),
);
const RecoveryCodes = single(
  'CodigosRecuperacion',
  z.strictObject({
    codigosRecuperacion: z
      .array(z.string())
      .openapi({ example: ['ABCDE-FGHJK', 'LMNPQ-RSTUV'], description: 'Se muestran UNA sola vez. Guárdelos en un lugar seguro.' }),
    csrfToken: z.string().optional(),
  }),
);
const MfaResult = single('ResultadoMfa', z.strictObject({ usuario: SessionUser, csrfToken: z.string(), codigosRestantes: z.number().int() }));

function toSessionUser(actor) {
  return {
    id: actor.id,
    email: actor.email,
    nombre: actor.nombre,
    rol: { id: actor.rolId, slug: actor.rolSlug, nombre: actor.rolNombre },
    permisos: [...actor.permisos].sort(),
  };
}

module.exports = {
  LoginBody,
  MfaVerifyBody,
  MfaEnableBody,
  ReauthBody,
  RecoveryRequestBody,
  ResetBody,
  ChangePasswordBody,
  ProfileBody,
  LoginStep,
  SessionResponse,
  CsrfResponse,
  MfaSetup,
  RecoveryCodes,
  MfaResult,
  toSessionUser,
};
