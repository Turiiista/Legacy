const encoder = new TextEncoder();
const AUTH_KEYS = ['DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_GUILD_ID','SESSION_SECRET'];
export const allowedRoleIds = env => (env.DISCORD_ALLOWED_ROLE_IDS || env.DISCORD_REQUIRED_ROLE_ID || '').split(',').map(value => value.trim()).filter(Boolean);
export const authConfigured = env => AUTH_KEYS.every(key => typeof env[key] === 'string' && env[key].trim().length > 0) && env.SESSION_SECRET.trim().length >= 32 && allowedRoleIds(env).length > 0;
export const logsConfigured = env => ['DISCORD_WASH_WEBHOOK_1','DISCORD_WASH_WEBHOOK_2','DISCORD_SALES_WEBHOOK'].every(key => typeof env[key] === 'string' && env[key].trim().length > 0);
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function hmac(value,secret){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
export async function createSession(user,env){const payload={user,exp:Date.now()+6*60*60*1000};const body=b64url(encoder.encode(JSON.stringify(payload)));return `${body}.${b64url(await hmac(body,env.SESSION_SECRET))}`;}
export async function readSession(request,env){try{if(!env.SESSION_SECRET)return null;const cookie=request.headers.get('Cookie')||'';const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('legacy_session='))?.slice('legacy_session='.length);if(!token)return null;const [body,signature]=token.split('.');if(!body||!signature)return null;const expected=await hmac(body,env.SESSION_SECRET),actual=fromB64url(signature);if(expected.length!==actual.length||!expected.every((v,i)=>v===actual[i]))return null;const payload=JSON.parse(new TextDecoder().decode(fromB64url(body)));if(!payload.exp||payload.exp<Date.now()||!payload.user?.id)return null;return payload.user;}catch(_){return null;}}
export function cookie(name,value,{maxAge=3600,secure=true}={}){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function htmlRedirect(url,cookies=[]){const headers=new Headers({Location:url,'Cache-Control':'no-store'});for(const value of cookies)headers.append('Set-Cookie',value);return new Response(null,{status:302,headers});}
export function discordRedirectUri(request){return `${new URL(request.url).origin}/api/auth/callback`;}
export function isSameOrigin(request){const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin;}
