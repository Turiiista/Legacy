import { authConfigured, logsConfigured, readSession, json, isSameOrigin } from '../../_lib/auth.js';
const formatBRL=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
const clipped=(value,max=900)=>String(value??'—').slice(0,max)||'—';
const intCents=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const field=(name,value,inline=false)=>({name:clipped(name,256),value:clipped(value,1024),inline});
function washEmbed(o){
  const gross=intCents(o.grossCents),net=intCents(o.netCents),machine=intCents(o.machineCents),legacy=intCents(o.legacyCents),washer=intCents(o.washerCents),fees=intCents(o.totalFeesCents);
  if([gross,net,machine,legacy,washer,fees].some(v=>v===null))throw new Error('Valores inválidos na lavagem.');
  const rates=o.rates||{};const category=o.category==='member'?'Membro LEGACY':'Pessoa de fora';const fields=[field('Quem realizou a lavagem',clipped(o.responsible,80)),field('Categoria',category,true),field('Pagou o farm',o.farmPaid?'Sim':'Não',true)];if(o.category==='outsider')fields.push(field('Possui parceria',o.partnership?'Sim':'Não',true));
  fields.push(field('Valor bruto',formatBRL(gross),true),field('Máquina',`${formatBRL(machine)} · ${Number(rates.machine)||10}%`,true),field('Caixa LEGACY',`${formatBRL(legacy)} · ${Number(rates.legacy)||0}%`,true),field('Taxa do lavador',`${formatBRL(washer)} · ${Number(rates.washer)||0}%`,true),field('Total de taxas',formatBRL(fees),true),field('Valor líquido entregue',`${formatBRL(net)} · ${Number(rates.net)||0}%`,true),field('Identificador',clipped(o.id,80),true));if(o.notes)fields.push(field('Observações',clipped(o.notes,900)));
  return {title:'🧾 Nova lavagem registrada',description:`**Responsável:** ${clipped(o.responsible,80)}\n**Horário:** ${new Date(o.createdAt||Date.now()).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,color:0x971d29,fields,timestamp:new Date(o.createdAt||Date.now()).toISOString(),footer:{text:'LEGACY · Cidade Brava | Painel financeiro'}};
}
function saleEmbed(o){
  const gross=intCents(o.grossCents),net=intCents(o.netCents),legacy=intCents(o.legacyCents),seller=intCents(o.sellerCents),unit=intCents(o.unitCents);if([gross,net,legacy,seller,unit].some(v=>v===null)||!Number.isInteger(o.quantity)||o.quantity<1)throw new Error('Valores inválidos na venda.');
  const fields=[field('Vendedor',clipped(o.responsible,80)),field('Produto',clipped(o.product,80),true),field('Quantidade',String(o.quantity),true),field('Valor unitário',formatBRL(unit),true),field('Valor total',formatBRL(gross),true),field('Parte do vendedor (50%)',formatBRL(seller),true),field('Parte LEGACY (50%)',formatBRL(legacy),true),field('Identificador',clipped(o.id,80),true)];if(o.notes)fields.push(field('Observações',clipped(o.notes,900)));
  return {title:'🛍️ Nova venda registrada',description:`**Vendedor:** ${clipped(o.responsible,80)}\n**Horário:** ${new Date(o.createdAt||Date.now()).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,color:0xb79a63,fields,timestamp:new Date(o.createdAt||Date.now()).toISOString(),footer:{text:'LEGACY · Cidade Brava | Painel financeiro'}};
}
function validWebhook(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='discord.com'||u.hostname==='discordapp.com')&&u.pathname.startsWith('/api/webhooks/');}catch(_){return false;}}
async function postWebhook(url,embed){if(!validWebhook(url))throw new Error('Webhook inválido: confira a URL configurada no servidor.');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'LEGACY · Financeiro',embeds:[embed],allowed_mentions:{parse:[]}})});if(!response.ok)throw new Error(`Discord respondeu com HTTP ${response.status}.`);}
export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return json({error:'Origem inválida.'},403);
  if(!authConfigured(env))return json({error:'A verificação do Discord não está configurada.'},503);
  const user=await readSession(request,env);if(!user)return json({error:'Sessão inválida ou expirada. Entre novamente com o Discord.'},401);
  if(!logsConfigured(env))return json({error:'Os webhooks não estão configurados no Cloudflare.'},503);
  try{
    const data=await request.json(),o=data?.operation;if(!o||!['wash','sale'].includes(o.type)||typeof o.responsible!=='string'||!o.responsible.trim()||o.responsible.length>80)throw new Error('Dados da operação inválidos.');const embed=o.type==='wash'?washEmbed(o):saleEmbed(o);const destinations=o.type==='wash'?[env.DISCORD_WASH_WEBHOOK_1,env.DISCORD_WASH_WEBHOOK_2]:[env.DISCORD_SALES_WEBHOOK];await Promise.all(destinations.map(url=>postWebhook(url,embed)));return json({ok:true});
  }catch(error){return json({error:error.message||'Não foi possível publicar o log.'},400);}
}
