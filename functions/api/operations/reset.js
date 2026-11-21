import { authConfigured, readSession, json, isSameOrigin } from '../../_lib/auth.js';

function requireDb(env) {
  return env.DB && typeof env.DB.prepare === 'function';
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'Origem inválida.' }, 403);
  if (!authConfigured(env)) return json({ error: 'A autenticação Discord não está configurada.' }, 503);

  const user = await readSession(request, env);
  if (!user?.id) return json({ error: 'Sessão inválida ou expirada. Entre novamente pelo Discord.' }, 401);
  if (user.role !== 'lider') return json({ error: 'Somente líder pode limpar as operações.' }, 403);
  if (!requireDb(env)) return json({ error: 'O banco D1 não está vinculado como DB no Cloudflare Pages.' }, 503);

  try {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 512) return json({ error: 'Confirmação inválida.' }, 413);
    const body = await request.json();
    if (body?.confirmation !== 'RESETAR') return json({ error: 'Digite RESETAR para confirmar a limpeza.' }, 400);

    const result = await env.DB.prepare('DELETE FROM operacoes').bind().run();
    if (result?.success === false) throw new Error('O banco não confirmou a limpeza.');
    return json({ ok: true, deleted: Number(result?.meta?.changes || 0), preserved: 'produtos e preços' });
  } catch (error) {
    return json({ error: `Não foi possível limpar as operações: ${String(error?.message || error).slice(0, 200)}` }, 500);
  }
}
