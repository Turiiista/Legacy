import { authConfigured, readSession, json, isSameOrigin } from '../_lib/auth.js';
import { buildOperation, rowToOperation, sendOperationWebhooks } from '../_lib/operations.js';

const SELECT_COLUMNS = 'id, criado_em, tipo, discord_id, discord_nome, responsavel, valor_bruto_centavos, detalhes_json, observacao';
const validUser = user => !!user?.id;
function requireDb(env) { return env.DB && typeof env.DB.prepare === 'function'; }

export async function onRequestGet({ request, env }) {
  if (!authConfigured(env)) return json({ error: 'A autenticação Discord não está configurada.' }, 503);
  const user = await readSession(request, env);
  if (!validUser(user)) return json({ error: 'Sessão inválida ou expirada. Entre novamente pelo Discord.' }, 401);
  if (!requireDb(env)) return json({ error: 'O banco compartilhado não está vinculado. Configure o binding D1 chamado DB no Cloudflare Pages.' }, 503);
  try {
    const url = new URL(request.url);
    const offset = Math.max(0, Math.min(10000000, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0));
    const limit = Math.max(1, Math.min(500, Number.parseInt(url.searchParams.get('limit') || '500', 10) || 500));
    const [records, count] = await Promise.all([
      env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM operacoes ORDER BY criado_em DESC LIMIT ? OFFSET ?`).bind(limit, offset).all(),
      env.DB.prepare('SELECT COUNT(*) AS total FROM operacoes').first()
    ]);
    return json({ operations: (records.results || []).map(rowToOperation).filter(Boolean), total: Number(count?.total || 0), offset, limit });
  } catch (error) {
    return json({ error: `Não foi possível ler o histórico compartilhado: ${String(error?.message || error).slice(0, 220)}` }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'Origem inválida.' }, 403);
  if (!authConfigured(env)) return json({ error: 'A autenticação Discord não está configurada.' }, 503);
  const user = await readSession(request, env);
  if (!validUser(user)) return json({ error: 'Sessão inválida ou expirada. Entre novamente pelo Discord.' }, 401);
  if (!requireDb(env)) return json({ error: 'O banco D1 não está vinculado como DB no Cloudflare Pages.' }, 503);
  try {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 16000) return json({ error: 'Os dados enviados excedem o limite permitido.' }, 413);
    const input = await request.json();
    const operation = buildOperation(user, input);
    const result = await env.DB.prepare(`INSERT INTO operacoes
      (id, criado_em, tipo, discord_id, discord_nome, responsavel, valor_bruto_centavos, detalhes_json, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(operation.id, operation.createdAt, operation.type, user.id, operation.creatorName,
        operation.responsible, operation.grossCents, JSON.stringify(operation), operation.notes)
      .run();
    if (result?.success === false) throw new Error('O banco não confirmou o registro.');
    const webhooks = await sendOperationWebhooks(operation, env);
    return json({ ok: true, operation, webhooks }, 201);
  } catch (error) {
    const message = String(error?.message || 'Não foi possível registrar a operação.').slice(0, 240);
    const status = /inválid|informe|produto|categoria|valor|quantidade|parceria|farm/i.test(message) ? 400 : 500;
    return json({ error: message }, status);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'Origem inválida.' }, 403);
  if (!authConfigured(env)) return json({ error: 'A autenticação Discord não está configurada.' }, 503);
  const user = await readSession(request, env);
  if (!validUser(user)) return json({ error: 'Sessão inválida ou expirada. Entre novamente pelo Discord.' }, 401);
  if (!['gerente', 'lider'].includes(user.role)) return json({ error: 'Somente gerente ou líder pode excluir operações.' }, 403);
  if (!requireDb(env)) return json({ error: 'O banco D1 não está vinculado como DB no Cloudflare Pages.' }, 503);
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 80) return json({ error: 'Identificador inválido.' }, 400);
  try {
    const result = await env.DB.prepare('DELETE FROM operacoes WHERE id = ?').bind(id).run();
    if (!result?.meta?.changes) return json({ error: 'A operação não foi encontrada.' }, 404);
    return json({ ok: true });
  } catch (error) {
    return json({ error: `Não foi possível excluir a operação: ${String(error?.message || error).slice(0, 200)}` }, 500);
  }
}
