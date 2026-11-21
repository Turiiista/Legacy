const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const brl = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const roundPercent = (cents, rate) => Number((BigInt(cents) * BigInt(rate) + 50n) / 100n);
const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);
const clip = (value, max = 900) => String(value ?? '—').slice(0, max) || '—';

export function calculateWash(grossCents, category, farmPaid, partnership = false) {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error('Informe um valor bruto válido maior que zero.');
  let rates;
  if (category === 'member') rates = { machine: 10, legacy: farmPaid ? 0 : 10, washer: 0 };
  else if (category === 'outsider' && partnership) rates = { machine: 10, legacy: farmPaid ? 5 : 10, washer: farmPaid ? 10 : 5 };
  else if (category === 'outsider' && !partnership) rates = { machine: 10, legacy: farmPaid ? 10 : 15, washer: farmPaid ? 10 : 5 };
  else throw new Error('Categoria inválida.');
  const machineCents = roundPercent(grossCents, rates.machine);
  const legacyCents = roundPercent(grossCents, rates.legacy);
  const washerCents = roundPercent(grossCents, rates.washer);
  const netCents = grossCents - machineCents - legacyCents - washerCents;
  if (netCents < 0) throw new Error('A divisão calculada é inválida.');
  return { grossCents, machineCents, legacyCents, washerCents, netCents,
    memberCents: category === 'member' ? netCents : 0,
    customerCents: category === 'outsider' ? netCents : 0,
    totalFeesCents: machineCents + legacyCents + washerCents,
    rates: { ...rates, net: 100 - rates.machine - rates.legacy - rates.washer } };
}

export function calculateSale(totalCents) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new Error('Informe um valor de venda válido maior que zero.');
  const sellerCents = Math.floor(totalCents / 2);
  return { grossCents: totalCents, sellerCents, legacyCents: totalCents - sellerCents };
}

export function buildOperation(user, input) {
  if (!input || !['wash', 'sale'].includes(input.type)) throw new Error('Tipo de operação inválido.');
  const responsible = cleanText(input.responsible, 80);
  if (!responsible) throw new Error('Informe o nome do responsável pela operação.');
  const notes = cleanText(input.notes, 500);
  const operation = {
    id: crypto.randomUUID(), type: input.type, createdAt: new Date().toISOString(),
    responsible, notes, creatorId: user.id, creatorName: cleanText(user.username, 80) || 'Membro LEGACY',
    creatorRole: user.role || 'membro'
  };
  if (input.type === 'wash') {
    if (!Number.isSafeInteger(input.grossCents) || input.grossCents <= 0 || input.grossCents > MAX_SAFE) throw new Error('Valor bruto inválido.');
    if (!['member', 'outsider'].includes(input.category) || typeof input.farmPaid !== 'boolean') throw new Error('Categoria ou informação do farm inválida.');
    const partnership = input.category === 'outsider' ? input.partnership : false;
    if (typeof partnership !== 'boolean') throw new Error('Informe se a pessoa possui parceria.');
    Object.assign(operation, { category: input.category, farmPaid: input.farmPaid, partnership,
      ...calculateWash(input.grossCents, input.category, input.farmPaid, partnership) });
  } else {
    const product = cleanText(input.product, 80);
    if (!product || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000000 || !Number.isSafeInteger(input.unitCents) || input.unitCents <= 0) throw new Error('Produto, quantidade ou valor unitário inválido.');
    const grossCents = input.quantity * input.unitCents;
    if (!Number.isSafeInteger(grossCents)) throw new Error('O total da venda excede o limite aceito.');
    Object.assign(operation, { product, quantity: input.quantity, unitCents: input.unitCents, ...calculateSale(grossCents),
      netCents: grossCents, machineCents: 0, washerCents: 0, memberCents: 0, totalFeesCents: 0 });
  }
  return operation;
}

