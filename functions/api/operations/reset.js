import { authConfigured, readSession, json, isSameOrigin } from '../../_lib/auth.js';

function requireDb(env) { return env.DB && typeof env.DB.prepare === 'function'; }

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'Origem inválida.' }, 403);
  if (!authConfigured(env)) return json({ error: 'A autenticação Discord não está configurada.' }, 503);
  const user = await readSession(request, env);
  if (!user?.id) return json({ error: 'Sessão inválida ou expirada. Entre novamente pelo Discord.' }, 401);
  if (user.role !== 'lider') return json({ error: 'Somente um líder LEGACY pode resetar o painel.' }, 403);
  if (!requireDb(env)) return json({ error: 'O banco D1 não está vinculado como DB no Cloudflare Pages.' }, 503);

  try {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 1000) return json({ error: 'A confirmação excede o limite permitido.' }, 413);
    const input = await request.json();
    if (input?.confirmation !== 'RESETAR') return json({ error: 'Confirmação inválida. Nenhuma operação foi apagada.' }, 400);
    const result = await env.DB.prepare('DELETE FROM operacoes').run();
    if (result?.success === false) throw new Error('O banco não confirmou a limpeza.');
    return json({ ok: true, deleted: Number(result?.meta?.changes || 0) });
  } catch (error) {
    return json({ error: `Não foi possível limpar as operações: ${String(error?.message || error).slice(0, 200)}` }, 500);
  }
}
