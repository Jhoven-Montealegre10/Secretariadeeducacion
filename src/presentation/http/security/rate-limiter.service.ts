/**
 * Límites de peticiones por IP (ventana fija). Frenan fuerza bruta, spam y abuso.
 *  - Límites generales (todas las rutas, API): en memoria por instancia (alto volumen).
 *  - Límites sensibles (login, MFA, recuperación, cargas, PQRSD): en PostgreSQL, compartidos
 *    entre instancias, con la IP reducida a un HMAC (no se guarda la IP).
 * El bloqueo por cuenta (5 intentos → 15 min) es independiente y también vive en la BD.
 */
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { TooManyRequestsError } from '../../../domain/errors';
import { APP_CONFIG, type AppConfig } from '../../../config/configuration';
import { Db } from '../../../infrastructure/database/db.service';
import { CryptoService } from '../../../infrastructure/security/crypto.service';
import type { RateBucket } from '../route-spec';

interface Limit {
  windowMs: number;
  limit: number;
  message: string;
  shared: boolean;
}

const MIN = 60_000;
export const LIMITS: Readonly<Record<RateBucket | 'general' | 'api', Limit>> = {
  general: { windowMs: 15 * MIN, limit: 900, message: 'Ha realizado demasiadas solicitudes. Intente de nuevo en unos minutos.', shared: false },
  api: { windowMs: 15 * MIN, limit: 600, message: 'Demasiadas solicitudes a la API. Intente de nuevo en unos minutos.', shared: false },
  login: { windowMs: 15 * MIN, limit: 10, message: 'Demasiados intentos de inicio de sesión. Espere 15 minutos.', shared: true },
  mfa: { windowMs: 15 * MIN, limit: 10, message: 'Demasiados intentos de verificación. Espere 15 minutos.', shared: true },
  recovery: { windowMs: 60 * MIN, limit: 5, message: 'Demasiadas solicitudes de recuperación. Intente en una hora.', shared: true },
  upload: { windowMs: 60 * MIN, limit: 60, message: 'Demasiadas cargas de archivos en la última hora.', shared: true },
  pqrsd: { windowMs: 60 * MIN, limit: 5, message: 'Ha enviado demasiadas solicitudes en la última hora. Intente más tarde.', shared: true },
  consulta: { windowMs: 15 * MIN, limit: 20, message: 'Demasiadas consultas. Intente de nuevo en unos minutos.', shared: true },
};

export interface RateResult {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger('RateLimiter');
  private readonly memory = new Map<string, { count: number; reset: number }>();
  private readonly sweeper: NodeJS.Timeout;
  private hitsSincePurge = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly crypto: CryptoService,
  ) {
    this.sweeper = setInterval(() => this.sweep(), MIN);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  private limitFor(bucket: keyof typeof LIMITS): number {
    // En pruebas se puede bajar el límite para verificar el bloqueo (TEST_RATE_LIMIT).
    return this.config.isTest ? Number(process.env.TEST_RATE_LIMIT ?? 10_000) : LIMITS[bucket].limit;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, v] of this.memory) if (v.reset <= now) this.memory.delete(key);
  }

  /** Registra un intento; lanza 429 si se supera el límite. */
  async hit(bucket: keyof typeof LIMITS, ip: string): Promise<RateResult> {
    const def = LIMITS[bucket];
    const limit = this.limitFor(bucket);
    const key = `${bucket}:${this.crypto.statsHash('rate-limit', ip || 'desconocida').slice(0, 24)}`;
    let count: number;
    let reset: number;
    if (def.shared) {
      try {
        const row = await this.db.one<{ conteo: number; segundos: number }>(
          `INSERT INTO limites_tasa (clave, conteo, reinicia_en) VALUES ($1, 1, now() + $2 * interval '1 millisecond')
           ON CONFLICT (clave) DO UPDATE SET
             conteo = CASE WHEN limites_tasa.reinicia_en <= now() THEN 1 ELSE limites_tasa.conteo + 1 END,
             reinicia_en = CASE WHEN limites_tasa.reinicia_en <= now() THEN EXCLUDED.reinicia_en ELSE limites_tasa.reinicia_en END
           RETURNING conteo, CEIL(EXTRACT(EPOCH FROM (reinicia_en - now())))::int AS segundos`,
          [key, def.windowMs],
        );
        count = row?.conteo ?? 1;
        reset = Date.now() + (row?.segundos ?? 0) * 1000;
        if (++this.hitsSincePurge >= 200) {
          this.hitsSincePurge = 0;
          void this.db.run('DELETE FROM limites_tasa WHERE reinicia_en < now()').catch(() => undefined);
        }
      } catch (err) {
        // Si la BD no responde, se aplica el límite en memoria (falla cerrada para no quedar sin protección).
        this.logger.warn(`Límite compartido no disponible (${(err as Error).message}); se usa el de memoria.`);
        ({ count, reset } = this.memoryHit(key, def.windowMs));
      }
    } else {
      ({ count, reset } = this.memoryHit(key, def.windowMs));
    }
    const result = { limit, remaining: Math.max(0, limit - count), resetSeconds: Math.max(0, Math.ceil((reset - Date.now()) / 1000)) };
    if (count > limit) throw Object.assign(new TooManyRequestsError(def.message), { rate: result });
    return result;
  }

  private memoryHit(key: string, windowMs: number): { count: number; reset: number } {
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.reset <= now) {
      const fresh = { count: 1, reset: now + windowMs };
      this.memory.set(key, fresh);
      return fresh;
    }
    entry.count++;
    return entry;
  }
}
