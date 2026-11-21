/** Límite de borde contra ráfagas y bots: contadores, bloqueo temporal, agrupación de IPv6 y respuesta 429. */
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { clientId, MemoryRateStore, type RateDecision, type RatePolicy, type RateStore } from '../../src/infrastructure/rate-limit/rate-store';
import { edgeLimiter } from '../../src/presentation/http/security/edge-limiter';
import { loadConfig, type AppConfig } from '../../src/config/configuration';
import type { CryptoService } from '../../src/infrastructure/security/crypto.service';

const policy: RatePolicy = { windowMs: 10_000, limit: 3, blockMs: 60_000 };

describe('Contador en memoria', () => {
  const store = new MemoryRateStore(1000);
  after(() => store.close());

  test('permite hasta el límite y bloquea al superarlo, aunque la ventana termine', () => {
    const t0 = 1_000_000;
    const r = [1, 2, 3, 4].map(() => store.consumeSync('a', policy, t0));
    assert.deepEqual(
      r.map((d) => d.allowed),
      [true, true, true, false],
    );
    assert.equal(r[3].resetMs, 60_000, 'informa el fin del bloqueo');
    assert.equal(store.consumeSync('a', policy, t0 + 15_000).allowed, false, 'sigue bloqueado después de la ventana');
    assert.equal(store.consumeSync('a', policy, t0 + 60_001).allowed, true, 'al terminar el bloqueo vuelve a empezar');
  });

  test('sin bloqueo (blockMs 0) se libera al terminar la ventana', () => {
    const p = { ...policy, blockMs: 0 };
    const t0 = 2_000_000;
    for (let i = 0; i < 3; i++) store.consumeSync('b', p, t0);
    assert.equal(store.consumeSync('b', p, t0).allowed, false);
    assert.equal(store.consumeSync('b', p, t0 + 10_001).allowed, true);
  });

  test('cada cliente tiene su propio contador', () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 4; i++) store.consumeSync('c1', policy, t0);
    assert.equal(store.consumeSync('c2', policy, t0).allowed, true);
  });

  test('una avalancha de IP distintas no supera el máximo de claves en memoria', () => {
    const small = new MemoryRateStore(100);
    for (let i = 0; i < 5000; i++) small.consumeSync(`ip-${i}`, policy);
    assert.ok(small.size <= 100, `claves: ${small.size}`);
    void small.close();
  });
});

