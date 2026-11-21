import { authConfigured, readSession, json, isSameOrigin } from '../../_lib/auth.js';
const canManage = user => ['gerente','lider'].includes(user?.role);
const hasDb = env => env.DB && typeof env.DB.prepare === 'function';
async function authorize(request,env){if(!isSameOrigin(request))return {error:json({error:'Origem inválida.'},403)};if(!authConfigured(env))return {error:json({error:'A autenticação Discord não está configurada.'},503)};const user=await readSession(request,env);if(!user?.id)return {error:json({error:'Sessão inválida ou expirada.'},401)};if(!canManage(user))return {error:json({error:'Somente gerente ou líder pode alterar o catálogo.'},403)};if(!hasDb(env))return {error:json({error:'O banco D1 não está vinculado como DB.'},503)};return {user};}
export async function onRequestPut({request,env,params}){
 const auth=await authorize(request,env);if(auth.error)return auth.error;
 try{const input=await request.json(),id=String(params.id||'').slice(0,100),name=String(input.name||'').trim().slice(0,80),standard=Number(input.standardPriceCents),partner=Number(input.partnershipPriceCents);
  if(!id||!name||!Number.isSafeInteger(standard)||standard<0||!Number.isSafeInteger(partner)||partner<0||(!standard&&!partner))return json({error:'Nome e ao menos um preço válido maior que zero são obrigatórios.'},400);
  const result=await env.DB.prepare('UPDATE produtos SET nome=?,preco_sem_parceria_centavos=?,preco_com_parceria_centavos=?,atualizado_em=? WHERE id=? AND ativo=1').bind(name,standard,partner,new Date().toISOString(),id).run();
  if(!result?.meta?.changes)return json({error:'Produto não encontrado no catálogo.'},404);
  return json({ok:true,product:{id,name,standardPriceCents:standard,partnershipPriceCents:partner}});
 }catch(error){const msg=String(error?.message||error);return json({error:/UNIQUE|unique/i.test(msg)?'Já existe um produto com esse nome.':msg.slice(0,200)},400);}
}
export async function onRequestDelete({request,env,params}){
 const auth=await authorize(request,env);if(auth.error)return auth.error;
 try{const result=await env.DB.prepare('UPDATE produtos SET ativo=0,atualizado_em=? WHERE id=? AND ativo=1').bind(new Date().toISOString(),String(params.id||'').slice(0,100)).run();if(!result?.meta?.changes)return json({error:'Produto não encontrado no catálogo.'},404);return json({ok:true});}
 catch(error){return json({error:`Não foi possível remover o produto: ${String(error?.message||error).slice(0,180)}`},500);}
}
