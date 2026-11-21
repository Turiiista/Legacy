import { authConfigured, readSession } from './_lib/auth.js';

const PUBLIC_AUTH_PATHS = new Set([
  '/api/session',
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout'
]);

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (PUBLIC_AUTH_PATHS.has(url.pathname)) return next();

  if (!authConfigured(env)) {
    return new Response('Portal LEGACY indisponível: o acesso Discord ainda não foi configurado.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  const user = await readSession(request, env);
  if (!user) return Response.redirect(new URL('/api/auth/login', url.origin).toString(), 302);
  return next();
}
