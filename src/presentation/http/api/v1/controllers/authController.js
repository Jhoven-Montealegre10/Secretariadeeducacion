'use strict';
/**
 * Autenticación en dos pasos:
 *   1. POST /auth/login  → contraseña correcta: sesión "pendiente" (sin acceso al panel).
 *   2. POST /auth/mfa/verificar (o configurar + activar la primera vez) → sesión completa.
 * Cada cambio de nivel regenera el ID de sesión. Mi cuenta: cambio de contraseña y de
 * dispositivo MFA con reautenticación reciente (contraseña + código).
 */
const config = require('../../../../../config');
const S = require('../schemas/auth');
const { Ok } = require('../schemas/common');
const limits = require('../../../middleware/rateLimits');
const { ensureToken } = require('../../../middleware/csrf');
const { regenerate, save, destroy, establish } = require('../../../middleware/session');
const { UnauthorizedError } = require('../../../../../domain/errors');

const TAG = ['Autenticación'];
const ACCOUNT = ['Mi cuenta'];
const MAX_PENDING_ATTEMPTS = 5;

function register({ route }, { authService, userService, audit }) {
  async function completeLogin(req, userId) {
    await establish(req, userId, authService.currentAuthVersion(userId));
    req.actor = authService.loadActor(userId, req.session.auth.authVersion);
    return { usuario: S.toSessionUser(req.actor), csrfToken: ensureToken(req) };
  }

  function requireFreshReauth(req) {
    if (!req.session.reauthAt || Date.now() - req.session.reauthAt > config.session.reauthMs) {
      throw new UnauthorizedError('Confirme su identidad (contraseña y código) para continuar.', 'REAUTH_REQUIRED');
    }
  }

  route(
    {
      method: 'get',
      path: '/api/v1/auth/csrf',
      tags: TAG,
      auth: 'public',
      summary: 'Obtener el token CSRF de la sesión',
      description: 'Crea (si no existe) y devuelve el token anti-CSRF asociado a la cookie de sesión. Debe enviarse en `X-CSRF-Token`.',
      responses: { 200: { description: 'Token CSRF', schema: S.CsrfResponse } },
    },
    (req) => ({ data: { csrfToken: ensureToken(req) } }),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/login',
      status: 200,
      tags: TAG,
      auth: 'public',
      rateLimit: limits.login,
      summary: 'Primer factor: correo y contraseña',
      description:
        'La respuesta de error es idéntica si el correo no existe, la contraseña es incorrecta o la cuenta está bloqueada (5 intentos → 15 min). No da acceso al panel hasta completar el segundo factor.',
      request: { body: S.LoginBody },
      errors: [401],
      responses: { 200: { description: 'Contraseña correcta; falta el segundo factor', schema: S.LoginStep } },
    },
    async (req) => {
      const { userId, siguientePaso } = await authService.verifyPassword(req.valid.body.email, req.valid.body.password, req.ip);
      await regenerate(req);
      req.session.pending = { userId, siguientePaso, expiresAt: Date.now() + config.session.pendingMfaMs, intentos: 0 };
      await save(req);
      return { data: { siguientePaso, csrfToken: ensureToken(req) } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/mfa/verificar',
      status: 200,
      tags: TAG,
      auth: 'pending',
      rateLimit: limits.mfa,
      summary: 'Segundo factor: código TOTP o código de recuperación',
      description: 'Rechaza códigos ya usados. Tras 5 errores se cancela el inicio de sesión y la cuenta se bloquea 15 minutos.',
      request: { body: S.MfaVerifyBody },
      errors: [401],
      responses: { 200: { description: 'Sesión iniciada', schema: S.MfaResult } },
    },
    async (req) => {
      const pending = req.session.pending;
      if (pending.siguientePaso !== 'mfa') throw new UnauthorizedError('Debe configurar el segundo factor.', 'MFA_SETUP_REQUIRED');
      try {
        const { userId, codigosRestantes } = authService.verifySecondFactor(pending.userId, req.valid.body, req.ip);
        const data = await completeLogin(req, userId);
        return { data: { ...data, codigosRestantes } };
      } catch (err) {
        pending.intentos += 1;
        if (pending.intentos >= MAX_PENDING_ATTEMPTS) delete req.session.pending;
        await save(req);
        throw err;
      }
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/mfa/configuracion',
      status: 200,
      tags: TAG,
      auth: 'pending',
      rateLimit: limits.mfa,
      summary: 'Primer ingreso: generar el secreto TOTP',
      description: 'Solo para usuarios sin segundo factor, tras verificar la contraseña. El secreto queda en la sesión (servidor) hasta su activación.',
      responses: { 200: { description: 'Datos para la aplicación autenticadora', schema: S.MfaSetup } },
    },
    async (req) => {
      if (req.session.pending.siguientePaso !== 'configurar_mfa')
        throw new UnauthorizedError('El segundo factor ya está configurado.', 'MFA_ALREADY_CONFIGURED');
      const setup = await authService.startEnrollment(req.session.pending.userId);
      req.session.mfaSetup = { secret: setup.secret, expiresAt: Date.now() + 10 * 60 * 1000 };
      return { data: { otpauthUri: setup.uri, qrDataUrl: setup.qrDataUrl, secretoManual: setup.secret } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/mfa/activar',
      status: 200,
      tags: TAG,
      auth: 'pending',
      rateLimit: limits.mfa,
      summary: 'Primer ingreso: activar el segundo factor e iniciar sesión',
      description: 'Verifica un código de la aplicación, guarda el secreto cifrado y devuelve 10 códigos de recuperación (se muestran una sola vez).',
      request: { body: S.MfaEnableBody },
      errors: [401],
      responses: { 200: { description: 'Segundo factor activo; sesión iniciada', schema: S.RecoveryCodes } },
    },
    async (req) => {
      const setup = req.session.mfaSetup;
      if (req.session.pending.siguientePaso !== 'configurar_mfa' || !setup || setup.expiresAt < Date.now()) {
        throw new UnauthorizedError('Genere de nuevo el código QR.', 'MFA_SETUP_EXPIRED');
      }
      const { codigosRecuperacion } = authService.confirmEnrollment(req.session.pending.userId, setup.secret, req.valid.body.codigo, req.ip);
      const { csrfToken } = await completeLogin(req, req.session.pending.userId);
      return { data: { codigosRecuperacion, csrfToken } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/logout',
      status: 204,
      tags: TAG,
      auth: 'public',
      summary: 'Cerrar sesión',
      description: 'Destruye la sesión en el servidor y elimina la cookie.',
      responses: { 204: { description: 'Sesión cerrada' } },
    },
    async (req, res) => {
      const actor = req.actor;
      await destroy(req, res);
      if (actor) audit.record({ actor, accion: 'logout', recurso: 'usuario', recursoId: actor.id, ip: req.ip });
      return undefined;
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/auth/sesion',
      tags: TAG,
      auth: 'authenticated',
      summary: 'Usuario y permisos de la sesión actual',
      responses: { 200: { description: 'Sesión activa', schema: S.SessionResponse } },
    },
    (req) => ({
      data: { usuario: S.toSessionUser(req.actor), csrfToken: ensureToken(req), expiraPorInactividadEnSegundos: Math.round(config.session.idleMs / 1000) },
    }),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/recuperacion',
      status: 202,
      tags: TAG,
      auth: 'public',
      rateLimit: limits.recovery,
      summary: 'Solicitar enlace para restablecer la contraseña',
      description: 'Responde siempre 202, exista o no el correo. El enlace es de un solo uso y vence en 30 minutos.',
      request: { body: S.RecoveryRequestBody },
      responses: { 202: { description: 'Si el correo existe, se envió el enlace', schema: Ok } },
    },
    async (req) => {
      await authService.requestPasswordReset(req.valid.body.email, req.ip);
      return { data: { ok: true } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/auth/recuperacion/restablecer',
      status: 200,
      tags: TAG,
      auth: 'public',
      rateLimit: limits.recovery,
      summary: 'Definir una contraseña nueva con el token recibido',
      description:
        'Consume el token, revoca todas las sesiones del usuario y NO inicia sesión: el siguiente ingreso sigue exigiendo el segundo factor. También sirve para activar cuentas invitadas.',
      request: { body: S.ResetBody },
      responses: { 200: { description: 'Contraseña actualizada', schema: Ok } },
    },
    async (req) => {
      await authService.resetPassword(req.valid.body.token, req.valid.body.password, req.ip);
      return { data: { ok: true } };
    },
  );

  // --- Mi cuenta ---
  route(
    {
      method: 'post',
      path: '/api/v1/cuenta/reautenticar',
      status: 200,
      tags: ACCOUNT,
      auth: 'authenticated',
      rateLimit: limits.mfa,
      summary: 'Confirmar identidad para operaciones sensibles',
      description: 'Contraseña + código TOTP. Habilita durante 5 minutos el cambio de dispositivo MFA y la regeneración de códigos.',
      request: { body: S.ReauthBody },
      errors: [401],
      responses: { 200: { description: 'Identidad confirmada', schema: Ok } },
    },
    async (req) => {
      await authService.reauthenticate(req.actor.id, req.valid.body.password, req.valid.body.codigo, req.ip);
      req.session.reauthAt = Date.now();
      return { data: { ok: true } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/cuenta/mfa/configuracion',
      status: 200,
      tags: ACCOUNT,
      auth: 'authenticated',
      rateLimit: limits.mfa,
      summary: 'Cambiar de dispositivo MFA: generar un secreto nuevo',
      description: 'Requiere reautenticación reciente.',
      errors: [401],
      responses: { 200: { description: 'Datos para la aplicación autenticadora', schema: S.MfaSetup } },
    },
    async (req) => {
      requireFreshReauth(req);
      const setup = await authService.startEnrollment(req.actor.id);
      req.session.mfaSetup = { secret: setup.secret, expiresAt: Date.now() + 10 * 60 * 1000 };
      return { data: { otpauthUri: setup.uri, qrDataUrl: setup.qrDataUrl, secretoManual: setup.secret } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/cuenta/mfa/activar',
      status: 200,
      tags: ACCOUNT,
      auth: 'authenticated',
      rateLimit: limits.mfa,
      summary: 'Cambiar de dispositivo MFA: confirmar el secreto nuevo',
      description: 'Reemplaza el secreto anterior, genera códigos de recuperación nuevos y cierra las demás sesiones.',
      request: { body: S.MfaEnableBody },
      errors: [401],
      responses: { 200: { description: 'Nuevo dispositivo activo', schema: S.RecoveryCodes } },
    },
    async (req) => {
      requireFreshReauth(req);
      const setup = req.session.mfaSetup;
      if (!setup || setup.expiresAt < Date.now()) throw new UnauthorizedError('Genere de nuevo el código QR.', 'MFA_SETUP_EXPIRED');
      const { codigosRecuperacion } = authService.confirmEnrollment(req.actor.id, setup.secret, req.valid.body.codigo, req.ip);
      const { csrfToken } = await completeLogin(req, req.actor.id);
      return { data: { codigosRecuperacion, csrfToken } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/cuenta/mfa/codigos-recuperacion',
      status: 200,
      tags: ACCOUNT,
      auth: 'authenticated',
      summary: 'Regenerar códigos de recuperación',
      description: 'Invalida los anteriores. Requiere reautenticación reciente.',
      errors: [401],
      responses: { 200: { description: 'Códigos nuevos (se muestran una sola vez)', schema: S.RecoveryCodes } },
    },
    (req) => {
      requireFreshReauth(req);
      return { data: authService.regenerateRecoveryCodes(req.actor.id, req.ip) };
    },
  );

  route(
    {
      method: 'put',
      path: '/api/v1/cuenta/password',
      tags: ACCOUNT,
      auth: 'authenticated',
      rateLimit: limits.mfa,
      summary: 'Cambiar mi contraseña',
      description: 'Verifica la contraseña actual y rechaza contraseñas comunes o débiles. Cierra todas las demás sesiones; la actual se renueva.',
      request: { body: S.ChangePasswordBody },
      responses: { 200: { description: 'Contraseña actualizada', schema: S.CsrfResponse } },
    },
    async (req) => {
      await authService.changePassword(req.actor.id, req.valid.body.actual, req.valid.body.nueva, req.ip);
      const { csrfToken } = await completeLogin(req, req.actor.id);
      return { data: { csrfToken } };
    },
  );

  route(
    {
      method: 'patch',
      path: '/api/v1/cuenta/perfil',
      tags: ACCOUNT,
      auth: 'authenticated',
      summary: 'Actualizar mi nombre',
      description: 'Solo permite cambiar el nombre visible; el rol y el correo los gestiona un administrador.',
      request: { body: S.ProfileBody },
      responses: { 200: { description: 'Perfil actualizado', schema: S.SessionResponse } },
    },
    (req) => {
      userService.updateOwnProfile(req.actor, req.valid.body, req.ip);
      const actor = authService.loadActor(req.actor.id, req.actor.authVersion);
      return {
        data: { usuario: S.toSessionUser(actor), csrfToken: ensureToken(req), expiraPorInactividadEnSegundos: Math.round(config.session.idleMs / 1000) },
      };
    },
  );
}

module.exports = { register };
