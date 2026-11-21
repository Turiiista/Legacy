import { authorize, json } from '../../_lib/operations.js';
export async function onRequestDelete({request,env,params}){
  const access=await authorize(request,env,{write:true,manager:true});if(access.response)return access.response;
  const id=String(params?.id||'');if(!id||id.length>100)return json({error:'Identificador inválido.'},400);
  try{const result=await env.DB.prepare('DELETE FROM operacoes WHERE id = ?').bind(id).run();if(!result.meta?.changes)return json({error:'O registro não foi encontrado.'},404);return json({ok:true});}
  catch(_){return json({error:'Não foi possível excluir o registro do banco.'},503);}
}
