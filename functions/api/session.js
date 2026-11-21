import { authConfigured, logsConfigured, readSession, json } from '../_lib/auth.js';
const MANAGER_ROLE_IDS=new Set(['1541651937299271722','1541651937311719490']);
export async function onRequest({request,env}){
  const configured=authConfigured(env),user=configured?await readSession(request,env):null;
  return json({authConfigured:configured,authenticated:!!user,d1Configured:!!env.DB,logsConfigured:logsConfigured(env),user:user?{id:user.id,username:user.username,avatar:user.avatar,canManage:Array.isArray(user.roles)&&user.roles.some(role=>MANAGER_ROLE_IDS.has(String(role)))}:null});
}
