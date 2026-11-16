/** Límites de peticiones: con un límite bajo de prueba, el exceso recibe 429 con Retry-After. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createHarness, type Harness } from '../support/harness';

let h: Harness;
before(async () => {
  process.env.TEST_RATE_LIMIT = '5';
  h = await createHarness();
});
after(async () => {
  delete process.env.TEST_RATE_LIMIT;
  await h?.close();
});

describe('Límites de peticiones', () => {
  test('el sexto intento de login desde la misma IP recibe 429 (contador compartido en PostgreSQL)', async () => {
    const agent = h.agent();
    const token = await h.csrf(agent);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: 'nadie@example.gov.co', password: 'lo que sea 123' });
      statuses.push(r.status);
      if (r.status === 429) {
        assert.ok(Number(r.headers['retry-after']) > 0, 'indica cuándo reintentar');
        assert.equal(r.body.error.code, 'TOO_MANY_REQUESTS');
      }
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    const keys = await h.db.query<{ clave: string }>('SELECT clave FROM limites_tasa');
    assert.ok(keys.length > 0);
    assert.ok(
      keys.every((k) => !k.clave.includes('127.0.0.1') && !k.clave.includes('::')),
      'la IP no se guarda en claro',
    );
  });
});
