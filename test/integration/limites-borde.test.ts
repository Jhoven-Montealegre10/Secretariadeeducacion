/**
 * Límite de borde contra ráfagas y bots sobre la aplicación real:
 *  - el exceso recibe 429 en todo el sitio (estáticos, páginas y API) sin tocar la base de datos ni las sesiones;
 *  - con Redis el conteo y el bloqueo se comparten entre instancias, y las claves no contienen la IP;
 *  - si Redis no responde, el portal arranca y sigue limitando con el contador en memoria.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { createClient } from 'redis';
import { Db } from '../../src/infrastructure/database/db.service';
import { RATE_STORE_PREFIX } from '../../src/infrastructure/rate-limit/rate-store';
import { RateStoreService } from '../../src/infrastructure/rate-limit/rate-store.service';
import { MetricsService } from '../../src/presentation/http/observability/metrics.service';
import { createHarness, type Harness } from '../support/harness';

const REDIS = process.env.TEST_REDIS_URL;
// En CI la prueba con Redis es obligatoria: sin TEST_REDIS_URL falla en lugar de omitirse.
const skipRedis = !REDIS && !process.env.CI ? 'Defina TEST_REDIS_URL (Redis de PRUEBAS) para ejecutarla' : false;

describe('Límite de borde (memoria)', () => {
  let h: Harness;
  before(async () => {
    h = await createHarness({ TEST_EDGE_LIMIT: '15', RATE_LIMIT_BLOCK_SECONDS: '120' });
  });
  after(async () => h?.close());

  test('la petición 16 de una ráfaga recibe 429 y el cliente queda bloqueado en todo el sitio, salvo /health', async () => {
    const agent = h.agent();
    for (let i = 0; i < 15; i++) {
      const r = await agent.get('/robots.txt');
      assert.notEqual(r.status, 429, `petición ${i + 1}`);
    }
    const blocked = await agent.get('/robots.txt');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['retry-after'], '120');
    assert.equal(blocked.headers['cache-control'], 'no-store');
    assert.equal((await agent.get('/')).status, 429, 'páginas');
    const api = await agent.get('/api/v1/auth/csrf');
    assert.equal(api.status, 429, 'API');
    assert.equal(api.body.error.code, 'TOO_MANY_REQUESTS');
    assert.equal((await agent.get('/health/live')).status, 200, 'la sonda de salud no se limita');
    assert.ok(h.get(MetricsService).edge.rechazadas >= 3, 'se cuentan en las métricas');
  });

  test('el rechazo no consulta la base de datos ni la tienda de sesiones (aunque traiga una cookie de sesión)', async () => {
    const db = h.get(Db) as unknown as Record<string, (...a: unknown[]) => unknown>;
    let calls = 0;
    const originals = new Map<string, (...a: unknown[]) => unknown>();
    for (const m of ['exec', 'query', 'one', 'rows', 'row', 'scalar', 'run', 'transaction']) {
      if (typeof db[m] !== 'function') continue;
      originals.set(m, db[m]);
      const orig = db[m].bind(db);
      db[m] = (...args: unknown[]) => {
        calls++;
        return orig(...args);
      };
    }
    try {
      for (let i = 0; i < 20; i++) {
        const r = await h.agent().get('/noticias').set('Cookie', 'sem.sid=s%3Ainventada.firma');
        assert.equal(r.status, 429);
      }
      assert.equal(calls, 0, 'ninguna consulta durante el bloqueo');
    } finally {
      for (const [m, fn] of originals) db[m] = fn;
    }
  });
});

describe('Límite de borde compartido en Redis', { skip: skipRedis }, () => {
  // Dos instancias del portal con las mismas claves (como en producción) y el mismo Redis.
  const shared = {
    REDIS_URL: REDIS ?? '',
    TEST_EDGE_LIMIT: '10',
    RATE_LIMIT_BLOCK_SECONDS: '60',
    DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    SESSION_SECRETS: crypto.randomBytes(48).toString('base64url'),
  };
  let a: Harness;
  let b: Harness;
  let redis: ReturnType<typeof createClient>;

  before(async () => {
    assert.ok(REDIS, 'TEST_REDIS_URL es obligatorio en CI');
    redis = createClient({ url: REDIS });
    await redis.connect();
    const old = await redis.keys(`${RATE_STORE_PREFIX}*`);
    if (old.length) await redis.del(old);
    a = await createHarness(shared);
    b = await createHarness(shared);
  });
  after(async () => {
    await a?.close();
    await b?.close();
    if (redis?.isOpen) {
      const keys = await redis.keys(`${RATE_STORE_PREFIX}*`);
      if (keys.length) await redis.del(keys);
      await redis.close();
    }
  });

  test('las dos instancias usan Redis', () => {
    assert.equal(a.get(RateStoreService).kind, 'redis');
    assert.equal(a.get(RateStoreService).redisConnected, true);
    assert.equal(b.get(RateStoreService).redisConnected, true);
  });

  test('el conteo y el bloqueo se comparten: 6 peticiones en una instancia + 4 en la otra agotan el límite', async () => {
    for (let i = 0; i < 6; i++) assert.notEqual((await a.agent().get('/robots.txt')).status, 429);
    for (let i = 0; i < 4; i++) assert.notEqual((await b.agent().get('/robots.txt')).status, 429);
    const r = await b.agent().get('/robots.txt');
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers['retry-after']) > 50);
    assert.equal((await a.agent().get('/')).status, 429, 'la otra instancia también lo bloquea');
  });

  test('las claves en Redis no contienen la IP y vencen solas', async () => {
    const keys = await redis.keys(`${RATE_STORE_PREFIX}*`);
    assert.ok(keys.length > 0);
    assert.ok(keys.every((k) => !k.includes('127.0.0.1') && !k.includes('::')));
    for (const k of keys) assert.ok((await redis.pTTL(k)) > 0, `la clave ${k} tiene vencimiento`);
  });
});

describe('Redis no disponible', () => {
  let h: Harness;
  before(async () => {
    // Puerto cerrado: el portal debe arrancar igual y limitar con el contador en memoria.
    h = await createHarness({ REDIS_URL: 'redis://127.0.0.1:1', TEST_EDGE_LIMIT: '5' });
  });
  after(async () => h?.close());

  test('el portal arranca y el límite sigue funcionando en memoria', async () => {
    assert.equal(h.get(RateStoreService).redisConnected, false);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await h.agent().get('/robots.txt')).status);
    assert.deepEqual(
      statuses.map((s) => s === 429),
      [false, false, false, false, false, true],
    );
  });
});
