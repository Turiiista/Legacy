import { authorize, json } from '../../_lib/operations.js';
// Logs agora são enviados somente pelo servidor após salvar uma operação validada no D1.
export async function onRequestPost({request,env}){
  const access=await authorize(request,env,{write:true});if(access.response)return access.response;
  return json({error:'Rota antiga desativada. Registre a operação pelo painel para salvar no D1 e enviar o webhook automaticamente.'},410);
}
