import { authConfigured, discordRedirectUri, htmlRedirect, cookie } from '../../_lib/auth.js';
export async function onRequest({request,env}){
  if(!authConfigured(env))return new Response('A verificação do Discord não está configurada no servidor.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const redirect=new URL('https://discord.com/oauth2/authorize');redirect.searchParams.set('client_id',env.DISCORD_CLIENT_ID);redirect.searchParams.set('redirect_uri',discordRedirectUri(request));redirect.searchParams.set('response_type','code');redirect.searchParams.set('scope','identify guilds.members.read');redirect.searchParams.set('state',state);redirect.searchParams.set('prompt','consent');
  const secure=new URL(request.url).protocol==='https:';
  return htmlRedirect(redirect.toString(),[cookie('legacy_oauth_state',state,{maxAge:600,secure})]);
}
