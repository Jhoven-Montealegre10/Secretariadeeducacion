/**
 * Argon2id (biblioteca `argon2`, sal aleatoria única por hash; m=64 MiB, t=3, p=1, por encima del
 * mínimo de OWASP). Los hashes scrypt de la versión anterior se verifican y se reemplazan por
 * Argon2id en el siguiente inicio de sesión correcto.
 */
import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
const LEGACY_SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

@Injectable()
export class PasswordHasher {
  private dummyHash: string | null = null;

  hash(password: string): Promise<string> {
    return argon2.hash(String(password), OPTIONS);
  }

  async verify(password: string, stored: string | null | undefined): Promise<boolean> {
    const value = String(stored ?? '');
    try {
      if (value.startsWith('$argon2')) return await argon2.verify(value, String(password));
      if (value.startsWith('scrypt$')) return this.verifyLegacyScrypt(password, value);
    } catch {
      return false;
    }
    return false;
  }

  needsRehash(stored: string): boolean {
    return !stored.startsWith('$argon2id$') || argon2.needsRehash(stored, OPTIONS);
  }

  /** Gasta el mismo tiempo cuando el usuario no existe (evita la enumeración por tiempos). */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= await this.hash(crypto.randomBytes(16).toString('hex'));
    await this.verify(password, this.dummyHash);
    return false;
  }

  private verifyLegacyScrypt(password: string, stored: string): boolean {
    const [, salt, digest] = stored.split('$');
    if (!salt || !digest) return false;
    const expected = Buffer.from(digest, 'base64');
    const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, LEGACY_SCRYPT);
    return crypto.timingSafeEqual(expected, actual);
  }
}