describe('Identificador del cliente', () => {
  test('IPv4 completa; IPv4 dentro de IPv6 se trata como IPv4', () => {
    assert.equal(clientId('203.0.113.7'), '203.0.113.7');
    assert.equal(clientId('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(clientId(undefined), 'desconocida');
  });

  test('IPv6 se agrupa por /64: rotar la parte final no evade el límite', () => {
    const a = clientId('2001:db8:abcd:12::1');
    assert.equal(a, '2001:db8:abcd:12::/64');
    assert.equal(clientId('2001:0db8:abcd:0012:ffff:eeee:dddd:cccc'), a);
    assert.notEqual(clientId('2001:db8:abcd:13::1'), a);
    assert.equal(clientId('::1'), '0:0:0:0::/64');
  });
});

describe('Middleware de borde', () => {
  const config = { rateLimit: { windowMs: 10_000, burst: 2, blockMs: 60_000 } } as AppConfig;
  const crypto = { statsHash: (_s: string, v: string) => `h-${v}`.padEnd(30, '0') } as unknown as CryptoService;

  function run(mw: ReturnType<typeof edgeLimiter>, path: string, ip = '198.51.100.1') {
    return new Promise<{ next: boolean; status?: number; headers: Record<string, string>; body?: unknown; type?: string }>((resolve) => {
      const headers: Record<string, string> = {};
      const out: { status?: number; type?: string } = {};
      const res = {
        setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
        status(code: number) {
          out.status = code;
          return this;
        },
        type(t: string) {
          out.type = t;
          return this;
        },
        json: (body: unknown) => resolve({ next: false, headers, body, ...out }),
        send: (body: unknown) => resolve({ next: false, headers, body, ...out }),
      } as unknown as Response;
      mw({ path, ip } as Request, res, (() => resolve({ next: true, headers })) as NextFunction);
    });
  }

  test('al superar la ráfaga responde 429 con Retry-After, sin caché, y sigue bloqueado en todo el sitio', async () => {
    const store = new MemoryRateStore();
    const stats = { rechazadas: 0 };
    const mw = edgeLimiter(config, store, crypto, stats);
    assert.equal((await run(mw, '/')).next, true);
    assert.equal((await run(mw, '/assets/css/estilos.css')).next, true);
    const html = await run(mw, '/noticias');
    assert.equal(html.status, 429);
    assert.equal(html.headers['retry-after'], '60');
    assert.equal(html.headers['cache-control'], 'no-store');
    assert.match(String(html.type), /text\/plain/);
    const api = await run(mw, '/api/v1/public/noticias');
    assert.equal(api.status, 429);
    assert.deepEqual((api.body as { error: { code: string } }).error.code, 'TOO_MANY_REQUESTS');
    assert.equal(stats.rechazadas, 2);
    assert.equal((await run(mw, '/', '198.51.100.2')).next, true, 'otro cliente no se ve afectado');
    await store.close();
  });

  test('las sondas de salud no se limitan', async () => {
    const store = new MemoryRateStore();
    const mw = edgeLimiter(config, store, crypto);
    for (let i = 0; i < 10; i++) assert.equal((await run(mw, '/health/live')).next, true);
    await store.close();
  });

  test('si el almacén falla, el error pasa al manejador (no se deja pasar en silencio)', async () => {
    const broken: RateStore = { kind: 'memoria', consume: (): Promise<RateDecision> => Promise.reject(new Error('x')), close: () => Promise.resolve() };
    const mw = edgeLimiter(config, broken, crypto);
    const err = await new Promise<unknown>((resolve) => mw({ path: '/', ip: '1.1.1.1' } as Request, {} as Response, resolve as NextFunction));
    assert.ok(err instanceof Error);
  });
});

describe('Configuración de Redis en producción', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-redis-cfg-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, value: string) => fs.writeFileSync(path.join(dir, name), `${value}\n`, { mode: 0o600 });
  write('SESSION_SECRETS', nodeCrypto.randomBytes(48).toString('base64url'));
  write('DATA_ENCRYPTION_KEYS', `k202611210000:${nodeCrypto.randomBytes(32).toString('base64')}`);
  write('DB_PASSWORD', 'x'.repeat(24));
  const prod = (redisUrl: string) => {
    write('REDIS_URL', redisUrl);
    return () => loadConfig({ NODE_ENV: 'production', APP_URL: 'https://portal.example.gov.co', DB_HOST: '127.0.0.1', SECRETS_DIR: dir });
  };

  test('Redis en otro servidor exige TLS (rediss://); en el mismo servidor se acepta redis://', () => {
    assert.throws(prod('redis://semibague:clave@redis.interna:6379'), /rediss/);
    assert.equal(prod('rediss://semibague:clave@redis.interna:6380')().rateLimit.redisUrl, 'rediss://semibague:clave@redis.interna:6380');
    assert.ok(prod('redis://semibague:clave@127.0.0.1:6379')().rateLimit.redisUrl);
    assert.throws(prod('esto no es una url'), /URL válida/);
  });

  test('REDIS_URL como variable de entorno se rechaza en producción (es un secreto)', () => {
    fs.rmSync(path.join(dir, 'REDIS_URL'), { force: true });
    assert.throws(
      () =>
        loadConfig({ NODE_ENV: 'production', APP_URL: 'https://portal.example.gov.co', DB_HOST: '127.0.0.1', SECRETS_DIR: dir, REDIS_URL: 'rediss://x:y@h:1' }),
      /REDIS_URL/,
    );
  });

  test('los límites por defecto fuera de pruebas: 200 peticiones cada 10 s y bloqueo de 5 minutos', () => {
    const c = loadConfig({ NODE_ENV: 'development', DB_HOST: '127.0.0.1' });
    assert.deepEqual([c.rateLimit.burst, c.rateLimit.windowMs, c.rateLimit.blockMs], [200, 10_000, 300_000]);
  });
});
