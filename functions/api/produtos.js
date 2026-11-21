import { authorize, validText, cents, nowIso, json } from '../_lib/operations.js';
function product(row){return {id:row.id,name:row.nome,priceNoPartnershipCents:Number(row.preco_sem_parceria_centavos),priceWithPartnershipCents:Number(row.preco_com_parceria_centavos),active:Number(row.ativo)===1,updatedAt:row.atualizado_em};}
async function readCatalog(env){const result=await env.DB.prepare('SELECT id, nome, preco_sem_parceria_centavos, preco_com_parceria_centavos, ativo, atualizado_em FROM produtos WHERE ativo = 1 ORDER BY nome COLLATE NOCASE').all();return (result.results||[]).map(product);}
export async function onRequestGet({request,env}){const access=await authorize(request,env);if(access.response)return access.response;try{return json({products:await readCatalog(env)});}catch(_){return json({error:'A tabela produtos ainda não existe. Execute o arquivo migrations/0001_catalogo.sql no Console do D1.'},503);}}
async function payload(request){try{return await request.json();}catch(_){return null;}}
export async function onRequestPost({request,env}){
  const access=await authorize(request,env,{write:true,manager:true});if(access.response)return access.response;const data=await payload(request);
  if(!data||!validText(data.name,80)||!cents(data.priceNoPartnershipCents)||!cents(data.priceWithPartnershipCents))return json({error:'Informe um nome e preços não negativos em centavos.'},400);
  const id=crypto.randomUUID(),now=nowIso();try{await env.DB.prepare('INSERT INTO produtos (id,nome,preco_sem_parceria_centavos,preco_com_parceria_centavos,ativo,criado_em,atualizado_em) VALUES (?,?,?,?,1,?,?)').bind(id,data.name.trim(),data.priceNoPartnershipCents,data.priceWithPartnershipCents,now,now).run();return json({ok:true,product:{id,name:data.name.trim(),priceNoPartnershipCents:data.priceNoPartnershipCents,priceWithPartnershipCents:data.priceWithPartnershipCents,active:true}});}catch(_){return json({error:'Não foi possível criar o produto. Confira se o nome já está cadastrado e se executou a migração do catálogo.'},409);}
}
export async function onRequestPut({request,env}){
  const access=await authorize(request,env,{write:true,manager:true});if(access.response)return access.response;const data=await payload(request);
  if(!data||!validText(data.id,100)||!validText(data.name,80)||!cents(data.priceNoPartnershipCents)||!cents(data.priceWithPartnershipCents))return json({error:'Dados do produto inválidos.'},400);
  try{const result=await env.DB.prepare('UPDATE produtos SET nome=?,preco_sem_parceria_centavos=?,preco_com_parceria_centavos=?,atualizado_em=? WHERE id=? AND ativo=1').bind(data.name.trim(),data.priceNoPartnershipCents,data.priceWithPartnershipCents,nowIso(),data.id).run();if(!result.meta?.changes)return json({error:'Produto não encontrado.'},404);return json({ok:true});}catch(_){return json({error:'Não foi possível atualizar. Talvez já exista outro produto com esse nome.'},409);}
}
