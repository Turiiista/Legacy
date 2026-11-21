import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequestGet } from '../functions/api/operations.js';
import { createSession } from '../functions/_lib/auth.js';

const env = {
  DISCORD_CLIENT_ID: 'test-client', DISCORD_CLIENT_SECRET: 'test-secret', DISCORD_GUILD_ID: 'guild',
  DISCORD_ALLOWED_ROLE_IDS: 'member-role,manager-role,leader-role', SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
  DISCORD_WASH_WEBHOOK_1: 'https://discord.com/api/webhooks/111/first-token',
  DISCORD_WASH_WEBHOOK_2: 'https://discord.com/api/webhooks/222/second-token',
  DISCORD_SALES_WEBHOOK: 'https://discord.com/api/webhooks/333/sales-token'
};

class MemoryD1 {
  rows = [];
  prepare(sql) {
    const db = this;
    return { async first() { return { total: db.rows.length }; }, bind(...values) {
      return {
        async run() {
          if (sql.startsWith('INSERT INTO operacoes')) {
            const [id, criado_em, tipo, discord_id, discord_nome, responsavel, valor_bruto_centavos, detalhes_json, observacao] = values;
            db.rows.push({ id, criado_em, tipo, discord_id, discord_nome, responsavel, valor_bruto_centavos, detalhes_json, observacao });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.startsWith('DELETE FROM operacoes')) {
            const before = db.rows.length; db.rows = db.rows.filter(row => row.id !== values[0]);
            return { success: true, meta: { changes: before - db.rows.length } };
          }
          throw new Error(`SQL de teste desconhecido: ${sql}`);
        },
        async all() {
          const [limit, offset] = values;
          return { results: [...db.rows].sort((a,b)=>b.criado_em.localeCompare(a.criado_em)).slice(offset, offset + limit) };
        },
        async first() { return { total: db.rows.length }; }
      };
    } };
  }
}

async function makeRequest(path, method, body, cookie) {
  const headers = { Origin: 'https://legacy.test', Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://legacy.test${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

test('POST grava a lavagem recalculada no D1 e envia os dois webhooks', async () => {
  const DB = new MemoryD1(); env.DB = DB;
  const session = await createSession({ id: 'discord-user-1', username: 'Membro Teste', role: 'membro' }, env);
  const calls = []; const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), payload: JSON.parse(init.body) }); return new Response(null, { status: 204 }); };
  try {
    const request = await makeRequest('/api/operations', 'POST', { type: 'wash', responsible: 'Pessoa da lavagem', grossCents: 100000, category: 'member', farmPaid: true, partnership: false, netCents: 1, legacyCents: 99999 }, `legacy_session=${session}`);
    const response = await onRequestPost({ request, env }); const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(DB.rows.length, 1);
    assert.equal(result.operation.netCents, 90000, 'a divisão é calculada no servidor; valores falsificados do cliente são ignorados');
    assert.equal(result.operation.creatorName, 'Membro Teste');
    assert.equal(result.webhooks.length, 2);
    assert.equal(calls.length, 2);
    assert.match(calls[0].payload.embeds[0].title, /Lavagem registrada/);
  } finally { globalThis.fetch = originalFetch; }
});

test('POST grava venda e envia somente ao webhook de vendas', async () => {
  const DB = new MemoryD1(); env.DB = DB;
  const session = await createSession({ id: 'discord-user-2', username: 'Gerente Teste', role: 'gerente' }, env);
  const calls = []; const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(null, { status: 204 }); };
  try {
    const request = await makeRequest('/api/operations', 'POST', { type: 'sale', responsible: 'Vendedor', product: 'Capuz', quantity: 1, unitCents: 101 }, `legacy_session=${session}`);
    const response = await onRequestPost({ request, env }); const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.operation.sellerCents, 50);
    assert.equal(result.operation.legacyCents, 51);
    assert.deepEqual(calls, [env.DISCORD_SALES_WEBHOOK]);
  } finally { globalThis.fetch = originalFetch; }
});

test('GET retorna o histórico compartilhado e exige sessão', async () => {
  const DB = new MemoryD1(); env.DB = DB;
  const session = await createSession({ id: 'discord-user-3', username: 'Membro', role: 'membro' }, env);
  const valid = await onRequestGet({ request: await makeRequest('/api/operations', 'GET', undefined, `legacy_session=${session}`), env });
  assert.equal(valid.status, 200);
  const payload = await valid.json();
  assert.equal(payload.total, 0, JSON.stringify(payload));
  const invalid = await onRequestGet({ request: await makeRequest('/api/operations', 'GET'), env });
  assert.equal(invalid.status, 401);
});