function embedField(name, value, inline = false) { return { name: clip(name, 256), value: clip(value, 1024), inline }; }
function washEmbed(o) {
  const fields = [
    embedField('Lavagem realizada por', o.creatorName, true),
    embedField('Nome informado na operação', o.responsible, true),
    embedField('Categoria', o.category === 'member' ? 'Membro LEGACY' : 'Pessoa de fora', true),
    embedField('Pagou o farm', o.farmPaid ? 'Sim' : 'Não', true)
  ];
  if (o.category === 'outsider') fields.push(embedField('Possui parceria', o.partnership ? 'Sim' : 'Não', true));
  fields.push(
    embedField('Valor bruto', brl(o.grossCents), true),
    embedField('Máquina', `${brl(o.machineCents)} · ${o.rates.machine}%`, true),
    embedField('Caixa LEGACY', `${brl(o.legacyCents)} · ${o.rates.legacy}%`, true),
    embedField('Taxa do lavador', `${brl(o.washerCents)} · ${o.rates.washer}%`, true),
    embedField('Total de taxas', brl(o.totalFeesCents), true),
    embedField('Valor líquido entregue', `${brl(o.netCents)} · ${o.rates.net}%`, true),
    embedField('ID da operação', o.id, true)
  );
  if (o.notes) fields.push(embedField('Observações', o.notes));
  return { title: '🧾 Lavagem registrada · LEGACY', description: `**Registrado por:** ${clip(o.creatorName, 80)}\n**Nome da operação:** ${clip(o.responsible, 80)}\n**Data e hora:** ${new Date(o.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    color: 0x971d29, fields, timestamp: o.createdAt, footer: { text: 'LEGACY · Cidade Brava | Painel financeiro' } };
}
function saleEmbed(o) {
  const fields = [embedField('Venda registrada por', o.creatorName, true), embedField('Vendedor', o.responsible, true),
    embedField('Produto', o.product, true), embedField('Quantidade', String(o.quantity), true),
    embedField('Valor unitário', brl(o.unitCents), true), embedField('Valor total', brl(o.grossCents), true),
    embedField('Parte do vendedor · 50%', brl(o.sellerCents), true), embedField('Parte LEGACY · 50%', brl(o.legacyCents), true),
    embedField('ID da operação', o.id, true)];
  if (o.notes) fields.push(embedField('Observações', o.notes));
  return { title: '🛍️ Venda registrada · LEGACY', description: `**Vendedor:** ${clip(o.responsible, 80)}\n**Registrado por:** ${clip(o.creatorName, 80)}\n**Data e hora:** ${new Date(o.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    color: 0xb79a63, fields, timestamp: o.createdAt, footer: { text: 'LEGACY · Cidade Brava | Painel financeiro' } };
}
function validWebhook(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['discord.com', 'discordapp.com'].includes(url.hostname) && /^\/api\/webhooks\/\d+\//.test(url.pathname); }
  catch { return false; }
}
async function postWebhook(url, embed) {
  if (!validWebhook(url)) throw new Error('Webhook ausente ou inválido.');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'LEGACY · Financeiro', embeds: [embed], allowed_mentions: { parse: [] } }) });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
}
export async function sendOperationWebhooks(operation, env) {
  const urls = operation.type === 'wash'
    ? [env.DISCORD_WASH_WEBHOOK_1, env.DISCORD_WASH_WEBHOOK_2]
    : [env.DISCORD_SALES_WEBHOOK];
  const results = await Promise.allSettled(urls.map(url => postWebhook(url, operation.type === 'wash' ? washEmbed(operation) : saleEmbed(operation))));
  return results.map((result, index) => ({ destination: operation.type === 'wash' ? index + 1 : 'vendas', sent: result.status === 'fulfilled', error: result.status === 'rejected' ? String(result.reason?.message || 'Falha no envio').slice(0, 180) : null }));
}

export function rowToOperation(row) {
  try {
    const operation = JSON.parse(row.detalhes_json);
    operation.id = row.id;
    operation.createdAt = row.criado_em;
    operation.type = row.tipo;
    operation.creatorId = row.discord_id;
    operation.creatorName = row.discord_nome;
    operation.responsible = row.responsavel;
    operation.grossCents = row.valor_bruto_centavos;
    operation.notes = row.observacao || '';
    return operation;
  } catch { return null; }
}
