import { authConfigured, allowedRoleIds, discordRedirectUri, htmlRedirect, cookie, createSession } from '../../_lib/auth.js';
const readCookie=(request,name)=>(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)||'';
const fail=(request)=>new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso não autorizado · LEGACY</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#101012;color:#f4f3f1;font:16px Arial,sans-serif"><main style="max-width:440px;padding:36px;text-align:center;border:1px solid #46252a;border-radius:16px;background:#171719"><p style="color:#d9a0a3;letter-spacing:.12em">LEGACY · CIDADE BRAVA</p><h1>Acesso não autorizado</h1><p>Entre com uma conta Discord que possua cargo de membro, gerente ou líder LEGACY.</p><a style="display:inline-block;margin-top:14px;padding:12px 18px;border-radius:8px;background:#8e1b27;color:white;text-decoration:none" href="/api/auth/login">Tentar novamente com Discord</a></main></body></html>',{status:403,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Set-Cookie':cookie('legacy_oauth_state','',{maxAge:0,secure:new URL(request.url).protocol==='https:'})}});
export async function onRequest({request,env}){
  const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code'),saved=readCookie(request,'legacy_oauth_state');
  if(!authConfigured(env)||!code||!state||!saved||state!==saved)return fail(request);
  try{
    const form=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:discordRedirectUri(request)});
    const tokenResponse=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});if(!tokenResponse.ok)return fail(request);const token=await tokenResponse.json();if(!token.access_token)return fail(request);
    const headers={Authorization:`Bearer ${token.access_token}`};
    const [userResponse,memberResponse]=await Promise.all([fetch('https://discord.com/api/users/@me',{headers}),fetch(`https://discord.com/api/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`,{headers})]);
    if(!userResponse.ok||!memberResponse.ok)return fail(request);const [user,member]=await Promise.all([userResponse.json(),memberResponse.json()]);
    const permittedRoles=allowedRoleIds(env);if(!Array.isArray(member.roles)||!member.roles.some(role=>permittedRoles.includes(role)))return fail(request);
    const session=await createSession({id:user.id,username:user.global_name||user.username,avatar:user.avatar||null},env);const secure=url.protocol==='https:';
    return htmlRedirect(url.origin+'/',[cookie('legacy_session',session,{maxAge:21600,secure}),cookie('legacy_oauth_state','',{maxAge:0,secure})]);
  }catch(_){return fail(request);}
}
