/**
 * Casos de uso de autenticación: contraseña (Argon2id), segundo factor TOTP obligatorio,
 * códigos de recuperación, cambio y restablecimiento de contraseña.
 * La gestión de la sesión HTTP (regenerar, guardar estado) vive en la capa de presentación.
 */
import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TooManyRequestsError, UnauthorizedError, ValidationError } from '../domain/errors';
import { validarPassword } from '../domain/password-policy';
import type { Actor } from '../domain/permissions';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { Db } from '../infrastructure/database/db.service';
import { Mailer } from '../infrastructure/mail/mailer.service';
import { CredentialRepository, RoleRepository, UserRepository, type UserRecord } from '../infrastructure/repositories/identity.repositories';
import { CryptoService } from '../infrastructure/security/crypto.service';
import { PasswordHasher } from '../infrastructure/security/password-hasher.service';
import { PasswordStrength } from '../infrastructure/security/password-strength.service';
import { TotpService } from '../infrastructure/security/totp.service';
import { AuditService } from './audit.service';
import { CLOCK, type Clock } from './clock';

export const MAX_LOGIN_FAILURES = 5;
export const MAX_MFA_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const RECOVERY_CODES = 10;
export const GENERIC_LOGIN = 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.';

/** 10 caracteres base32 (~50 bits) en dos grupos: fácil de transcribir. */
export function newRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = [...crypto.randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export const normalizeCode = (c: unknown): string =>
  String(c ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly strength: PasswordStrength,
    private readonly totp: TotpService,
    private readonly crypto: CryptoService,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  checkPolicy(password: string, user?: Pick<UserRecord, 'email' | 'nombre'> | null, campo = 'password'): void {
    const error = validarPassword(password, this.strength.evaluate, [user?.email, user?.nombre, user?.email?.split('@')[0]]);
    if (error) throw new ValidationError(error, [{ campo, mensaje: error }]);
  }

  private async issueResetToken(user: UserRecord, ttlMs: number, kind: 'invitacion' | 'recuperacion'): Promise<void> {
    const token = this.crypto.randomToken(32);
    await this.credentials.createResetToken(user.id, this.crypto.tokenHash(token), this.clock.now() + ttlMs);
    const link = `${this.config.appUrl}/admin/restablecer#token=${token}`;
    const invite = kind === 'invitacion';
    await this.mailer.send({
      to: user.email,
      subject: invite ? 'Active su cuenta del portal de la Secretaría de Educación' : 'Restablecer su contraseña del portal',
      text:
        `${invite ? 'Se creó una cuenta para usted en el panel del portal.' : 'Recibimos una solicitud para restablecer su contraseña.'}\n\n` +
        `Use este enlace (válido ${Math.round(ttlMs / 60000)} minutos, de un solo uso):\n${link}\n\n` +
        'Si usted no lo solicitó, ignore este mensaje. Nunca le pediremos su contraseña ni sus códigos por correo.',
    });
  }

  private isLocked(user: UserRecord): boolean {
    return user.bloqueadoHasta !== null && user.bloqueadoHasta > this.clock.now();
  }

  /** Primer factor. Devuelve el usuario y el siguiente paso, o lanza un error genérico. */
  async verifyPassword(email: string, password: string, ip: string | null): Promise<{ userId: number; siguientePaso: 'mfa' | 'configurar_mfa' }> {
    const user = await this.users.findByEmail(
      String(email ?? '')
        .trim()
        .toLowerCase(),
    );
    const fail = async (detalle: string) => {
      await this.audit.record({ email, accion: 'login', recurso: 'usuario', recursoId: user?.id ?? null, resultado: 'fallo', detalle, ip });
      return new UnauthorizedError(GENERIC_LOGIN, 'INVALID_CREDENTIALS');
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
      const { bloqueado } = await this.users.incrementLoginFailures(user.id, MAX_LOGIN_FAILURES, LOCK_MS);
      throw await fail(bloqueado ? 'contraseña incorrecta; cuenta bloqueada 15 min' : 'contraseña incorrecta');
    }
    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.users.setPasswordHash(user.id, await this.hasher.hash(password), { rotateSessions: false });
    }
    return { userId: user.id, siguientePaso: user.mfaActivo ? 'mfa' : 'configurar_mfa' };
  }

  /** Segundo factor con código TOTP o código de recuperación. */
  async verifySecondFactor(
    userId: number,
    input: { codigo?: string; codigoRecuperacion?: string },
    ip: string | null,
  ): Promise<{ userId: number; codigosRestantes: number }> {
    const user = await this.users.findById(userId);
    if (!user || !user.activo || !user.mfaActivo || !user.mfaSecretoEnc)
      throw new UnauthorizedError('La verificación no es válida. Inicie sesión de nuevo.', 'MFA_INVALID');
    if (this.isLocked(user)) throw new TooManyRequestsError('Cuenta bloqueada temporalmente por intentos fallidos.');

    let ok: boolean;
    let metodo = 'totp';
    if (input.codigoRecuperacion) {
      metodo = 'codigo_recuperacion';
      ok = await this.credentials.consumeRecoveryCode(user.id, this.crypto.tokenHash(normalizeCode(input.codigoRecuperacion)));
    } else {
      const step = this.totp.verify(this.crypto.decrypt(user.mfaSecretoEnc), input.codigo, this.clock.now());
      ok = step !== null && (await this.users.consumeTotpStep(user.id, step)); // rechaza códigos ya usados
    }
    const actor = { id: user.id, email: user.email };
    if (!ok) {
      const { bloqueado } = await this.users.incrementMfaFailures(user.id, MAX_MFA_FAILURES, LOCK_MS);
      await this.audit.record({ actor, accion: 'mfa_verificar', recurso: 'usuario', recursoId: user.id, resultado: 'fallo', detalle: metodo, ip });
      if (bloqueado) throw new TooManyRequestsError('Demasiados códigos incorrectos. La cuenta quedó bloqueada 15 minutos.');
      throw new UnauthorizedError('Código incorrecto o ya utilizado.', 'MFA_INVALID');
    }
    await this.users.recordLoginSuccess(user.id);
    await this.audit.record({ actor, accion: 'login', recurso: 'usuario', recursoId: user.id, resultado: 'exito', detalle: metodo, ip });
    return { userId: user.id, codigosRestantes: await this.credentials.remainingRecoveryCodes(user.id) };
  }

  /** Genera un secreto TOTP nuevo (aún no activo) y su código QR. */
  async startEnrollment(userId: number): Promise<{ secret: string; uri: string; qrDataUrl: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();
    const secret = this.totp.createSecret();
    const { uri, qrDataUrl } = await this.totp.enrollment(secret, user.email);
    return { secret, uri, qrDataUrl };
  }

  private async newRecoveryCodes(userId: number): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    await this.credentials.replaceRecoveryCodes(
      userId,
      codes.map((c) => this.crypto.tokenHash(normalizeCode(c))),
    );
    return codes;
  }

  /** Confirma el enrolamiento con un código válido; devuelve los códigos de recuperación (una sola vez). */
  async confirmEnrollment(userId: number, secret: string | undefined, codigo: string, ip: string | null): Promise<{ codigosRecuperacion: string[] }> {
    const user = await this.users.findById(userId);
    if (!user || !secret) throw new UnauthorizedError('Inicie de nuevo la configuración del segundo factor.', 'MFA_SETUP_EXPIRED');
    const step = this.totp.verify(secret, codigo, this.clock.now());
    if (step === null)
      throw new ValidationError('El código no coincide. Verifique la hora de su teléfono e intente de nuevo.', [
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

  async regenerateRecoveryCodes(userId: number, ip: string | null): Promise<{ codigosRecuperacion: string[] }> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();
    const codes = await this.db.transaction(async () => {
      const generated = await this.newRecoveryCodes(user.id);
      await this.audit.record({ actor: user, accion: 'mfa_regenerar_codigos', recurso: 'usuario', recursoId: user.id, ip });
      return generated;
    });
    return { codigosRecuperacion: codes };
  }

  /** Reautenticación (contraseña + código) para operaciones sensibles sobre la propia cuenta. */
  async reauthenticate(userId: number, password: string, codigo: string, ip: string | null): Promise<void> {
    const user = await this.users.findById(userId);
    const passwordOk = !!user && (await this.hasher.verify(password, user.passwordHash));
    const step =
      passwordOk && user?.mfaActivo && user.mfaSecretoEnc ? this.totp.verify(this.crypto.decrypt(user.mfaSecretoEnc), codigo, this.clock.now()) : null;
    if (!user || !passwordOk || step === null || !(await this.users.consumeTotpStep(user.id, step))) {
      await this.audit.record({ actor: user, accion: 'reautenticar', recurso: 'usuario', recursoId: userId, resultado: 'fallo', ip });
      throw new UnauthorizedError('Contraseña o código incorrectos.', 'REAUTH_FAILED');
    }
    await this.audit.record({ actor: user, accion: 'reautenticar', recurso: 'usuario', recursoId: userId, ip });
  }

  /** Cambia la contraseña y revoca las demás sesiones; devuelve la nueva versión de autenticación. */
  async changePassword(userId: number, actual: string, nueva: string, ip: string | null): Promise<number> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();
    if (!(await this.hasher.verify(actual, user.passwordHash))) {
      await this.audit.record({ actor: user, accion: 'cambiar_password', recurso: 'usuario', recursoId: userId, resultado: 'fallo', ip });
      throw new ValidationError('La contraseña actual no es correcta.', [{ campo: 'actual', mensaje: 'Incorrecta' }]);
    }
    if (nueva === actual) throw new ValidationError('La contraseña nueva debe ser distinta de la actual.', [{ campo: 'nueva', mensaje: 'Igual a la actual' }]);
    this.checkPolicy(nueva, user, 'nueva');
    const hash = await this.hasher.hash(nueva);
    await this.db.transaction(async () => {
      await this.users.setPasswordHash(user.id, hash);
      await this.credentials.deleteSessionsOfUser(user.id);
      await this.audit.record({ actor: user, accion: 'cambiar_password', recurso: 'usuario', recursoId: userId, ip });
    });
    return (await this.users.findById(user.id))?.authVersion ?? 0;
  }

  /** Siempre responde igual, exista o no el correo (evita enumeración). */
  async requestPasswordReset(email: string, ip: string | null): Promise<void> {
    const user = await this.users.findByEmail(
      String(email ?? '')
        .trim()
        .toLowerCase(),
    );
    await this.audit.record({
      email,
      accion: 'solicitar_recuperacion',
      recurso: 'usuario',
      recursoId: user?.id ?? null,
      resultado: user?.activo ? 'exito' : 'fallo',
      ip,
    });
    if (user?.activo) await this.issueResetToken(user, RESET_TTL_MS, 'recuperacion');
  }

  async sendInvitation(user: UserRecord): Promise<void> {
    await this.issueResetToken(user, INVITE_TTL_MS, 'invitacion');
  }

  /**
   * Restablece la contraseña con un token válido, de un solo uso. No inicia sesión ni desactiva
   * el segundo factor: el siguiente ingreso sigue exigiendo TOTP.
   */
  async resetPassword(token: string, nueva: string, ip: string | null): Promise<void> {
    const invalid = () => new ValidationError('El enlace no es válido o expiró. Solicite uno nuevo.', [{ campo: 'token', mensaje: 'Inválido o expirado' }]);
    const record = await this.credentials.findResetToken(this.crypto.tokenHash(String(token ?? '')));
    if (!record || record.usadoEn || record.expiraEn < this.clock.now()) throw invalid();
    const user = await this.users.findById(record.usuarioId);
    if (!user || !user.activo) throw invalid();
    this.checkPolicy(nueva, user);
    const hash = await this.hasher.hash(nueva);
    await this.db.transaction(async () => {
      if (!(await this.credentials.consumeResetToken(record.id))) throw invalid();
      await this.users.setPasswordHash(user.id, hash);
      await this.credentials.deleteSessionsOfUser(user.id);
      await this.audit.record({ actor: user, accion: 'restablecer_password', recurso: 'usuario', recursoId: user.id, ip });
    });
  }

  /** Construye el actor (identidad + permisos) desde la base de datos, nunca desde el navegador. */
  async loadActor(userId: number, authVersion: number): Promise<Actor | null> {
    const user = await this.users.findById(userId);
    if (!user || !user.activo || !user.mfaActivo || user.authVersion !== authVersion) return null;
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

  async currentAuthVersion(userId: number): Promise<number | undefined> {
    return (await this.users.findById(userId))?.authVersion;
  }

  async findUser(userId: number): Promise<UserRecord | null> {
    return this.users.findById(userId);
  }
}
