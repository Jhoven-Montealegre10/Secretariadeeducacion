import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createHarness, type Harness } from '../support/harness';

let h: Harness;
before(async () => {
  h = await createHarness();
});
after(async () => h?.close());

describe('arranque', () => {
  test('la aplicación responde y usa la cuenta limitada', async () => {
    const res = await h.agent().get('/health/ready');
    assert.equal(res.status, 200);
    assert.equal(await h.db.scalar<string>('SELECT current_user'), 'semibague_app');
  });
  test('login completo de administrador', async () => {
    const admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
    const agent = await h.login(admin);
    const res = await h.call(agent, 'get', '/api/v1/usuarios');
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});
