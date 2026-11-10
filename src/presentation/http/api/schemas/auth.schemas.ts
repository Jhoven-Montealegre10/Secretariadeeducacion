/** DTOs de autenticación y de la cuenta propia. */
import type { Actor } from '../../../../domain/permissions';
import { named } from '../openapi';
import { single, z } from './common';

const Email = z.string().trim().toLowerCase().email('Correo no válido').max(254).meta({ example: 'funcionario@example.gov.co' });
const Password = z.string().min(1).max(128).meta({ example: 'una frase larga y poco común' });
const NewPassword = z.string().min(12, 'Mínimo 12 caracteres').max(128).meta({ example: 'cometa verde sobre el nevado 2026' });
const Totp = z
  .string()
  .regex(/^\d{6}$/, 'El código tiene 6 dígitos')
  .meta({ example: '123456' });

export const LoginBody = z.strictObject({ email: Email, password: Password });
export const MfaVerifyBody = z
  .strictObject({
    codigo: Totp.optional(),
    codigoRecuperacion: z.string().trim().max(20).optional().meta({ example: 'ABCDE-FGHJK' }),
  })
  .refine((v) => !!v.codigo !== !!v.codigoRecuperacion, 'Envíe el código de la aplicación o un código de recuperación (solo uno).');
export const MfaEnableBody = z.strictObject({ codigo: Totp });
export const ReauthBody = z.strictObject({ password: Password, codigo: Totp });
export const RecoveryRequestBody = z.strictObject({ email: Email });
export const ResetBody = z.strictObject({
  token: z.string().min(20).max(200).meta({ example: 'token-ficticio-de-ejemplo-0000000000' }),
  password: NewPassword,
});
export const ChangePasswordBody = z.strictObject({ actual: Password, nueva: NewPassword });
export const ProfileBody = z.strictObject({ nombre: z.string().trim().min(3).max(120).meta({ example: 'Ana Gómez' }) });

export const LoginStep = single(
  'PasoLogin',
  z.strictObject({
    siguientePaso: z
      .enum(['mfa', 'configurar_mfa'])
      .meta({ description: '`mfa`: pida el código de la app. `configurar_mfa`: el usuario aún no tiene segundo factor y debe configurarlo.' }),
    csrfToken: z.string(),
  }),
);

export const SessionUser = named(
  'UsuarioSesion',
  z.strictObject({
    id: z.number().int(),
    email: z.string(),
    nombre: z.string(),
    rol: z.strictObject({ id: z.number().int(), slug: z.string(), nombre: z.string() }),
    permisos: z.array(z.string()).meta({ example: ['dashboard.access', 'news.read'] }),
  }),
);
export const SessionResponse = single(
  'Sesion',
  z.strictObject({ usuario: SessionUser, csrfToken: z.string(), expiraPorInactividadEnSegundos: z.number().int() }),
);
export const CsrfResponse = single('Csrf', z.strictObject({ csrfToken: z.string().meta({ example: 'k3J9-ejemplo-ficticio' }) }));
export const MfaSetup = single(
  'ConfiguracionMfa',
  z.strictObject({
    otpauthUri: z.string().meta({ example: 'otpauth://totp/SEM%20Ibagu%C3%A9:funcionario%40example.gov.co?secret=EJEMPLOFICTICIO&issuer=SEM%20Ibagu%C3%A9' }),
    qrDataUrl: z.string().meta({ description: 'Imagen PNG del código QR como data URL.' }),
    secretoManual: z.string().meta({ example: 'EJEMPLOFICTICIO234', description: 'Para escribir a mano en la aplicación si no puede escanear.' }),
  }),
);
export const RecoveryCodes = single(
  'CodigosRecuperacion',
  z.strictObject({
    codigosRecuperacion: z
      .array(z.string())
      .meta({ example: ['ABCDE-FGHJK', 'LMNPQ-RSTUV'], description: 'Se muestran UNA sola vez. Guárdelos en un lugar seguro.' }),
    csrfToken: z.string().optional(),
  }),
);
export const MfaResult = single('ResultadoMfa', z.strictObject({ usuario: SessionUser, csrfToken: z.string(), codigosRestantes: z.number().int() }));

export function toSessionUser(actor: Actor) {
  return {
    id: actor.id,
    email: actor.email,
    nombre: actor.nombre,
    rol: { id: actor.rolId, slug: actor.rolSlug, nombre: actor.rolNombre },
    permisos: [...actor.permisos].sort(),
  };
}
