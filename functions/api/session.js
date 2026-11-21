import { authConfigured, logsConfigured, readSession, json } from '../_lib/auth.js';
export async function onRequest({request,env}){
  const configured=authConfigured(env),user=configured?await readSession(request,env):null;
  return json({authConfigured:configured,authenticated:!!user,logsConfigured:logsConfigured(env),user:user?{id:user.id,username:user.username,avatar:user.avatar,role:user.role||'membro'}:null});
}
