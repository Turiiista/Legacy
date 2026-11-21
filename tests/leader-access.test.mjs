import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../functions/_lib/auth.js';
import { onRequestDelete } from '../functions/api/operations.js';
import { onRequestPost as onResetOperations } from '../functions/api/operations/reset.js';

const env = {
  DISCORD_CLIENT_ID: 'test-client',
  DISCORD_CLIENT_SECRET: 'test-secret',
  DISCORD_GUILD_ID: 'test-guild',
  DISCORD_ALLOWED_ROLE_IDS: 'member-role,manager-role,leader-role',
  SESSION_SECRET: 'a-test-session-secret-that-is-long-enough-32',
  DB: null
};

class TestD1 {
  rows = [{ id: 'op-1' }, { id: 'op-2' }];
  products = [{ id: 'capuz', nome: 'Capuz', preco_sem_parceria_centavos: 1500000 }];
  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          async run() {
            if (sql === 'DELETE FROM operacoes') {
              const deleted = db.rows.length;
              db.rows = [];
              return { success: true, meta: { changes: deleted } };
            }
            if (sql.startsWith('DELETE FROM operacoes WHERE id = ?')) {
              const previous = db.rows.length;
              db.rows = db.rows.filter(row => row.id !== values[0]);
              return { success: true, meta: { changes: previous - db.rows.length } };
            }
            throw new Error(`SQL inesperado no teste: ${sql}`);
          }
        };
      }
    };
  }
}

async function request(path, method, body, session) {
  const headers = { Origin: 'https://legacy.test', Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Cookie = `legacy_session=${session}`;
  return new Request(`https://legacy.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function sessionFor(role) {
  return createSession({ id: `discord-${role}`, username: role, role }, env);
}

test('somente líder pode excluir uma operação individual', async () => {
  const DB = new TestD1();
  env.DB = DB;
  for (const role of ['membro', 'gerente']) {
    const response = await onRequestDelete({
      request: await request('/api/operations?id=op-1', 'DELETE', undefined, await sessionFor(role)), env
    });
    assert.equal(response.status, 403);
  }
  assert.equal(DB.rows.length, 2);
  const response = await onRequestDelete({
    request: await request('/api/operations?id=op-1', 'DELETE', undefined, await sessionFor('lider')), env
  });
  assert.equal(response.status, 200);
  assert.deepEqual(DB.rows, [{ id: 'op-2' }]);
});

test('somente líder pode resetar operações e o catálogo permanece intacto', async () => {
  const DB = new TestD1();
  env.DB = DB;
  const catalogBefore = structuredClone(DB.products);
  for (const role of ['membro', 'gerente']) {
    const response = await onResetOperations({
      request: await request('/api/operations/reset', 'POST', { confirmation: 'RESETAR' }, await sessionFor(role)), env
    });
    assert.equal(response.status, 403);
  }
  assert.equal(DB.rows.length, 2);

  const leaderSession = await sessionFor('lider');
  const wrongConfirmation = await onResetOperations({
    request: await request('/api/operations/reset', 'POST', { confirmation: 'apagar' }, leaderSession), env
  });
  assert.equal(wrongConfirmation.status, 400);
  assert.equal(DB.rows.length, 2);

  const response = await onResetOperations({
    request: await request('/api/operations/reset', 'POST', { confirmation: 'RESETAR' }, leaderSession), env
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.deleted, 2);
  assert.deepEqual(DB.rows, []);
  assert.deepEqual(DB.products, catalogBefore);
});
