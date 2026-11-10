/**
 * Primitivas criptográficas de `node:crypto` (sin implementaciones propias):
 *  - AES-256-GCM para datos personales y secretos MFA;
 *  - HMAC-SHA256 para tokens de alta entropía, índices ciegos, cadena de auditoría y estadísticas.
 * Cada propósito usa una clave derivada (HKDF) de DATA_ENCRYPTION_KEY.
 */
import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

const VERSION = 'v1';

export interface AuditChainRow {
  usuarioId: number | null;
  usuarioEmail: string | null;
  accion: string;
  recurso: string | null;
  recursoId: string | null;
  resultado: string;
  detalle: string | null;
  ipHash: string | null;
  creadoEn: string;
}

@Injectable()
export class CryptoService {
  private readonly keys: Record<'encryption' | 'blindIndex' | 'token' | 'audit' | 'stats', Buffer>;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'dataKey'>) {
    const derive = (label: string) => Buffer.from(crypto.hkdfSync('sha256', config.dataKey, Buffer.alloc(0), label, 32));
    this.keys = {
      encryption: derive('sem-encryption'),
      blindIndex: derive('sem-blind-index'),
      token: derive('sem-token'),
      audit: derive('sem-audit-chain'),
      stats: derive('sem-stats'),
    };
  }

  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keys.encryption, iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
  }

  decrypt(payload: string | null | undefined): string {
    if (!payload) return '';
    const [version, iv, tag, data] = String(payload).split(':');
    if (version !== VERSION || !iv || !tag || !data) throw new Error('Formato de cifrado no soportado');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.keys.encryption, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  private hmac(key: Buffer, value: string): string {
    return crypto.createHmac('sha256', key).update(value).digest('hex');
  }

  blindIndex(value: string): string {
    return this.hmac(this.keys.blindIndex, String(value).trim().toLowerCase());
  }

  tokenHash(value: string): string {
    return this.hmac(this.keys.token, String(value));
  }

  auditChainHash(previous: string, row: AuditChainRow): string {
    const canonical = JSON.stringify([
      row.usuarioId ?? null,
      row.usuarioEmail ?? null,
      row.accion,
      row.recurso ?? null,
      row.recursoId ?? null,
      row.resultado,
      row.detalle ?? null,
      row.ipHash ?? null,
      row.creadoEn,
    ]);
    return this.hmac(this.keys.audit, `${previous}|${canonical}`);
  }

  statsHash(salt: string, value: string): string {
    return this.hmac(this.keys.stats, `${salt}|${value}`);
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  }

  randomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }
}
