import { authorize, validText, cents, nowIso, parseDetails, writeOperation, sendOperationWebhook, washCalculation, json } from '../_lib/operations.js';

export async function onRequestGet({request,env}){
  const access=await authorize(request,env);if(access.response)return access.response;
  try{const result=await env.DB.prepare('SELECT id, criado_em, tipo, discord_id, discord_nome, responsavel, valor_bruto_centavos, detalhes_json, observacao FROM operacoes ORDER BY criado_em DESC LIMIT 10000').all();return json({operations:(result.results||[]).map(parseDetails)});}
  catch(_){return json({error:'Não foi possível ler o histórico do D1. Confira se a tabela operacoes existe e tem a estrutura descrita no README.'},503);}
}
export async function onRequestPost({request,env}){
  const access=await authorize(request,env,{write:true});if(access.response)return access.response;const user=access.user;
  let body;try{body=await request.json();}catch(_){return json({error:'Conteúdo inválido.'},400);}
  try{
    let operation;
    if(body?.type==='wash'){
      const responsible=String(body.responsible||'').trim(),grossCents=body.grossCents,category=body.category,farmPaid=body.farmPaid,partnership=body.partnership===true,notes=String(body.notes||'').trim();
      if(!validText(responsible,80)||!cents(grossCents,{positive:true})||!['member','outsider'].includes(category)||typeof farmPaid!=='boolean'||notes.length>500)return json({error:'Preencha corretamente os campos obrigatórios da lavagem.'},400);
      const calc=washCalculation(grossCents,category,farmPaid,partnership);operation={id:crypto.randomUUID(),type:'wash',createdAt:nowIso(),responsible,grossCents,category,farmPaid,partnership:category==='outsider'?partnership:null,notes,...calc};
    } else if(body?.type==='sale'){
      const responsible=String(body.responsible||'').trim(),partnership=body.partnership===true,notes=String(body.notes||'').trim(),linesIn=body.lines;
      if(!validText(responsible,80)||!Array.isArray(linesIn)||linesIn.length<1||linesIn.length>25||notes.length>500)return json({error:'Informe vendedor, observação válida e ao menos um item (máximo 25 produtos por compra).'},400);
      const cleanLines=[];
      for(const line of linesIn){if(!validText(String(line?.productId||''),100)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>1000000)return json({error:'Quantidade ou produto inválido no carrinho.'},400);const product=await env.DB.prepare('SELECT id, nome, preco_sem_parceria_centavos, preco_com_parceria_centavos FROM produtos WHERE id = ? AND ativo = 1').bind(line.productId).first();if(!product)return json({error:'Um produto do carrinho não existe mais ou está inativo. Atualize a página e tente novamente.'},409);const unitCents=Number(partnership?product.preco_com_parceria_centavos:product.preco_sem_parceria_centavos);if(!cents(unitCents,{positive:true}))return json({error:`O produto “${product.nome}” ainda não tem preço válido para esta condição.`},400);const totalCents=unitCents*line.quantity;if(!Number.isSafeInteger(totalCents))return json({error:'O total de um item excede o limite permitido.'},400);cleanLines.push({productId:product.id,name:product.nome,quantity:line.quantity,unitCents,totalCents});}
      const grossCents=cleanLines.reduce((n,line)=>n+line.totalCents,0);if(!cents(grossCents,{positive:true}))return json({error:'Total da compra inválido.'},400);const sellerCents=Math.floor(grossCents/2),legacyCents=grossCents-sellerCents;operation={id:crypto.randomUUID(),type:'sale',createdAt:nowIso(),responsible,partnership,lines:cleanLines,product:cleanLines.map(x=>x.name).join(', '),quantity:cleanLines.reduce((n,x)=>n+x.quantity,0),unitCents:cleanLines.length===1?cleanLines[0].unitCents:0,grossCents,netCents:grossCents,machineCents:0,legacyCents,sellerCents,washerCents:0,memberCents:0,totalFeesCents:0,notes};
    }else return json({error:'Tipo de operação inválido.'},400);
    await writeOperation(env,user,operation);
    const webhook=await sendOperationWebhook(operation,user,env);
    return json({ok:true,operation,webhook});
  }catch(error){return json({error:error.message||'Não foi possível registrar a operação no banco compartilhado.'},503);}
}
