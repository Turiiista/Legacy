import { authorize, json, nowIso } from '../../_lib/operations.js';
export async function onRequestDelete({request,env,params}){
  const access=await authorize(request,env,{write:true,manager:true});if(access.response)return access.response;const id=String(params?.id||'');if(!id||id.length>100)return json({error:'Identificador inválido.'},400);
  try{const result=await env.DB.prepare('UPDATE produtos SET ativo=0,atualizado_em=? WHERE id=? AND ativo=1').bind(nowIso(),id).run();if(!result.meta?.changes)return json({error:'Produto não encontrado ou já removido.'},404);return json({ok:true});}catch(_){return json({error:'Não foi possível remover o produto.'},503);}
}
