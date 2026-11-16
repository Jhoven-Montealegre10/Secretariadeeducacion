/**
 * Primitivas criptográficas de `node:crypto` (sin implementaciones propias):
 *  - AES-256-GCM para datos personales y secretos MFA;
 *  - HMAC-SHA-256 para tokens de alta entropía, índices ciegos, cadena de auditoría y estadísticas.
 *
 * Llavero con rotación (DATA_ENCRYPTION_KEYS, ver docs/SECRETOS.md): cada clave tiene un identificador y
 * de ella se derivan (HKDF-SHA-256) subclaves por propósito. La primera clave activa es la VIGENTE:
 *  - cifra (formato v2:<id>:iv:tag:datos) y firma los hash nuevos;
 *  - las demás claves activas siguen descifrando y verificando, para que una rotación no interrumpa el
 *    servicio (tokens, códigos de recuperación, sesiones e índices creados antes de rotar siguen valiendo);
 *  - una clave RETIRADA ya no cifra ni descifra: solo verifica la cadena de auditoría antigua.
 * El formato anterior (v1, sin identificador) se descifra probando las claves activas.
 */
import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { fingerprint, type KeyEntry } from '../../config/secrets';

const V1 = 'v1';
const V2 = 'v2';

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

type Purpose = 'encryption' | 'blindIndex' | 'token' | 'audit' | 'stats';
interface DerivedKey {
  id: string;
  retired: boolean;
  fingerprint: string;
  keys: Record<Purpose, Buffer>;
}

function derive(entry: KeyEntry): DerivedKey {
  const d = (label: string) => Buffer.from(crypto.hkdfSync('sha256', entry.key, Buffer.alloc(0), label, 32));
  return {
    id: entry.id,
    retired: entry.retired,
    fingerprint: fingerprint(entry.key),
    keys: {
      encryption: d('sem-encryption'),
      blindIndex: d('sem-blind-index'),
      token: d('sem-token'),
      audit: d('sem-audit-chain'),
      stats: d('sem-stats'),
    },
  };
}

@Injectable()
export class CryptoService {
  private readonly all: DerivedKey[];
  /** Claves que cifran/descifran y verifican (la primera es la vigente). */
  private readonly active: DerivedKey[];
  private readonly byId: Map<string, DerivedKey>;

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'dataKeys'>) {
    this.all = config.dataKeys.map(derive);
    this.active = this.all.filter((k) => !k.retired);
    if (!this.active.length) throw new Error('El llavero de datos no tiene ninguna clave activa.');
    this.byId = new Map(this.all.map((k) => [k.id, k]));
  }

  private get current(): DerivedKey {
    return this.active[0];
  }

  /** Identificador de la clave vigente (se guarda junto a cada evento de auditoría). */
  get currentKeyId(): string {
    return this.current.id;
  }

  /** Identificadores y huellas SHA-256 (no las claves) para diagnóstico y para la herramienta de rotación. */
  describeKeys(): Array<{ id: string; fingerprint: string; vigente: boolean; retirada: boolean }> {
    return this.all.map((k) => ({ id: k.id, fingerprint: k.fingerprint, vigente: k === this.current, retirada: k.retired }));
  }

  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.current.keys.encryption, iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return [V2, this.current.id, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
  }

  decrypt(payload: string | null | undefined): string {
    if (!payload) return '';
    const parts = String(payload).split(':');
    if (parts[0] === V2 && parts.length === 5) {
      const key = this.byId.get(parts[1]);
      if (!key || key.retired) throw new Error(`Clave de cifrado ${parts[1]} no disponible en el llavero`);
      return this.open(key, parts[2], parts[3], parts[4]);
    }
    if (parts[0] === V1 && parts.length === 4) {
      for (const key of this.active) {
        try {
          return this.open(key, parts[1], parts[2], parts[3]);
        } catch {
          /* se prueba la siguiente clave activa */
        }
      }
      throw new Error('Ninguna clave activa descifra este dato (formato v1)');
    }
    throw new Error('Formato de cifrado no soportado');
  }

  /** true si el dato está cifrado con la clave vigente (si no, la rotación debe volver a cifrarlo). */
  isCurrent(payload: string | null | undefined): boolean {
    return !payload || String(payload).startsWith(`${V2}:${this.current.id}:`);
  }

  /** Identificador de la clave con que está cifrado un dato (v1 → null). */
  keyIdOf(payload: string): string | null {
    const parts = String(payload).split(':');
    return parts[0] === V2 ? parts[1] : null;
  }

  private open(key: DerivedKey, iv: string, tag: string, data: string): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key.keys.encryption, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  private hmac(key: Buffer, value: string): string {
    return crypto.createHmac('sha256', key).update(value).digest('hex');
  }

  /** Índice ciego con la clave vigente (para guardar). */
  blindIndex(value: string): string {
    return this.hmac(this.current.keys.blindIndex, String(value).trim().toLowerCase());
  }

  /** Índices ciegos con todas las claves activas (para buscar durante una rotación). */
  blindIndexAll(value: string): string[] {
    return this.active.map((k) => this.hmac(k.keys.blindIndex, String(value).trim().toLowerCase()));
  }

  /** Hash de un token con la clave vigente (para guardar). */
  tokenHash(value: string): string {
    return this.hmac(this.current.keys.token, String(value));
  }

  /** Hash de un token con todas las claves activas (para verificar tokens creados antes de rotar). */
  tokenHashAll(value: string): string[] {
    return this.active.map((k) => this.hmac(k.keys.token, String(value)));
  }

  /**
   * HMAC de un evento de auditoría encadenado al anterior. `keyId` es la clave con que se firmó (guardada en
   * cada fila); sin ella (filas anteriores a la rotación) se usa la primera clave del llavero que coincida.
   */
  auditChainHash(previous: string, row: AuditChainRow, keyId?: string): string {
    const key = keyId ? this.byId.get(keyId) : this.current;
    if (!key) throw new Error(`Clave de auditoría ${keyId} no disponible en el llavero`);
    return this.hmac(key.keys.audit, `${previous}|${this.canonical(row)}`);
  }

  /** Verifica un eslabón: con su clave si la conoce; si no (filas antiguas sin clave), con cualquiera del llavero. */
  verifyAuditLink(previous: string, row: AuditChainRow, hash: string, keyId: string | null): boolean {
    const candidates = keyId ? [this.byId.get(keyId)].filter((k): k is DerivedKey => !!k) : this.all;
    return candidates.some((k) => this.safeEqual(this.hmac(k.keys.audit, `${previous}|${this.canonical(row)}`), hash));
  }

  private canonical(row: AuditChainRow): string {
    return JSON.stringify([
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
  }

  statsHash(salt: string, value: string): string {
    return this.hmac(this.current.keys.stats, `${salt}|${value}`);
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
