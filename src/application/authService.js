'use strict';
/**
 * Casos de uso de autenticación: contraseña (Argon2id), segundo factor TOTP obligatorio,
 * códigos de recuperación, cambio y restablecimiento de contraseña.
 * La gestión de la sesión HTTP (regenerar, guardar estado) vive en la capa de presentación.
 */
const crypto = require('node:crypto');
const { UnauthorizedError, ValidationError, TooManyRequestsError } = require('../domain/errors');
const { validarPassword } = require('../domain/passwordPolicy');

const MAX_LOGIN_FAILURES = 5;
const MAX_MFA_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const RECOVERY_CODES = 10;
const GENERIC_LOGIN = 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.';

function newRecoveryCode() {
  // 10 caracteres base32 (~50 bits) en dos grupos: fácil de transcribir.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}
const normalizeCode = (c) =>
  String(c || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

function createAuthService({
  userRepository,
  roleRepository,
  credentialRepository,
  passwordHasher,
  passwordStrength,
  totp,
  crypto: cryptoSvc,
  mailer,
  audit,
  appUrl,
  clock = Date,
}) {
  function checkPolicy(password, user) {
    const error = validarPassword(password, { evaluar: passwordStrength.evaluate, datosUsuario: [user?.email, user?.nombre, user?.email?.split('@')[0]] });
    if (error) throw new ValidationError(error, [{ campo: 'password', mensaje: error }]);
  }

  async function issueResetToken(user, ttlMs, kind) {
    const token = cryptoSvc.randomToken(32);
    credentialRepository.createResetToken(user.id, cryptoSvc.tokenHash(token), clock.now() + ttlMs);
    const link = `${appUrl}/admin/restablecer#token=${token}`;
    const invite = kind === 'invitacion';
    await mailer.send({
      to: user.email,
      subject: invite ? 'Active su cuenta del portal de la Secretaría de Educación' : 'Restablecer su contraseña del portal',
      text:
        `${invite ? 'Se creó una cuenta para usted en el panel del portal.' : 'Recibimos una solicitud para restablecer su contraseña.'}\n\n` +
        `Use este enlace (válido ${Math.round(ttlMs / 60000)} minutos, de un solo uso):\n${link}\n\n` +
        'Si usted no lo solicitó, ignore este mensaje. Nunca le pediremos su contraseña ni sus códigos por correo.',
    });
  }

  return {
    GENERIC_LOGIN,

    /** Primer factor. Devuelve el usuario y el siguiente paso, o lanza un error genérico. */
    async verifyPassword(email, password, ip) {
      const user = userRepository.findByEmail(
        String(email || '')
          .trim()
          .toLowerCase(),
      );
      const fail = (detalle) => {
        audit.record({ email, accion: 'login', recurso: 'usuario', recursoId: user?.id ?? null, resultado: 'fallo', detalle, ip });
        return new UnauthorizedError(GENERIC_LOGIN, 'INVALID_CREDENTIALS');
      };
      if (!user) {
        await passwordHasher.verifyDummy(password);
        throw fail('usuario inexistente');
      }
      if (!user.activo) {
        await passwordHasher.verifyDummy(password);
        throw fail('usuario inactivo');
      }
      if (user.bloqueadoHasta && user.bloqueadoHasta > clock.now()) {
        await passwordHasher.verifyDummy(password);
        throw fail('cuenta bloqueada');
      }

      if (!(await passwordHasher.verify(password, user.passwordHash))) {
        const intentos = user.intentosFallidos + 1;
        const lock = intentos >= MAX_LOGIN_FAILURES ? clock.now() + LOCK_MS : null;
        userRepository.recordLoginFailure(user.id, lock ? 0 : intentos, lock);
        throw fail(lock ? 'contraseña incorrecta; cuenta bloqueada 15 min' : 'contraseña incorrecta');
      }
      if (passwordHasher.needsRehash(user.passwordHash)) {
        userRepository.setPasswordHash(user.id, await passwordHasher.hash(password), { rotateSessions: false });
      }
      return { userId: user.id, siguientePaso: user.mfaActivo ? 'mfa' : 'configurar_mfa' };
    },

    /** Segundo factor con código TOTP o código de recuperación. */
    verifySecondFactor(userId, { codigo, codigoRecuperacion }, ip) {
      const user = userRepository.findById(userId);
      if (!user || !user.activo || !user.mfaActivo) throw new UnauthorizedError('La verificación no es válida. Inicie sesión de nuevo.', 'MFA_INVALID');
      if (user.bloqueadoHasta && user.bloqueadoHasta > clock.now()) throw new TooManyRequestsError('Cuenta bloqueada temporalmente por intentos fallidos.');

      let ok = false;
      let metodo = 'totp';
      if (codigoRecuperacion) {
        metodo = 'codigo_recuperacion';
        ok = credentialRepository.consumeRecoveryCode(user.id, cryptoSvc.tokenHash(normalizeCode(codigoRecuperacion)));
      } else {
        const step = totp.verify(cryptoSvc.decrypt(user.mfaSecretoEnc), codigo, clock.now());
        ok = step !== null && userRepository.consumeTotpStep(user.id, step); // rechaza códigos ya usados
      }
      if (!ok) {
        const intentos = user.mfaIntentosFallidos + 1;
        const lock = intentos >= MAX_MFA_FAILURES ? clock.now() + LOCK_MS : null;
        userRepository.recordMfaFailure(user.id, lock ? 0 : intentos, lock);
        audit.record({
          actor: { id: user.id, email: user.email },
          accion: 'mfa_verificar',
          recurso: 'usuario',
          recursoId: user.id,
          resultado: 'fallo',
          detalle: metodo,
          ip,
        });
        if (lock) throw new TooManyRequestsError('Demasiados códigos incorrectos. La cuenta quedó bloqueada 15 minutos.');
        throw new UnauthorizedError('Código incorrecto o ya utilizado.', 'MFA_INVALID');
      }
      userRepository.recordLoginSuccess(user.id);
      audit.record({
        actor: { id: user.id, email: user.email },
        accion: 'login',
        recurso: 'usuario',
        recursoId: user.id,
        resultado: 'exito',
        detalle: metodo,
        ip,
      });
      return { userId: user.id, codigosRestantes: credentialRepository.remainingRecoveryCodes(user.id) };
    },

    /** Genera un secreto TOTP nuevo (aún no activo) y su código QR. */
    async startEnrollment(userId) {
      const user = userRepository.findById(userId);
      if (!user) throw new UnauthorizedError();
      const secret = totp.createSecret();
      const { uri, qrDataUrl } = await totp.enrollment(secret, user.email);
      return { secret, uri, qrDataUrl };
    },

    /** Confirma el enrolamiento con un código válido; guarda el secreto cifrado y devuelve los códigos de recuperación (una sola vez). */
    confirmEnrollment(userId, secret, codigo, ip) {
      const user = userRepository.findById(userId);
      if (!user || !secret) throw new UnauthorizedError('Inicie de nuevo la configuración del segundo factor.', 'MFA_SETUP_EXPIRED');
      const step = totp.verify(secret, codigo, clock.now());
      if (step === null)
        throw new ValidationError('El código no coincide. Verifique la hora de su teléfono e intente de nuevo.', [
          { campo: 'codigo', mensaje: 'Código incorrecto' },
        ]);
      userRepository.setMfa(user.id, { secretoEnc: cryptoSvc.encrypt(secret), activo: true });
      userRepository.consumeTotpStep(user.id, step);
      const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
      credentialRepository.replaceRecoveryCodes(
        user.id,
        codes.map((c) => cryptoSvc.tokenHash(normalizeCode(c))),
      );
      userRepository.recordLoginSuccess(user.id);
      audit.record({ actor: { id: user.id, email: user.email }, accion: 'mfa_configurar', recurso: 'usuario', recursoId: user.id, ip });
      return { codigosRecuperacion: codes };
    },

    regenerateRecoveryCodes(userId, ip) {
      const user = userRepository.findById(userId);
      const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
      credentialRepository.replaceRecoveryCodes(
        user.id,
        codes.map((c) => cryptoSvc.tokenHash(normalizeCode(c))),
      );
      audit.record({ actor: { id: user.id, email: user.email }, accion: 'mfa_regenerar_codigos', recurso: 'usuario', recursoId: user.id, ip });
      return { codigosRecuperacion: codes };
    },

    /** Reautenticación (contraseña + código) para operaciones sensibles sobre la propia cuenta. */
    async reauthenticate(userId, password, codigo, ip) {
      const user = userRepository.findById(userId);
      const passwordOk = user && (await passwordHasher.verify(password, user.passwordHash));
      const step = passwordOk && user.mfaActivo ? totp.verify(cryptoSvc.decrypt(user.mfaSecretoEnc), codigo, clock.now()) : null;
      if (!passwordOk || step === null || !userRepository.consumeTotpStep(user.id, step)) {
        audit.record({ actor: user, accion: 'reautenticar', recurso: 'usuario', recursoId: userId, resultado: 'fallo', ip });
        throw new UnauthorizedError('Contraseña o código incorrectos.', 'REAUTH_FAILED');
      }
      audit.record({ actor: user, accion: 'reautenticar', recurso: 'usuario', recursoId: userId, ip });
    },

    async changePassword(userId, actual, nueva, ip) {
      const user = userRepository.findById(userId);
      if (!(await passwordHasher.verify(actual, user.passwordHash))) {
        audit.record({ actor: user, accion: 'cambiar_password', recurso: 'usuario', recursoId: userId, resultado: 'fallo', ip });
        throw new ValidationError('La contraseña actual no es correcta.', [{ campo: 'actual', mensaje: 'Incorrecta' }]);
      }
      checkPolicy(nueva, user);
      userRepository.setPasswordHash(user.id, await passwordHasher.hash(nueva)); // invalida las demás sesiones
      credentialRepository.deleteSessionsOfUser(user.id);
      audit.record({ actor: user, accion: 'cambiar_password', recurso: 'usuario', recursoId: userId, ip });
      return userRepository.findById(user.id).authVersion;
    },

    /** Siempre responde igual, exista o no el correo (evita enumeración). */
    async requestPasswordReset(email, ip) {
      const user = userRepository.findByEmail(
        String(email || '')
          .trim()
          .toLowerCase(),
      );
      audit.record({
        email,
        accion: 'solicitar_recuperacion',
        recurso: 'usuario',
        recursoId: user?.id ?? null,
        resultado: user?.activo ? 'exito' : 'fallo',
        ip,
      });
      if (user && user.activo) await issueResetToken(user, RESET_TTL_MS, 'recuperacion');
    },

    async sendInvitation(user) {
      await issueResetToken(user, INVITE_TTL_MS, 'invitacion');
    },

    /**
     * Restablece la contraseña con un token válido, de un solo uso. No inicia sesión ni
     * desactiva el segundo factor: el siguiente ingreso sigue exigiendo TOTP.
     */
    async resetPassword(token, nueva, ip) {
      const record = credentialRepository.findResetToken(cryptoSvc.tokenHash(String(token || '')));
      const invalid = () => new ValidationError('El enlace no es válido o expiró. Solicite uno nuevo.', [{ campo: 'token', mensaje: 'Inválido o expirado' }]);
      if (!record || record.usadoEn || record.expiraEn < clock.now()) throw invalid();
      const user = userRepository.findById(record.usuarioId);
      if (!user || !user.activo) throw invalid();
      checkPolicy(nueva, user);
      const hash = await passwordHasher.hash(nueva);
      if (!credentialRepository.consumeResetToken(record.id)) throw invalid();
      userRepository.setPasswordHash(user.id, hash);
      credentialRepository.deleteSessionsOfUser(user.id);
      audit.record({ actor: user, accion: 'restablecer_password', recurso: 'usuario', recursoId: user.id, ip });
    },

    /** Construye el actor (identidad + permisos) a partir de la base de datos, nunca del navegador. */
    loadActor(userId, authVersion) {
      const user = userRepository.findById(userId);
      if (!user || !user.activo || !user.mfaActivo || user.authVersion !== authVersion) return null;
      return {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rolId: user.rolId,
        rolSlug: user.rolSlug,
        rolNombre: user.rolNombre,
        permisos: new Set(roleRepository.permissionsOf(user.rolId)),
        authVersion: user.authVersion,
      };
    },

    currentAuthVersion(userId) {
      return userRepository.findById(userId)?.authVersion;
    },

    checkPolicy,
  };
}

module.exports = { createAuthService };
