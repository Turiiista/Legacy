import { authConfigured, readSession, json, isSameOrigin } from './auth.js';

const MANAGER_ROLE_IDS = new Set(['1541651937299271722','1541651937311719490']);
export async function authorize(request, env, {write=false, manager=false}={}) {
  if (write && !isSameOrigin(request)) return {response:json({error:'Origem inválida.'},403)};
  if (!authConfigured(env)) return {response:json({error:'A autenticação do Discord não está configurada.'},503)};
  const user=await readSession(request,env);
  if (!user) return {response:json({error:'Sessão inválida ou expirada. Entre novamente pelo Discord.'},401)};
  if (!env.DB) return {response:json({error:'Banco D1 não conectado. Vincule o banco usando o nome DB nas configurações do Pages.'},503)};
  if (manager && !isManager(user)) return {response:json({error:'Somente gerentes e líderes podem alterar o catálogo ou excluir registros.'},403)};
  return {user};
}
export function isManager(user){return Array.isArray(user?.roles)&&user.roles.some(role=>MANAGER_ROLE_IDS.has(String(role)));}
export function validText(value,max=80){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=max;}
export function cents(value,{positive=false}={}){return Number.isSafeInteger(value)&&value>=(positive?1:0)&&value<=9000000000000000;}
export function nowIso(){return new Date().toISOString();}
export function parseDetails(row){let details={};try{details=JSON.parse(row.detalhes_json||'{}');}catch(_){}return {...details,id:row.id,type:row.tipo,createdAt:row.criado_em,discordId:row.discord_id,discordName:row.discord_nome,responsible:row.responsavel,grossCents:Number(row.valor_bruto_centavos),notes:row.observacao||details.notes||''};}
export async function writeOperation(env,user,operation){
  const details={...operation};
  await env.DB.prepare('INSERT INTO operacoes (id, criado_em, tipo, discord_id, discord_nome, responsavel, valor_bruto_centavos, detalhes_json, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(operation.id,operation.createdAt,operation.type,user.id,String(user.username||'Discord').slice(0,80),operation.responsible,operation.grossCents,JSON.stringify(details),operation.notes||'').run();
}
const brl=centsValue=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(centsValue)||0)/100);
const clip=(text,max=1000)=>String(text??'—').slice(0,max)||'—';
function embedFor(operation,user){
  const when=new Date(operation.createdAt);
  const fields=[];
  if(operation.type==='wash'){
    fields.push({name:'Quem está lavando',value:clip(operation.responsible,80),inline:true},{name:'Registrado por',value:clip(user.username,80),inline:true},{name:'Categoria',value:operation.category==='member'?'Membro LEGACY':'Pessoa de fora',inline:true},{name:'Pagou o farm',value:operation.farmPaid?'Sim':'Não',inline:true});
    if(operation.category==='outsider')fields.push({name:'Parceria',value:operation.partnership?'Sim':'Não',inline:true});
    fields.push({name:'Valor bruto',value:brl(operation.grossCents),inline:true},{name:'Máquina',value:`${brl(operation.machineCents)} · ${operation.rates.machine}%`,inline:true},{name:'Caixa LEGACY',value:`${brl(operation.legacyCents)} · ${operation.rates.legacy}%`,inline:true},{name:'Taxa do lavador',value:`${brl(operation.washerCents)} · ${operation.rates.washer}%`,inline:true},{name:'Total de taxas',value:brl(operation.totalFeesCents),inline:true},{name:'Valor líquido entregue',value:`${brl(operation.netCents)} · ${operation.rates.net}%`,inline:true});
  } else {
    const lines=(operation.lines||[]).map(line=>`• ${line.quantity} × ${line.name}: ${brl(line.unitCents)} cada — ${brl(line.totalCents)}`).join('\n');
    fields.push({name:'Vendedor',value:clip(operation.responsible,80),inline:true},{name:'Registrado por',value:clip(user.username,80),inline:true},{name:'Cliente com parceria',value:operation.partnership?'Sim':'Não',inline:true},{name:'Itens',value:clip(lines,1000)},{name:'Total da compra',value:brl(operation.grossCents),inline:true},{name:'Vendedor · 50%',value:brl(operation.sellerCents),inline:true},{name:'LEGACY · 50%',value:brl(operation.legacyCents),inline:true});
  }
  fields.push({name:'Identificador',value:clip(operation.id,80),inline:false});
  if(operation.notes)fields.push({name:'Observações',value:clip(operation.notes,1000),inline:false});
  return {title:operation.type==='wash'?'🧾 Lavagem registrada':'🛒 Venda registrada',description:`**Responsável:** ${clip(operation.responsible,80)}\n**Data e hora:** ${when.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,color:operation.type==='wash'?0x9b1d2a:0xb79a63,fields,timestamp:when.toISOString(),footer:{text:'LEGACY · Cidade Brava | Painel financeiro'}};
}
function validWebhook(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='discord.com'||u.hostname==='discordapp.com')&&u.pathname.startsWith('/api/webhooks/');}catch(_){return false;}}
async function sendOne(url,embed){if(!validWebhook(url))throw new Error('URL de webhook ausente ou inválida.');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'LEGACY · Financeiro',embeds:[embed],allowed_mentions:{parse:[]}})});if(!response.ok)throw new Error(`Discord HTTP ${response.status}`);}
export async function sendOperationWebhook(operation,user,env){
  const destinations=operation.type==='wash'?[['lavagem 1',env.DISCORD_WASH_WEBHOOK_1],['lavagem 2',env.DISCORD_WASH_WEBHOOK_2]]:[['vendas',env.DISCORD_SALES_WEBHOOK]];
  const embed=embedFor(operation,user),results=await Promise.all(destinations.map(async ([name,url])=>{try{await sendOne(url,embed);return null;}catch(_){return name;}}));
  return {sent:results.every(x=>x===null),failed:results.filter(Boolean)};
}
export { json, isSameOrigin };
export function washCalculation(grossCents,category,farmPaid,partnership){
  let rates;
  if(category==='member')rates={machine:10,legacy:farmPaid?0:10,washer:0};
  else if(category==='outsider'&&partnership)rates={machine:10,legacy:farmPaid?5:10,washer:farmPaid?10:5};
  else if(category==='outsider')rates={machine:10,legacy:farmPaid?10:15,washer:farmPaid?10:5};
  else throw new Error('Categoria inválida.');
  const pct=rate=>Number((BigInt(grossCents)*BigInt(rate)+50n)/100n),machineCents=pct(rates.machine),legacyCents=pct(rates.legacy),washerCents=pct(rates.washer),netCents=grossCents-machineCents-legacyCents-washerCents;
  return {grossCents,machineCents,legacyCents,washerCents,netCents,memberCents:category==='member'?netCents:0,customerCents:category==='outsider'?netCents:0,totalFeesCents:grossCents-netCents,rates:{...rates,net:100-rates.machine-rates.legacy-rates.washer}};
}
export const washRules=[
  ['member',true,false,10,0,0,90],['member',false,false,10,10,0,80],
  ['outsider',true,true,10,5,10,75],['outsider',false,true,10,10,5,75],
  ['outsider',true,false,10,10,10,70],['outsider',false,false,10,15,5,70]
];
export function validateWashRules(){return washRules.every(([category,farm,partnership,machine,legacy,washer,net])=>{const result=washCalculation(10000,category,farm,partnership);return result.rates.machine===machine&&result.rates.legacy===legacy&&result.rates.washer===washer&&result.rates.net===net&&result.grossCents===result.machineCents+result.legacyCents+result.washerCents+result.netCents;});}
