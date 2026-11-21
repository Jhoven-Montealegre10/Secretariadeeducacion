/**
 * Contadores de límites de peticiones (ventana fija con bloqueo temporal).
 *  - MemoryRateStore: por instancia, con un máximo de claves para que una avalancha de IP distintas no agote la memoria.
 *  - RedisRateStore: compartido entre instancias; una sola ida y vuelta por petición (script Lua atómico).
 *    Si Redis no responde se usa el contador en memoria: la protección nunca se apaga.
 * Las claves nunca contienen la IP en claro (las crea quien llama, con un HMAC).
 */
import { Logger } from '@nestjs/common';
import { createClient } from 'redis';

export interface RatePolicy {
  windowMs: number;
  limit: number;
  /** Al superar el límite, el cliente queda bloqueado este tiempo (0 = solo hasta que termine la ventana). */
  blockMs: number;
}

export interface RateDecision {
  allowed: boolean;
  count: number;
  /** Milisegundos hasta que se reinicia la ventana o termina el bloqueo. */
  resetMs: number;
}

export interface RateStore {
  readonly kind: 'memoria' | 'redis';
  consume(key: string, policy: RatePolicy): Promise<RateDecision>;
  close(): Promise<void>;
}

interface Entry {
  count: number;
  reset: number;
  blockedUntil: number;
}

export class MemoryRateStore implements RateStore {
  readonly kind = 'memoria' as const;
  private readonly entries = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly maxKeys = 100_000) {
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref();
  }

  get size(): number {
    return this.entries.size;
  }

  consumeSync(key: string, policy: RatePolicy, now = Date.now()): RateDecision {
    let e = this.entries.get(key);
    if (e && e.blockedUntil > now) return { allowed: false, count: e.count, resetMs: e.blockedUntil - now };
    if (!e || e.reset <= now) {
      if (!e) this.makeRoom(now);
      e = { count: 0, reset: now + policy.windowMs, blockedUntil: 0 };
      this.entries.set(key, e);
    }
    e.count++;
    if (e.count > policy.limit) {
      if (policy.blockMs > 0) e.blockedUntil = now + policy.blockMs;
      return { allowed: false, count: e.count, resetMs: Math.max(e.reset, e.blockedUntil) - now };
    }
    return { allowed: true, count: e.count, resetMs: e.reset - now };
  }

  consume(key: string, policy: RatePolicy): Promise<RateDecision> {
    return Promise.resolve(this.consumeSync(key, policy));
  }

  private makeRoom(now: number): void {
    if (this.entries.size < this.maxKeys) return;
    this.sweep(now);
    // Sigue lleno: se descarta la clave más antigua (los Map conservan el orden de inserción).
    while (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private sweep(now = Date.now()): void {
    for (const [key, e] of this.entries) if (e.reset <= now && e.blockedUntil <= now) this.entries.delete(key);
  }

  close(): Promise<void> {
    clearInterval(this.sweeper);
    this.entries.clear();
    return Promise.resolve();
  }
}

/** KEYS[1]=contador, KEYS[2]=bloqueo; ARGV: ventana ms, límite, bloqueo ms. Devuelve {permitido(1/0), conteo, ms restantes}. */
const CONSUME_LUA = `
local b = redis.call('PTTL', KEYS[2])
if b > 0 then return {0, -1, b} end
local c = redis.call('INCR', KEYS[1])
local t = redis.call('PTTL', KEYS[1])
if t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); t = tonumber(ARGV[1]) end
if c > tonumber(ARGV[2]) then
  if tonumber(ARGV[3]) > 0 then
    redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
    return {0, c, tonumber(ARGV[3])}
  end
  return {0, c, t}
end
return {1, c, t}`;

export class RedisRateStore implements RateStore {
  readonly kind = 'redis' as const;
  private readonly logger = new Logger('LímitesRedis');
  private readonly client: ReturnType<typeof createClient>;
  private readonly fallback: MemoryRateStore;
  private lastWarning = 0;

  constructor(
    url: string,
    private readonly prefix: string,
    maxMemoryKeys = 100_000,
    commandTimeoutMs = 250,
  ) {
    this.fallback = new MemoryRateStore(maxMemoryKeys);
    this.client = createClient({
      url,
      // Sin cola fuera de línea: si Redis se cae, los comandos fallan de inmediato y se usa la memoria.
      disableOfflineQueue: true,
      commandOptions: { timeout: commandTimeoutMs },
      socket: { connectTimeout: 2000, reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
    });
    this.client.on('error', (err: Error) => this.warn(`Redis no disponible (${err.message}); se usa el límite en memoria.`));
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  get connected(): boolean {
    return this.client.isReady;
  }

  async consume(key: string, policy: RatePolicy): Promise<RateDecision> {
    if (!this.client.isReady) return this.fallback.consume(key, policy);
    try {
      const r = (await this.client.eval(CONSUME_LUA, {
        keys: [`${this.prefix}c:${key}`, `${this.prefix}b:${key}`],
        arguments: [String(policy.windowMs), String(policy.limit), String(policy.blockMs)],
      })) as [number, number, number];
      return { allowed: r[0] === 1, count: r[1], resetMs: Math.max(0, r[2]) };
    } catch (err) {
      this.warn(`Error de Redis (${(err as Error).message}); se usa el límite en memoria.`);
      return this.fallback.consume(key, policy);
    }
  }

  private warn(message: string): void {
    const now = Date.now();
    if (now - this.lastWarning < 60_000) return;
    this.lastWarning = now;
    this.logger.warn(message);
  }

  async close(): Promise<void> {
    await this.fallback.close();
    if (this.client.isOpen) await this.client.close();
  }
}

/** Identificador del cliente: IPv4 completa; IPv6 por su prefijo /64 (un atacante controla todo el /64). */
export function clientId(ip: string | undefined): string {
  if (!ip) return 'desconocida';
  const mapped = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!mapped.includes(':')) return mapped;
  const [head, tail = ''] = mapped.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = mapped.includes('::') ? [...h, ...new Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${groups
    .slice(0, 4)
    .map((g) => (g || '0').replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export const RATE_STORE_PREFIX = 'sem:rl:';
