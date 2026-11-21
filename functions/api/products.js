import { authConfigured, readSession, json, isSameOrigin } from '../_lib/auth.js';
const validUser = user => !!user?.id;
const canManage = user => ['gerente','lider'].includes(user?.role);
const hasDb = env => env.DB && typeof env.DB.prepare === 'function';
function productFromRow(row){return {id:row.id,name:row.nome,standardPriceCents:Number(row.preco_sem_parceria_centavos),partnershipPriceCents:Number(row.preco_com_parceria_centavos)};}
export async function onRequestGet({request,env}){
 if(!authConfigured(env))return json({error:'A autenticação Discord não está configurada.'},503);
 const user=await readSession(request,env);if(!validUser(user))return json({error:'Sessão inválida ou expirada.'},401);
 if(!hasDb(env))return json({error:'O banco D1 não está vinculado como DB.'},503);
 try{const result=await env.DB.prepare('SELECT id,nome,preco_sem_parceria_centavos,preco_com_parceria_centavos FROM produtos WHERE ativo=1 ORDER BY nome COLLATE NOCASE').all();return json({products:(result.results||[]).map(productFromRow)});}
 catch(error){return json({error:`Catálogo D1 indisponível. Execute migrations/0002_catalogo_produtos.sql. ${String(error?.message||error).slice(0,140)}`},503);}
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return json({error:'Origem inválida.'},403);
 if(!authConfigured(env))return json({error:'A autenticação Discord não está configurada.'},503);
 const user=await readSession(request,env);if(!validUser(user))return json({error:'Sessão inválida ou expirada.'},401);
 if(!canManage(user))return json({error:'Somente gerente ou líder pode alterar o catálogo.'},403);
 if(!hasDb(env))return json({error:'O banco D1 não está vinculado como DB.'},503);
 try{const input=await request.json(),name=String(input.name||'').trim().slice(0,80),standard=Number(input.standardPriceCents),partner=Number(input.partnershipPriceCents);
  if(!name||!Number.isSafeInteger(standard)||standard<0||!Number.isSafeInteger(partner)||partner<0||(!standard&&!partner))return json({error:'Nome e ao menos um preço válido maior que zero são obrigatórios.'},400);
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO produtos(id,nome,preco_sem_parceria_centavos,preco_com_parceria_centavos,ativo,atualizado_em) VALUES(?,?,?,?,1,?)').bind(id,name,standard,partner,new Date().toISOString()).run();
  return json({ok:true,product:{id,name,standardPriceCents:standard,partnershipPriceCents:partner}},201);
 }catch(error){const msg=String(error?.message||error);return json({error:/UNIQUE|unique/i.test(msg)?'Já existe um produto com esse nome.':msg.slice(0,200)},400);}
}
