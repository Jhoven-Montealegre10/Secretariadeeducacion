/**
 * Autenticación en dos pasos:
 *   1. POST /auth/login  → contraseña correcta: sesión "pendiente" (sin acceso al panel).
 *   2. POST /auth/mfa/verificar (o configurar + activar la primera vez) → sesión completa.
 * Mi cuenta: cambio de contraseña y de dispositivo MFA con reautenticación reciente.
 */
import { Controller, Inject, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../../../../application/audit.service';
import { AuthService } from '../../../../application/auth.service';
import { UserService } from '../../../../application/identity.services';
import { UnauthorizedError } from '../../../../domain/errors';
import { APP_CONFIG, type AppConfig } from '../../../../config/configuration';
import type { AppRequest } from '../../http.types';
import { Endpoint } from '../../route-spec';
import { CsrfService } from '../../security/csrf.service';
import { clientIp, destroy, establish, regenerate, save, valid } from '../../session/session.helpers';
import * as S from '../schemas/auth.schemas';
import { Ok } from '../schemas/common';

const TAG = ['Autenticación'];
const ACCOUNT = ['Mi cuenta'];
const MAX_PENDING_ATTEMPTS = 5;
const MFA_SETUP_MS = 10 * 60 * 1000;

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
    private readonly audit: AuditService,
    private readonly csrf: CsrfService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async completeLogin(req: AppRequest, userId: number) {
    await establish(req, userId, (await this.auth.currentAuthVersion(userId)) ?? 0);
    const actor = await this.auth.loadActor(userId, req.session.auth?.authVersion ?? -1);
    if (!actor) throw new UnauthorizedError();
    req.actor = actor;
    return { usuario: S.toSessionUser(actor), csrfToken: this.csrf.ensureToken(req) };
  }

  private requireFreshReauth(req: AppRequest): void {
    if (!req.session.reauthAt || Date.now() - req.session.reauthAt > this.config.session.reauthMs) {
      throw new UnauthorizedError('Confirme su identidad (contraseña y código) para continuar.', 'REAUTH_REQUIRED');
    }
  }

  private sessionData(req: AppRequest) {
    if (!req.actor) throw new UnauthorizedError();
    return { usuario: S.toSessionUser(req.actor), csrfToken: this.csrf.ensureToken(req), expiraPorInactividadEnSegundos: Math.round(this.config.session.idleMs / 1000) };
  }

  @Endpoint('get', '/api/v1/auth/csrf', {
    tags: TAG,
    auth: 'public',
    summary: 'Obtener el token CSRF de la sesión',
    description: 'Crea (si no existe) y devuelve el token anti-CSRF asociado a la cookie de sesión. Debe enviarse en `X-CSRF-Token`.',
    response: { description: 'Token CSRF', schema: S.CsrfResponse },
  })
  csrfToken(@Req() req: AppRequest) {
    return { data: { csrfToken: this.csrf.ensureToken(req) } };
  }

  @Endpoint('post', '/api/v1/auth/login', {
    status: 200,
    tags: TAG,
    auth: 'public',
    rateLimit: 'login',
    summary: 'Primer factor: correo y contraseña',
    description:
      'La respuesta de error es idéntica si el correo no existe, la contraseña es incorrecta o la cuenta está bloqueada (5 intentos → 15 min). No da acceso al panel hasta completar el segundo factor.',
    request: { body: S.LoginBody },
    errors: [401],
    response: { description: 'Contraseña correcta; falta el segundo factor', schema: S.LoginStep },
  })
  async login(@Req() req: AppRequest) {
    const body = valid(req, 'body', S.LoginBody);
    const { userId, siguientePaso } = await this.auth.verifyPassword(body.email, body.password, clientIp(req));
    await regenerate(req);
    req.session.pending = { userId, siguientePaso, expiresAt: Date.now() + this.config.session.pendingMfaMs, intentos: 0 };
    const csrfToken = this.csrf.ensureToken(req);
    await save(req);
    return { data: { siguientePaso, csrfToken } };
  }

  @Endpoint('post', '/api/v1/auth/mfa/verificar', {
    status: 200,
    tags: TAG,
    auth: 'pending',
    rateLimit: 'mfa',
    summary: 'Segundo factor: código TOTP o código de recuperación',
    description: 'Rechaza códigos ya usados. Tras 5 errores se cancela el inicio de sesión y la cuenta se bloquea 15 minutos.',
    request: { body: S.MfaVerifyBody },
    errors: [401],
    response: { description: 'Sesión iniciada', schema: S.MfaResult },
  })
  async verifyMfa(@Req() req: AppRequest) {
    const pending = req.session.pending;
    if (!pending) throw new UnauthorizedError('Inicie sesión de nuevo.', 'LOGIN_REQUIRED');
    if (pending.siguientePaso !== 'mfa') throw new UnauthorizedError('Debe configurar el segundo factor.', 'MFA_SETUP_REQUIRED');
    try {
      const { userId, codigosRestantes } = await this.auth.verifySecondFactor(pending.userId, valid(req, 'body', S.MfaVerifyBody), clientIp(req));
      const data = await this.completeLogin(req, userId);
      return { data: { ...data, codigosRestantes } };
    } catch (err) {
      pending.intentos += 1;
      if (pending.intentos >= MAX_PENDING_ATTEMPTS) delete req.session.pending;
      await save(req);
      throw err;
    }
  }

  @Endpoint('post', '/api/v1/auth/mfa/configuracion', {
    status: 200,
    tags: TAG,
    auth: 'pending',
    rateLimit: 'mfa',
    summary: 'Primer ingreso: generar el secreto TOTP',
    description: 'Solo para usuarios sin segundo factor, tras verificar la contraseña. El secreto queda en la sesión (servidor) hasta su activación.',
    response: { description: 'Datos para la aplicación autenticadora', schema: S.MfaSetup },
  })
  async setupMfa(@Req() req: AppRequest) {
    const pending = req.session.pending;
    if (!pending || pending.siguientePaso !== 'configurar_mfa') throw new UnauthorizedError('El segundo factor ya está configurado.', 'MFA_ALREADY_CONFIGURED');
    const setup = await this.auth.startEnrollment(pending.userId);
    req.session.mfaSetup = { secret: setup.secret, expiresAt: Date.now() + MFA_SETUP_MS };
    await save(req);
    return { data: { otpauthUri: setup.uri, qrDataUrl: setup.qrDataUrl, secretoManual: setup.secret } };
  }

  @Endpoint('post', '/api/v1/auth/mfa/activar', {
    status: 200,
    tags: TAG,
    auth: 'pending',
    rateLimit: 'mfa',
    summary: 'Primer ingreso: activar el segundo factor e iniciar sesión',
    description: 'Verifica un código de la aplicación, guarda el secreto cifrado y devuelve 10 códigos de recuperación (se muestran una sola vez).',
    request: { body: S.MfaEnableBody },
    errors: [401],
    response: { description: 'Segundo factor activo; sesión iniciada', schema: S.RecoveryCodes },
  })
  async enableMfa(@Req() req: AppRequest) {
    const pending = req.session.pending;
    const setup = req.session.mfaSetup;
    if (!pending || pending.siguientePaso !== 'configurar_mfa' || !setup || setup.expiresAt < Date.now()) {
      throw new UnauthorizedError('Genere de nuevo el código QR.', 'MFA_SETUP_EXPIRED');
    }
    const { codigosRecuperacion } = await this.auth.confirmEnrollment(pending.userId, setup.secret, valid(req, 'body', S.MfaEnableBody).codigo, clientIp(req));
    const { csrfToken } = await this.completeLogin(req, pending.userId);
    return { data: { codigosRecuperacion, csrfToken } };
  }

  @Endpoint('post', '/api/v1/auth/logout', {
    status: 204,
    tags: TAG,
    auth: 'public',
    summary: 'Cerrar sesión',
    description: 'Destruye la sesión en el servidor y elimina la cookie.',
    response: { description: 'Sesión cerrada' },
  })
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const actor = req.actor;
    await destroy(req, res, this.config.isProd);
    if (actor) await this.audit.record({ actor, accion: 'logout', recurso: 'usuario', recursoId: actor.id, ip: clientIp(req) });
    return undefined;
  }

  @Endpoint('get', '/api/v1/auth/sesion', {
    tags: TAG,
    auth: 'authenticated',
    summary: 'Usuario y permisos de la sesión actual',
    response: { description: 'Sesión activa', schema: S.SessionResponse },
  })
  session(@Req() req: AppRequest) {
    return { data: this.sessionData(req) };
  }

  @Endpoint('post', '/api/v1/auth/recuperacion', {
    status: 202,
    tags: TAG,
    auth: 'public',
    rateLimit: 'recovery',
    summary: 'Solicitar enlace para restablecer la contraseña',
    description: 'Responde siempre 202, exista o no el correo. El enlace es de un solo uso y vence en 30 minutos.',
    request: { body: S.RecoveryRequestBody },
    response: { description: 'Si el correo existe, se envió el enlace', schema: Ok },
  })
  async requestReset(@Req() req: AppRequest) {
    await this.auth.requestPasswordReset(valid(req, 'body', S.RecoveryRequestBody).email, clientIp(req));
    return { data: { ok: true as const } };
  }

  @Endpoint('post', '/api/v1/auth/recuperacion/restablecer', {
    status: 200,
    tags: TAG,
    auth: 'public',
    rateLimit: 'recovery',
    summary: 'Definir una contraseña nueva con el token recibido',
    description:
      'Consume el token, revoca todas las sesiones del usuario y NO inicia sesión: el siguiente ingreso sigue exigiendo el segundo factor. También sirve para activar cuentas invitadas.',
    request: { body: S.ResetBody },
    response: { description: 'Contraseña actualizada', schema: Ok },
  })
  async reset(@Req() req: AppRequest) {
    const body = valid(req, 'body', S.ResetBody);
    await this.auth.resetPassword(body.token, body.password, clientIp(req));
    return { data: { ok: true as const } };
  }

  // --- Mi cuenta ---

  @Endpoint('post', '/api/v1/cuenta/reautenticar', {
    status: 200,
    tags: ACCOUNT,
    auth: 'authenticated',
    rateLimit: 'mfa',
    summary: 'Confirmar identidad para operaciones sensibles',
    description: 'Contraseña + código TOTP. Habilita durante 5 minutos el cambio de dispositivo MFA y la regeneración de códigos.',
    request: { body: S.ReauthBody },
    errors: [401],
    response: { description: 'Identidad confirmada', schema: Ok },
  })
  async reauth(@Req() req: AppRequest) {
    const body = valid(req, 'body', S.ReauthBody);
    await this.auth.reauthenticate((req.actor as NonNullable<AppRequest['actor']>).id, body.password, body.codigo, clientIp(req));
    req.session.reauthAt = Date.now();
    return { data: { ok: true as const } };
  }

  @Endpoint('post', '/api/v1/cuenta/mfa/configuracion', {
    status: 200,
    tags: ACCOUNT,
    auth: 'authenticated',
    rateLimit: 'mfa',
    summary: 'Cambiar de dispositivo MFA: generar un secreto nuevo',
    description: 'Requiere reautenticación reciente.',
    errors: [401],
    response: { description: 'Datos para la aplicación autenticadora', schema: S.MfaSetup },
  })
  async accountSetupMfa(@Req() req: AppRequest) {
    this.requireFreshReauth(req);
    const setup = await this.auth.startEnrollment((req.actor as NonNullable<AppRequest['actor']>).id);
    req.session.mfaSetup = { secret: setup.secret, expiresAt: Date.now() + MFA_SETUP_MS };
    return { data: { otpauthUri: setup.uri, qrDataUrl: setup.qrDataUrl, secretoManual: setup.secret } };
  }

  @Endpoint('post', '/api/v1/cuenta/mfa/activar', {
    status: 200,
    tags: ACCOUNT,
    auth: 'authenticated',
    rateLimit: 'mfa',
    summary: 'Cambiar de dispositivo MFA: confirmar el secreto nuevo',
    description: 'Reemplaza el secreto anterior, genera códigos de recuperación nuevos y cierra las demás sesiones.',
    request: { body: S.MfaEnableBody },
    errors: [401],
    response: { description: 'Nuevo dispositivo activo', schema: S.RecoveryCodes },
  })
  async accountEnableMfa(@Req() req: AppRequest) {
    this.requireFreshReauth(req);
    const actor = req.actor as NonNullable<AppRequest['actor']>;
    const setup = req.session.mfaSetup;
    if (!setup || setup.expiresAt < Date.now()) throw new UnauthorizedError('Genere de nuevo el código QR.', 'MFA_SETUP_EXPIRED');
    const { codigosRecuperacion } = await this.auth.confirmEnrollment(actor.id, setup.secret, valid(req, 'body', S.MfaEnableBody).codigo, clientIp(req));
    const { csrfToken } = await this.completeLogin(req, actor.id);
    return { data: { codigosRecuperacion, csrfToken } };
  }

  @Endpoint('post', '/api/v1/cuenta/mfa/codigos-recuperacion', {
    status: 200,
    tags: ACCOUNT,
    auth: 'authenticated',
    summary: 'Regenerar códigos de recuperación',
    description: 'Invalida los anteriores. Requiere reautenticación reciente.',
    errors: [401],
    response: { description: 'Códigos nuevos (se muestran una sola vez)', schema: S.RecoveryCodes },
  })
  async regenerateCodes(@Req() req: AppRequest) {
    this.requireFreshReauth(req);
    return { data: await this.auth.regenerateRecoveryCodes((req.actor as NonNullable<AppRequest['actor']>).id, clientIp(req)) };
  }

  @Endpoint('put', '/api/v1/cuenta/password', {
    tags: ACCOUNT,
    auth: 'authenticated',
    rateLimit: 'mfa',
    summary: 'Cambiar mi contraseña',
    description: 'Verifica la contraseña actual y rechaza contraseñas comunes o débiles. Cierra todas las demás sesiones; la actual se renueva.',
    request: { body: S.ChangePasswordBody },
    response: { description: 'Contraseña actualizada', schema: S.CsrfResponse },
  })
  async changePassword(@Req() req: AppRequest) {
    const actor = req.actor as NonNullable<AppRequest['actor']>;
    const body = valid(req, 'body', S.ChangePasswordBody);
    await this.auth.changePassword(actor.id, body.actual, body.nueva, clientIp(req));
    const { csrfToken } = await this.completeLogin(req, actor.id);
    return { data: { csrfToken } };
  }

  @Endpoint('patch', '/api/v1/cuenta/perfil', {
    tags: ACCOUNT,
    auth: 'authenticated',
    summary: 'Actualizar mi nombre',
    description: 'Solo permite cambiar el nombre visible; el rol y el correo los gestiona un administrador.',
    request: { body: S.ProfileBody },
    response: { description: 'Perfil actualizado', schema: S.SessionResponse },
  })
  async profile(@Req() req: AppRequest) {
    const actor = req.actor as NonNullable<AppRequest['actor']>;
    await this.users.updateOwnProfile(actor, valid(req, 'body', S.ProfileBody), clientIp(req));
    req.actor = await this.auth.loadActor(actor.id, actor.authVersion);
    return { data: this.sessionData(req) };
  }
}
