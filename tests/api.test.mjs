import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequestGet } from '../functions/api/operations.js';
import { createSession } from '../functions/_lib/auth.js';
import { onRequestGet as onProductsGet, onRequestPost as onProductsPost } from '../functions/api/products.js';

const env = {
  DISCORD_CLIENT_ID: 'test-client', DISCORD_CLIENT_SECRET: 'test-secret', DISCORD_GUILD_ID: 'guild',
  DISCORD_ALLOWED_ROLE_IDS: 'member-role,manager-role,leader-role', SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
  DISCORD_WASH_WEBHOOK_1: 'https://discord.com/api/webhooks/111/first-token',
  DISCORD_WASH_WEBHOOK_2: 'https://discord.com/api/webhooks/222/second-token',
  DISCORD_SALES_WEBHOOK: 'https://discord.com/api/webhooks/333/sales-token'
};

class MemoryD1 {
  rows = [];
  products = [
    {id:'capuz',nome:'Capuz',preco_sem_parceria_centavos:1500000,preco_com_parceria_centavos:1200000,ativo:1},
    {id:'algema',nome:'Algema',preco_sem_parceria_centavos:1500000,preco_com_parceria_centavos:1200000,ativo:1}
  ];
  prepare(sql) {
    const db = this;
    return { async first() { return { total: db.rows.length }; }, async all() { if (sql.includes('FROM produtos')) return {results:db.products}; return {results:db.rows}; }, bind(...values) {
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
          if (sql.startsWith('INSERT INTO produtos')) {
            const [id,nome,preco_sem_parceria_centavos,preco_com_parceria_centavos,ativo,atualizado_em] = values;
            db.products.push({id,nome,preco_sem_parceria_centavos,preco_com_parceria_centavos,ativo,atualizado_em});
            return {success:true,meta:{changes:1}};
          }
          throw new Error(`SQL de teste desconhecido: ${sql}`);
        },
        async all() {
          if (sql.includes('FROM produtos')) return {results:db.products};
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

test('POST grava carrinho com preços de parceria do catálogo e envia somente ao webhook de vendas', async () => {
  const DB = new MemoryD1(); env.DB = DB;
  const session = await createSession({ id: 'discord-user-2', username: 'Gerente Teste', role: 'gerente' }, env);
  const calls = []; const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(null, { status: 204 }); };
  try {
    const request = await makeRequest('/api/operations', 'POST', { type: 'sale', responsible: 'Vendedor', partnership: true, items: [{productId:'capuz',quantity:10},{productId:'algema',quantity:10}] }, `legacy_session=${session}`);
    const response = await onRequestPost({ request, env }); const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(result.operation.grossCents, 24000000);
    assert.equal(result.operation.sellerCents, 12000000);
    assert.equal(result.operation.legacyCents, 12000000);
    assert.deepEqual(result.operation.items.map(item=>item.unitCents),[1200000,1200000]);
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


test('GET retorna o catálogo de preços compartilhado', async () => {
  const DB = new MemoryD1(); env.DB = DB;
  const session = await createSession({id:'catalog-reader',username:'Membro',role:'membro'},env);
  const response = await onProductsGet({request:await makeRequest('/api/products','GET',undefined,`legacy_session=${session}`),env});
  const result = await response.json();
  assert.equal(response.status,200);
  assert.equal(result.products.length,2);
  assert.equal(result.products[0].partnershipPriceCents,1200000);
});

test('catálogo compartilhado: somente gerente/líder pode cadastrar item', async () => {
  const DB = new MemoryD1(); env.DB = DB;
  const memberSession = await createSession({id:'catalog-member',username:'Membro',role:'membro'},env);
  const denied = await onProductsPost({request:await makeRequest('/api/products','POST',{name:'Item',standardPriceCents:100,partnershipPriceCents:80},`legacy_session=${memberSession}`),env});
  assert.equal(denied.status,403);
  const managerSession = await createSession({id:'catalog-manager',username:'Gerente',role:'gerente'},env);
  const allowed = await onProductsPost({request:await makeRequest('/api/products','POST',{name:'Novo item',standardPriceCents:10000,partnershipPriceCents:8000},`legacy_session=${managerSession}`),env});
  assert.equal(allowed.status,201);
  assert.equal(DB.products.length,3);
});
