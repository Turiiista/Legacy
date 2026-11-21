(() => {
  'use strict';
  const DEFAULT_PRODUCTS = [];
  const MAX_CART_LINES = 30;
  const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const dateTime = new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
  const dateOnly = new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium'});
  const $ = (selector,root=document) => root.querySelector(selector);
  const $$ = (selector,root=document) => [...root.querySelectorAll(selector)];
  const centsToMoney = cents => money.format((Number(cents)||0)/100);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localDateKey = input => {const d=input instanceof Date?input:new Date(input);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const newId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : `LG-${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
  const asInt = v => Number.isSafeInteger(Number(v)) && Number(v)>=0 ? Number(v) : 0;
  const emptyState = () => ({version:3,operations:[],products:[]});
  let state = emptyState();
  let cart = [];
  let editingProductId = null;
  let pendingWash = null;
  let selectedOperation = null;
  let toastTimer = 0;
  let discordStatus = {checked:false,authConfigured:false,authenticated:false,logsConfigured:false,user:null};

  function saveState(){ return true; }
  function showToast(message,type=''){const el=$('#toast');el.textContent=message;el.className=`toast show ${type}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',4300);}
  function formatDate(iso){const d=new Date(iso);return Number.isNaN(d.getTime())?'—':dateTime.format(d);}
  function currencyInputSet(input,intPart='0',decimalPart='',mode='integer'){
    intPart=(String(intPart).replace(/\D/g,'').replace(/^0+(?=\d)/,'')||'0').slice(0,12);decimalPart=String(decimalPart).replace(/\D/g,'').slice(0,2);
    input.dataset.integer=intPart;input.dataset.decimal=decimalPart;input.dataset.mode=mode;
    const grouped=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(intPart)||0);
    input.value=`R$ ${grouped},${decimalPart.padEnd(2,'0')}`;
    input.dispatchEvent(new Event('legacy-money-change',{bubbles:true}));
    if(document.activeElement===input){const comma=input.value.lastIndexOf(',');const pos=mode==='decimal'?comma+1+decimalPart.length:comma;requestAnimationFrame(()=>{try{input.setSelectionRange(pos,pos);}catch(_){}});}
  }
  function getCents(input){const integer=input.dataset.integer||'0', decimal=(input.dataset.decimal||'').padEnd(2,'0');const amount=BigInt(integer)*100n+BigInt(decimal||'00');if(amount>BigInt(Number.MAX_SAFE_INTEGER))return null;return Number(amount);}
  function initMoneyInputs(){
    $$('.money-input').forEach(input=>{
      currencyInputSet(input);
      input.addEventListener('focus',()=>{if(!input.dataset.integer)currencyInputSet(input);});
      input.addEventListener('click',()=>{const comma=input.value.lastIndexOf(',');if(input.selectionStart>comma)input.dataset.mode='decimal';else input.dataset.mode='integer';});
      input.addEventListener('keydown',event=>{
        if(event.ctrlKey||event.metaKey||event.altKey){if(['a','c','v','x'].includes(event.key.toLowerCase()))return;}
        const mode=input.dataset.mode||'integer', whole=input.dataset.integer||'0', dec=input.dataset.decimal||'';
        if(/^\d$/.test(event.key)){
          event.preventDefault();
          if(mode==='decimal'){if(dec.length<2)currencyInputSet(input,whole,dec+event.key,'decimal');}
          else currencyInputSet(input,whole==='0'?event.key:whole+event.key,'','integer');
        } else if(event.key===','||event.key==='.') {event.preventDefault();input.dataset.mode='decimal';currencyInputSet(input,whole,dec,'decimal');}
        else if(event.key==='Backspace'){
          event.preventDefault();if(mode==='decimal'&&dec.length)currencyInputSet(input,whole,dec.slice(0,-1),'decimal');else if(mode==='decimal'){input.dataset.mode='integer';currencyInputSet(input,whole,'','integer');}else currencyInputSet(input,whole.length>1?whole.slice(0,-1):'0','','integer');
        } else if(event.key==='Delete'){event.preventDefault();currencyInputSet(input,'0','','integer');}
        else if(event.key==='ArrowLeft'){event.preventDefault();if(mode==='decimal')currencyInputSet(input,whole,dec,'integer');}
        else if(event.key==='ArrowRight'){event.preventDefault();if(mode==='integer')currencyInputSet(input,whole,dec,'decimal');}
        else if(event.key==='Home'){event.preventDefault();currencyInputSet(input,whole,dec,'integer');}
        else if(event.key==='End'){event.preventDefault();currencyInputSet(input,whole,dec,'decimal');}
        else if(event.key==='Tab'||event.key==='Enter')return;
        else if(event.key.length===1){event.preventDefault();}
      });
      input.addEventListener('paste',event=>{
        event.preventDefault();const raw=(event.clipboardData||window.clipboardData).getData('text').trim();
        let cleaned=raw.replace(/[^\d.,-]/g,'');if(cleaned.includes('-')){showToast('Valores negativos não são permitidos.','error');return;}
        let intPart='0', dec='';
        if(/[,.]\d{1,2}$/.test(cleaned)){const ix=Math.max(cleaned.lastIndexOf(','),cleaned.lastIndexOf('.'));const before=cleaned.slice(0,ix).replace(/\D/g,'');dec=cleaned.slice(ix+1).replace(/\D/g,'').slice(0,2);intPart=before||'0';}else intPart=cleaned.replace(/\D/g,'')||'0';
        currencyInputSet(input,intPart,dec,'integer');
      });
    });
  }
  function calculateWash(grossCents,category,farmPaid,partnership=false){
    const gross=Number(grossCents);if(!Number.isSafeInteger(gross)||gross<=0)throw new Error('O valor bruto deve ser maior que zero.');
    let rates;
    if(category==='member')rates={machine:10,legacy:farmPaid?0:10,washer:0};
    else if(category==='outsider'&&partnership)rates={machine:10,legacy:farmPaid?5:10,washer:farmPaid?10:5};
    else if(category==='outsider')rates={machine:10,legacy:farmPaid?10:15,washer:farmPaid?10:5};
    else throw new Error('Categoria inválida.');
    const percentCents=rate=>Number((BigInt(gross)*BigInt(rate)+50n)/100n);
    const machineCents=percentCents(rates.machine),legacyCents=percentCents(rates.legacy),washerCents=percentCents(rates.washer);
    const netCents=gross-machineCents-legacyCents-washerCents;
    return {grossCents:gross,machineCents,legacyCents,washerCents,netCents,memberCents:category==='member'?netCents:0,customerCents:category==='outsider'?netCents:0,totalFeesCents:gross-netCents,rates:{...rates,net:100-rates.machine-rates.legacy-rates.washer}};
  }
  function calculateSale(totalCents){const total=Number(totalCents);if(!Number.isSafeInteger(total)||total<=0)throw new Error('O valor da venda deve ser maior que zero.');const sellerCents=Math.floor(total/2);return {grossCents:total,sellerCents,legacyCents:total-sellerCents};}
  function runCalculationTests(){
    const cases=[
      ['membro farm pago', 'member',true,false,10,0,0,90],['membro farm não pago','member',false,false,10,10,0,80],
      ['parceria farm pago','outsider',true,true,10,5,10,75],['parceria farm não pago','outsider',false,true,10,10,5,75],
      ['sem parceria farm pago','outsider',true,false,10,10,10,70],['sem parceria farm não pago','outsider',false,false,10,15,5,70]
    ];
    const failures=[];for(const [name,cat,farm,partner,m,l,w,n] of cases){const result=calculateWash(10000,cat,farm,partner);if(result.rates.machine!==m||result.rates.legacy!==l||result.rates.washer!==w||result.rates.net!==n||result.grossCents!==result.machineCents+result.legacyCents+result.washerCents+result.netCents)failures.push(name);}
    const sale=calculateSale(101);if(sale.sellerCents!==50||sale.legacyCents!==51||sale.sellerCents+sale.legacyCents!==101)failures.push('divisão de venda');
    return {passed:failures.length===0,failures,total:7};
  }
  function setDiscordNotice(){
    const notice=$('#system-notice'),pill=$('#connection-pill'),login=$('#discord-login'),shell=$('#app-shell'),overlay=$('#auth-overlay');
    if(discordStatus.authConfigured){
      pill.innerHTML='<i></i> Banco compartilhado';pill.classList.add('discord');
      $('#logout-button').classList.toggle('hidden',!discordStatus.authenticated);
      if(discordStatus.authenticated){notice.classList.add('hidden');overlay.classList.add('hidden');shell.classList.remove('auth-pending');$('#user-name').textContent=discordStatus.user?.username||'';$('.user-avatar').textContent=(discordStatus.user?.username||'L').trim().charAt(0).toUpperCase();}
      else{notice.classList.add('hidden');shell.classList.add('auth-pending');overlay.classList.remove('hidden');$('#auth-message').textContent='Entre com sua conta Discord para verificar se possui um cargo autorizado.';login.classList.remove('hidden');$('#retry-auth').classList.add('hidden');}
    }else{
      pill.innerHTML='<i></i> Sem conexão';pill.classList.remove('discord');$('#logout-button').classList.add('hidden');
      notice.textContent='O painel publicado precisa do login Discord e do banco D1. Os registros não são armazenados neste navegador.';
      notice.classList.toggle('hidden',!discordStatus.checked);overlay.classList.add('hidden');shell.classList.remove('auth-pending');$('#user-name').textContent='';$('.user-avatar').textContent='L';
    }
    const status=$('#discord-status');
    if(discordStatus.authConfigured&&discordStatus.authenticated)status.textContent=`Acesso verificado para ${discordStatus.user?.username||'membro LEGACY'}. Os registros são compartilhados pelo banco D1.${discordStatus.logsConfigured?' Logs Discord configurados.':' Confira a configuração dos webhooks no Cloudflare.'}`;
    else if(discordStatus.authConfigured)status.textContent='Acesso Discord restrito aos cargos autorizados. Os registros financeiros são consultados no banco compartilhado.';
    else status.textContent='O painel publicado exige autenticação Discord e o banco D1 vinculado ao Cloudflare Pages.';
  }
  async function apiRequest(path,options={}){
    const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    if(response.status===401){location.href='/api/auth/login';throw new Error('Sessão expirada. Entre novamente pelo Discord.');}
    if(!response.ok)throw new Error(body.error||`Falha ao acessar o servidor (HTTP ${response.status}).`);
    return body;
  }
  async function loadSharedOperations(){
    const all=[];let offset=0,total=0;const limit=500;
    do{const page=await apiRequest(`/api/operations?limit=${limit}&offset=${offset}`);if(!Array.isArray(page.operations))throw new Error('Resposta inválida do banco compartilhado.');all.push(...page.operations);total=Number(page.total)||0;offset+=page.operations.length;if(!page.operations.length)break;}while(offset<total);
    state.operations=all.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    return state.operations;
  }
  async function loadSharedProducts(){
    const response=await apiRequest('/api/products');
    if(!Array.isArray(response.products))throw new Error('O catálogo compartilhado não retornou uma lista válida. Execute a migração de produtos no D1.');
    state.products=response.products;
    return state.products;
  }
  async function checkDiscord(){
    const localPreview=location.protocol==='file:'||['localhost','127.0.0.1'].includes(location.hostname);
    try{
      const response=await fetch('/api/session',{credentials:'same-origin',headers:{'Accept':'application/json'}});
      if(!response.ok)throw new Error('API indisponível');
      const data=await response.json();
      discordStatus={checked:true,authConfigured:!!data.authConfigured,authenticated:!!data.authenticated,logsConfigured:!!data.logsConfigured,user:data.user||null};
    }catch(_){discordStatus=localPreview?{checked:true,authConfigured:false,authenticated:false,logsConfigured:false,user:null}:{checked:true,authConfigured:true,authenticated:false,logsConfigured:false,user:null,unavailable:true};}
    setDiscordNotice();
    if(discordStatus.authConfigured&&!discordStatus.authenticated){
      $('.view.active')?.classList.remove('active');
      if(discordStatus.unavailable){$('#auth-message').textContent='Não foi possível verificar o acesso. Tente novamente quando o serviço estiver disponível.';$('#discord-login').classList.add('hidden');$('#retry-auth').classList.remove('hidden');}
      return;
    }
    if(discordStatus.authenticated){
      try{await Promise.all([loadSharedOperations(),loadSharedProducts()]);renderAll();$('#connection-pill').innerHTML='<i></i> Banco compartilhado';}
      catch(error){$('#connection-pill').innerHTML='<i></i> Banco indisponível';$('#system-notice').textContent=`Não foi possível carregar o banco compartilhado: ${error.message}`;$('#system-notice').classList.remove('hidden');showToast(error.message,'error');}
      setInterval(async()=>{if(document.visibilityState==='visible'){try{await Promise.all([loadSharedOperations(),loadSharedProducts()]);renderAll();}catch(_){}}},30000);
      document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'){try{await Promise.all([loadSharedOperations(),loadSharedProducts()]);renderAll();}catch(_){}}});
    }
  }
  async function createRemoteOperation(payload){
    const result=await apiRequest('/api/operations',{method:'POST',body:JSON.stringify(payload)});
    await Promise.all([loadSharedOperations(),loadSharedProducts()]);renderAll();
    const failed=(result.webhooks||[]).filter(item=>!item.sent);
    return {operation:result.operation,webhooks:result.webhooks||[],failed};
  }

  function visibleOperations(period='all'){
    const now=new Date();let start=null;if(period==='today'){start=new Date(now.getFullYear(),now.getMonth(),now.getDate());}else if(period!=='all'){start=new Date();start.setDate(start.getDate()-Number(period)+1);start.setHours(0,0,0,0);}return state.operations.filter(op=>!start||new Date(op.createdAt)>=start).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  }
  function refreshDashboard(){
    const ops=visibleOperations($('#dashboard-period').value), washes=ops.filter(o=>o.type==='wash'),sales=ops.filter(o=>o.type==='sale');
    const sum=(list,field)=>list.reduce((t,o)=>t+asInt(o[field]),0);
    $('#stat-moved').textContent=centsToMoney(sum(ops,'grossCents'));$('#stat-machine').textContent=centsToMoney(sum(washes,'machineCents'));$('#stat-legacy').textContent=centsToMoney(sum(ops,'legacyCents'));$('#stat-sellers').textContent=centsToMoney(sum(sales,'sellerCents')+sum(washes,'washerCents'));$('#stat-count').textContent=String(ops.length);$('#stat-washed').textContent=centsToMoney(sum(washes,'grossCents'));$('#stat-members').textContent=centsToMoney(sum(washes,'netCents'));$('#stat-sales').textContent=centsToMoney(sum(sales,'grossCents'));
    const recent=$('#recent-list');if(!ops.length)recent.innerHTML='<p class="empty-state">Nenhuma operação registrada neste período.</p>';else recent.innerHTML=ops.slice(0,5).map(o=>`<button class="recent-item" data-operation="${escapeHtml(o.id)}"><span class="recent-symbol">${o.type==='wash'?'↗':'▤'}</span><span class="recent-copy"><strong>${escapeHtml(o.responsible)}</strong><small>${o.type==='wash'?'Lavagem':'Venda'} · ${escapeHtml(formatDate(o.createdAt))}</small></span><span class="recent-value">${centsToMoney(o.grossCents)}</span></button>`).join('');
    recent.querySelectorAll('[data-operation]').forEach(btn=>btn.addEventListener('click',()=>openDetails(btn.dataset.operation)));
    const ranking=$('#wash-leaderboard');
    if(ranking){const totals=new Map();for(const op of washes){const key=op.creatorId||op.creatorName||'sem-identificacao';const item=totals.get(key)||{name:op.creatorName||'Membro LEGACY',amount:0,count:0};item.amount+=asInt(op.grossCents);item.count++;totals.set(key,item);}const rows=[...totals.values()].sort((a,b)=>b.amount-a.amount).slice(0,8);ranking.innerHTML=rows.length?rows.map((item,index)=>`<div class="ranking-item"><span class="ranking-position">${index+1}</span><span class="recent-copy"><strong>${escapeHtml(item.name)}</strong><small>${item.count} lavagem(ns) registrada(s)</small></span><strong class="ranking-value">${centsToMoney(item.amount)}</strong></div>`).join(''):'<p class="empty-state">Ainda não há lavagens neste período.</p>';}
    drawChart(ops);
  }
  function drawChart(ops){
    const canvas=$('#movement-chart'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;if(!rect.width||!rect.height)return;canvas.width=Math.floor(rect.width*ratio);canvas.height=Math.floor(rect.height*ratio);ctx.scale(ratio,ratio);const w=rect.width,h=rect.height,pad={l:10,r:12,t:15,b:28};ctx.clearRect(0,0,w,h);
    const isAll=$('#dashboard-period').value==='all';const today=new Date();today.setHours(0,0,0,0);const earliest=isAll&&ops.length?new Date(Math.min(...ops.map(op=>new Date(op.createdAt).getTime()))):today;earliest.setHours(0,0,0,0);const days=isAll?Math.max(1,Math.ceil((today-earliest)/86400000)+1):($('#dashboard-period').value==='today'?1:Number($('#dashboard-period').value));const bins=Math.min(14,Math.max(1,days));const start=new Date(today);start.setDate(start.getDate()-(days-1));const values=Array(bins).fill(0);for(const op of ops){const d=new Date(op.createdAt);const ix=Math.floor((d-start)/(86400000)/(days/bins));if(ix>=0&&ix<bins)values[ix]+=op.grossCents/100;}
    const max=Math.max(...values,1);const usableW=w-pad.l-pad.r,usableH=h-pad.t-pad.b;ctx.font='10px DM Sans, sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';for(let i=0;i<4;i++){const y=pad.t+usableH*i/3;ctx.strokeStyle='#292a30';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillStyle='#787981';ctx.fillText(i===0?'R$ '+Math.round(max).toLocaleString('pt-BR'):i===3?'0':'',w-pad.r,y-8);}
    const step=usableW/bins;values.forEach((value,i)=>{const barW=Math.max(5,step*.48),barH=value/max*(usableH-5),x=pad.l+i*step+(step-barW)/2,y=pad.t+usableH-barH;const grad=ctx.createLinearGradient(0,y,0,pad.t+usableH);grad.addColorStop(0,'#c44a55');grad.addColorStop(1,'#65202a');ctx.fillStyle=grad;ctx.beginPath();const r=Math.min(5,barW/2);ctx.roundRect(x,y,barW,Math.max(barH,2),[r,r,0,0]);ctx.fill();});ctx.textAlign='center';ctx.fillStyle='#797a82';const labelStep=Math.max(1,Math.ceil(bins/7));for(let i=0;i<bins;i+=labelStep){const d=new Date(start);d.setDate(d.getDate()+Math.floor(i*days/bins));ctx.fillText(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`,pad.l+i*step+step/2,h-9);}
    $('#chart-empty').classList.toggle('hidden',ops.length>0);
  }
  function validateWashForm(){const name=$('#wash-name').value.trim(),cents=getCents($('#wash-gross'));if(!name){showToast('Informe o nome de quem está lavando.','error');$('#wash-name').focus();return null;}if(cents===null||cents<=0){showToast('Informe um valor bruto maior que zero e dentro do limite aceito.','error');return null;}const category=$('#wash-category').value,farm=$('#wash-farm').value==='yes',partnership=category==='outsider'&&$('#wash-partnership').value==='yes';return {name,cents,category,farm,partnership,notes:$('#wash-notes').value.trim()};}
  function calcCurrentWash(){const data=validateWashForm();if(!data)return;let calc;try{calc=calculateWash(data.cents,data.category,data.farm,data.partnership);}catch(error){showToast(error.message,'error');return;}pendingWash={...data,...calc};renderWashPreview(pendingWash);$('#register-wash').disabled=false;$('#preview-status').textContent='Prévia calculada';}
  function renderWashPreview(op){const isMember=op.category==='member',personLabel=isMember?'Membro (líquido)':'Cliente (líquido)',rows=[['Valor bruto',op.grossCents,100],['Máquina',op.machineCents,op.rates.machine],['LEGACY / caixa',op.legacyCents,op.rates.legacy],['Lavador',op.washerCents,op.rates.washer],['Total de taxas',op.totalFeesCents,100-op.rates.net]];let html=rows.map(([label,value,rate])=>`<div class="split-row ${label==='Total de taxas'?'total':''}"><span>${label}<small>${rate}% do valor bruto</small></span><strong>${centsToMoney(value)}</strong></div>`).join('');html+=`<div class="split-row net"><span>${personLabel}<small>${op.rates.net}% líquido</small></span><strong>${centsToMoney(op.netCents)}</strong></div>`;$('#wash-preview').innerHTML=html;let rule='';if(op.category==='member')rule=op.farm?'Membro LEGACY com farm pago: máquina 10%, caixa LEGACY 0%, membro 90%.':'Membro LEGACY sem farm pago: máquina 10%, caixa LEGACY 10%, membro 80%.';else if(op.partnership)rule=op.farm?'Pessoa de fora com parceria e farm pago: máquina 10%, lavador 10%, LEGACY 5%, cliente 75%.':'Pessoa de fora com parceria e farm não pago: máquina 10%, lavador 5%, LEGACY 10%, cliente 75%.';else rule=op.farm?'Pessoa de fora sem parceria e farm pago: máquina 10%, lavador 10%, LEGACY 10%, cliente 70%.':'Pessoa de fora sem parceria e farm não pago: máquina 10%, lavador 5%, LEGACY 15%, cliente 70%.';$('#wash-rule-note').textContent=rule;}
  function invalidateWashPreview(){pendingWash=null;$('#register-wash').disabled=true;$('#preview-status').textContent='Aguardando cálculo';}
  async function createWash(){
    const fresh=validateWashForm();if(!fresh)return;
    if(!pendingWash||pendingWash.name!==fresh.name||pendingWash.cents!==fresh.cents||pendingWash.category!==fresh.category||pendingWash.farm!==fresh.farm||pendingWash.partnership!==fresh.partnership||pendingWash.notes!==fresh.notes){showToast('Os dados mudaram. Calcule novamente antes de registrar.','error');invalidateWashPreview();return;}
    const confirmation=`Registrar lavagem de ${fresh.name} no valor bruto de ${centsToMoney(pendingWash.grossCents)}?\n\nLíquido: ${centsToMoney(pendingWash.netCents)} · LEGACY: ${centsToMoney(pendingWash.legacyCents)} · Máquina: ${centsToMoney(pendingWash.machineCents)}`;
    if(!window.confirm(confirmation))return;
    const button=$('#register-wash');button.disabled=true;button.textContent='Registrando…';
    try{
      const result=await createRemoteOperation({type:'wash',responsible:fresh.name,grossCents:fresh.cents,category:fresh.category,farmPaid:fresh.farm,partnership:fresh.category==='outsider'?fresh.partnership:false,notes:fresh.notes});
      invalidateWashPreview();$('#wash-form').reset();currencyInputSet($('#wash-gross'));$('#partnership-field').classList.add('hidden');
      if(result.failed.length)showToast(`Lavagem salva no banco compartilhado, mas ${result.failed.length} webhook(ns) falharam. Confira os Secrets e o canal no Cloudflare.`,'error');
      else showToast('Lavagem registrada no banco compartilhado e enviada aos canais Discord.');
    }catch(error){showToast(error.message||'Não foi possível registrar a lavagem.','error');}
    finally{button.textContent='Registrar operação';button.disabled=!pendingWash;}
  }
  function getSelectedProduct(){return state.products.find(item=>item.id===$('#sale-product').value)||null;}
  function currentUnitCents(product=getSelectedProduct()){
    if(!product)return 0;
    return $('#sale-partnership').value==='yes'?asInt(product.partnershipPriceCents):asInt(product.standardPriceCents);
  }
  function updateSaleUnit(){
    const input=$('#sale-unit'), cents=currentUnitCents();
    currencyInputSet(input,String(Math.floor(cents/100)),String(cents%100).padStart(2,'0'),'integer');
    $('#add-to-cart').disabled=!getSelectedProduct()||cents<=0||cart.length>=MAX_CART_LINES;
  }
  function updateSalePreview(){
    const total=cart.reduce((sum,line)=>sum+line.quantity*line.unitCents,0);
    if(!Number.isSafeInteger(total)){showToast('O total da compra excede o limite aceito.','error');return;}
    const shares=total>0?calculateSale(total):{sellerCents:0,legacyCents:0};
    $('#sale-total').textContent=centsToMoney(total);$('#sale-seller-share').textContent=centsToMoney(shares.sellerCents);$('#sale-legacy-share').textContent=centsToMoney(shares.legacyCents);
    $('#register-sale').disabled=cart.length===0||total<=0;
  }
  function renderCart(){
    const body=$('#sale-cart-body');
    body.innerHTML=cart.map((line,index)=>`<tr><td>${escapeHtml(line.name)}</td><td>${line.quantity}</td><td>${centsToMoney(line.unitCents)}</td><td>${centsToMoney(line.unitCents*line.quantity)}</td><td><button class="cart-remove" type="button" data-remove-cart="${index}" aria-label="Remover ${escapeHtml(line.name)}">Remover</button></td></tr>`).join('');
    $('#cart-empty').classList.toggle('hidden',cart.length>0);$('#cart-count').textContent=`${cart.reduce((n,line)=>n+line.quantity,0)} unidade(s) · ${cart.length} produto(s)`;
    body.querySelectorAll('[data-remove-cart]').forEach(button=>button.addEventListener('click',()=>{cart.splice(Number(button.dataset.removeCart),1);renderCart();updateSalePreview();updateSaleUnit();}));
    updateSalePreview();
  }
  function addCartItem(){
    const product=getSelectedProduct(),quantity=Number($('#sale-quantity').value),unitCents=currentUnitCents();
    if(!product||!Number.isInteger(quantity)||quantity<1||quantity>1000000){showToast('Selecione um produto e informe uma quantidade válida.','error');return;}
    if(!Number.isSafeInteger(unitCents)||unitCents<=0){showToast('Este produto ainda não tem preço configurado para essa condição. Peça a um gerente ou líder para atualizar o catálogo.','error');return;}
    const total=unitCents*quantity+cart.reduce((sum,line)=>sum+line.unitCents*line.quantity,0);
    if(!Number.isSafeInteger(total)){showToast('O total do carrinho excede o limite aceito.','error');return;}
    const same=cart.find(line=>line.productId===product.id&&line.unitCents===unitCents);
    if(same){if(same.quantity+quantity>1000000){showToast('A quantidade excede o limite permitido.','error');return;}same.quantity+=quantity;}
    else {if(cart.length>=MAX_CART_LINES){showToast(`O pedido pode ter até ${MAX_CART_LINES} produtos diferentes.`,'error');return;}cart.push({productId:product.id,name:product.name,quantity,unitCents});}
    $('#sale-quantity').value='1';renderCart();showToast(`${product.name} adicionado ao pedido.`);
  }
  function formatProductPrice(cents){return cents>0?centsToMoney(cents):'Definir preço';}
  function renderProducts(){
    const select=$('#sale-product'),chosen=select.value;
    select.innerHTML=state.products.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    if(state.products.some(item=>item.id===chosen))select.value=chosen;
    $('#product-list').innerHTML=state.products.length?state.products.map(item=>`<div class="product-line"><span class="product-line-info"><strong>${escapeHtml(item.name)}</strong><small>Sem parceria: ${formatProductPrice(item.standardPriceCents)} · Com parceria: ${formatProductPrice(item.partnershipPriceCents)}</small></span><span class="product-actions"><button type="button" data-edit-product="${escapeHtml(item.id)}">Editar</button><button type="button" class="remove" data-delete-product="${escapeHtml(item.id)}">Remover</button></span></div>`).join(''):'<p class="empty-state">Nenhum produto no catálogo.</p>';
    $$('[data-edit-product]').forEach(btn=>btn.addEventListener('click',()=>editProduct(btn.dataset.editProduct)));
    $$('[data-delete-product]').forEach(btn=>btn.addEventListener('click',()=>deleteProduct(btn.dataset.deleteProduct)));
    const canManage=['gerente','lider'].includes(discordStatus.user?.role);
    $('#product-form').classList.toggle('catalog-disabled',!canManage);
    $$('#product-form input, #product-form button').forEach(control=>control.disabled=!canManage);
    renderPriceBoards();updateSaleUnit();
  }
  function renderPriceBoards(){
    const partner=state.products.map(item=>`<div class="standard-price-row"><span>${escapeHtml(item.name)}</span><strong>${formatProductPrice(item.partnershipPriceCents)}</strong></div>`).join('');
    const standard=state.products.map(item=>`<div class="standard-price-row"><span>${escapeHtml(item.name)}</span><strong>${formatProductPrice(item.standardPriceCents)}</strong></div>`).join('');
    $('#partner-price-summary').innerHTML=`<h4>Preços com parceria · catálogo atualizado</h4>${partner||'<p class="empty-state">Catálogo sem itens cadastrados.</p>'}`;
    $('#standard-price-summary').innerHTML=`<h4>Preços sem parceria · catálogo atualizado</h4>${standard||'<p class="empty-state">Catálogo sem itens cadastrados.</p>'}`;
  }
  function setProductForm(product=null){
    editingProductId=product?.id||null;$('#new-product-name').value=product?.name||'';
    currencyInputSet($('#new-product-standard'),String(Math.floor(asInt(product?.standardPriceCents)/100)),String(asInt(product?.standardPriceCents)%100).padStart(2,'0'),'integer');
    currencyInputSet($('#new-product-partner'),String(Math.floor(asInt(product?.partnershipPriceCents)/100)),String(asInt(product?.partnershipPriceCents)%100).padStart(2,'0'),'integer');
    $('#save-product').textContent=editingProductId?'Salvar alterações':'Adicionar produto';$('#cancel-product-edit').classList.toggle('hidden',!editingProductId);
    if(product)$('#new-product-name').focus();
  }
  function editProduct(id){const product=state.products.find(item=>item.id===id);if(product)setProductForm(product);}
  async function saveProduct(event){
    event.preventDefault();if(!['gerente','lider'].includes(discordStatus.user?.role)){showToast('Somente gerente ou líder pode alterar o catálogo.','error');return;}
    const name=$('#new-product-name').value.trim(),standardPriceCents=getCents($('#new-product-standard')),partnershipPriceCents=getCents($('#new-product-partner'));
    if(!name||standardPriceCents===null||partnershipPriceCents===null||(!standardPriceCents&&!partnershipPriceCents)){showToast('Informe o nome e pelo menos um preço maior que zero.','error');return;}
    const body={name,standardPriceCents,partnershipPriceCents};
    try{
      const wasEditing=!!editingProductId;
      if(editingProductId)await apiRequest(`/api/products/${encodeURIComponent(editingProductId)}`,{method:'PUT',body:JSON.stringify(body)});
      else await apiRequest('/api/products',{method:'POST',body:JSON.stringify(body)});
      await loadSharedProducts();renderProducts();setProductForm();showToast(wasEditing?'Produto atualizado no catálogo compartilhado.':'Produto adicionado ao catálogo compartilhado.');
    }catch(error){showToast(error.message||'Não foi possível salvar o produto.','error');}
  }
  async function deleteProduct(id){
    const product=state.products.find(item=>item.id===id);if(!product)return;
    if(!['gerente','lider'].includes(discordStatus.user?.role)){showToast('Somente gerente ou líder pode alterar o catálogo.','error');return;}
    if(!confirm(`Remover “${product.name}” do catálogo compartilhado? Registros anteriores não serão alterados.`))return;
    try{await apiRequest(`/api/products/${encodeURIComponent(id)}`,{method:'DELETE'});cart=cart.filter(line=>line.productId!==id);await loadSharedProducts();renderProducts();renderCart();showToast('Produto removido do catálogo compartilhado.');}
    catch(error){showToast(error.message||'Não foi possível remover o produto.','error');}
  }
  async function registerSale(event){
    event.preventDefault();const name=$('#seller-name').value.trim();
    if(!name){showToast('Informe o nome do vendedor.','error');$('#seller-name').focus();return;}
    if(!cart.length){showToast('Adicione ao menos um produto ao pedido.','error');return;}
    try{
      await loadSharedProducts();
      cart=cart.map(line=>{const product=state.products.find(item=>item.id===line.productId);if(!product)throw new Error(`O produto ${line.name} não está mais no catálogo.`);const unitCents=$('#sale-partnership').value==='yes'?asInt(product.partnershipPriceCents):asInt(product.standardPriceCents);if(unitCents<=0)throw new Error(`O produto ${line.name} não possui preço configurado para essa parceria.`);return {...line,name:product.name,unitCents};});
      renderProducts();renderCart();
    }catch(error){showToast(error.message||'Não foi possível atualizar os preços do pedido.','error');return;}
    const grossCents=cart.reduce((sum,line)=>sum+line.unitCents*line.quantity,0);
    if(!Number.isSafeInteger(grossCents)||grossCents<=0){showToast('O total da venda é inválido.','error');return;}
    const shares=calculateSale(grossCents),partnership=$('#sale-partnership').value==='yes';
    const description=cart.map(line=>`${line.quantity} × ${line.name} — ${centsToMoney(line.unitCents*line.quantity)}`).join('\n');
    if(!confirm(`Registrar compra ${partnership?'com parceria':'sem parceria'} de ${name}?\n\n${description}\n\nTotal: ${centsToMoney(grossCents)}\nVendedor (50%): ${centsToMoney(shares.sellerCents)}\nCaixa LEGACY (50%): ${centsToMoney(shares.legacyCents)}`))return;
    const button=$('#register-sale');button.disabled=true;button.textContent='Registrando…';
    try{
      const result=await createRemoteOperation({type:'sale',responsible:name,partnership,items:cart.map(({productId,quantity,unitCents})=>({productId,quantity,expectedUnitCents:unitCents})),notes:$('#sale-notes').value.trim()});
      cart=[];$('#sales-form').reset();$('#sale-quantity').value='1';renderProducts();renderCart();
      if(result.failed.length)showToast('Venda salva no banco, mas o webhook falhou. Confira o Secret e o canal no Cloudflare.','error');
      else showToast('Compra registrada no D1 compartilhado e enviada ao Discord.');
    }catch(error){showToast(error.message||'Não foi possível registrar a compra.','error');}
    finally{button.textContent='Registrar compra';updateSalePreview();}
  }

  function historyFiltered(){const query=$('#history-search').value.trim().toLowerCase(),type=$('#history-type').value,from=$('#history-from').value,to=$('#history-to').value;return [...state.operations].filter(o=>(type==='all'||o.type===type)&&(!query||String(o.responsible||'').toLowerCase().includes(query)||String(o.creatorName||'').toLowerCase().includes(query))&&(!from||localDateKey(o.createdAt)>=from)&&(!to||localDateKey(o.createdAt)<=to)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
  function renderHistory(){const list=historyFiltered(),body=$('#history-body');body.innerHTML=list.map(o=>`<tr><td class="table-date">${escapeHtml(formatDate(o.createdAt))}</td><td class="table-person">${escapeHtml(o.responsible)}</td><td><span class="type-badge ${o.type==='sale'?'sale':''}">${o.type==='wash'?'Lavagem':'Venda'}</span></td><td>${centsToMoney(o.grossCents)}</td><td>${centsToMoney(o.netCents)}</td><td><button class="row-action" data-open-operation="${escapeHtml(o.id)}">Detalhes</button></td></tr>`).join('');$('#history-empty').classList.toggle('hidden',list.length>0);$$('[data-open-operation]').forEach(btn=>btn.addEventListener('click',()=>openDetails(btn.dataset.openOperation)));}
  function operationDetails(o){const lines=[['Identificador',o.id],['Data e hora',formatDate(o.createdAt)],['Responsável',o.responsible],['Registrado por',o.creatorName||'—'],['Tipo de operação',o.type==='wash'?'Lavagem':'Venda'],['Valor bruto',centsToMoney(o.grossCents)]];if(o.type==='wash'){lines.push(['Categoria',o.category==='member'?'Membro LEGACY':'Pessoa de fora'],['Pagou o farm',o.farmPaid?'Sim':'Não']);if(o.category==='outsider')lines.push(['Parceria',o.partnership?'Sim':'Não']);lines.push(['Máquina',`${centsToMoney(o.machineCents)} (${o.rates?.machine??10}%)`],['Caixa LEGACY',`${centsToMoney(o.legacyCents)} (${o.rates?.legacy??0}%)`],['Lavador',`${centsToMoney(o.washerCents)} (${o.rates?.washer??0}%)`],['Total de taxas',centsToMoney(o.totalFeesCents)],['Valor líquido entregue',centsToMoney(o.netCents)]);}else{const items=Array.isArray(o.items)?o.items:[];lines.push(['Parceria',o.partnership?'Sim':'Não'],['Produtos',items.length?items.map(item=>`${item.quantity} × ${item.name} · ${centsToMoney(item.totalCents)}`).join(' | '):o.product||'—'],['Quantidade total',String(o.quantity||items.reduce((n,item)=>n+item.quantity,0))],['Vendedor (50%)',centsToMoney(o.sellerCents)],['Caixa LEGACY (50%)',centsToMoney(o.legacyCents)],['Valor líquido da operação',centsToMoney(o.netCents)]);}if(o.notes)lines.push(['Observações',o.notes]);return lines;}
  function openDetails(id){const o=state.operations.find(item=>item.id===id);if(!o)return;selectedOperation=o;$('#details-title').textContent=o.type==='wash'?'Lavagem':'Venda de itens';$('#details-content').innerHTML=`<div class="detail-grid">${operationDetails(o).map(([k,v])=>`<div class="detail-line"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>`;$('#delete-operation').classList.toggle('hidden',!['gerente','lider'].includes(discordStatus.user?.role));const dialog=$('#details-dialog');if(!dialog.open)dialog.showModal();}
  function makeReceipt(o){const fields=operationDetails(o);$('#print-area').innerHTML=`<div class="receipt-brand">LEGACY · CIDADE BRAVA</div><h1>Comprovante de ${o.type==='wash'?'lavagem':'venda'}</h1><p>Registro interno · ${escapeHtml(formatDate(o.createdAt))}</p>${fields.map(([k,v])=>`<div class="receipt-line"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}<p class="receipt-note">Este comprovante foi gerado pelo painel financeiro LEGACY.</p>`;window.print();}
  async function deleteSelected(){
    if(!selectedOperation)return;
    if(!['gerente','lider'].includes(discordStatus.user?.role)){showToast('Somente gerente ou líder pode excluir operações.','error');return;}
    if(!confirm(`Excluir o registro ${selectedOperation.id} do histórico compartilhado? Esta ação não pode ser desfeita.`))return;
    try{await apiRequest(`/api/operations?id=${encodeURIComponent(selectedOperation.id)}`,{method:'DELETE'});$('#details-dialog').close();selectedOperation=null;await Promise.all([loadSharedOperations(),loadSharedProducts()]);renderAll();showToast('Registro excluído do banco compartilhado.');}
    catch(error){showToast(error.message||'Não foi possível excluir o registro.','error');}
  }

  function getReportRange(kind,ref){const d=new Date(`${ref||localDateKey(new Date())}T12:00:00`);if(kind==='day'){return {start:new Date(d.getFullYear(),d.getMonth(),d.getDate()),end:new Date(d.getFullYear(),d.getMonth(),d.getDate()+1),label:localDateKey(d)};}if(kind==='week'){const start=new Date(d.getFullYear(),d.getMonth(),d.getDate());const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day);const end=new Date(start);end.setDate(end.getDate()+7);return {start,end,label:`${localDateKey(start)} a ${localDateKey(new Date(end.getTime()-86400000))}`};}const start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,1);return {start,end,label:`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`};}
  function refreshReport(){const range=getReportRange($('#report-period').value,$('#report-date').value),ops=state.operations.filter(o=>new Date(o.createdAt)>=range.start&&new Date(o.createdAt)<range.end),w=ops.filter(o=>o.type==='wash'),s=ops.filter(o=>o.type==='sale'),sum=(list,field)=>list.reduce((n,o)=>n+asInt(o[field]),0);$('#report-washed').textContent=centsToMoney(sum(w,'grossCents'));$('#report-machine').textContent=centsToMoney(sum(w,'machineCents'));$('#report-legacy').textContent=centsToMoney(sum(ops,'legacyCents'));$('#report-members').textContent=centsToMoney(sum(w,'netCents'));$('#report-sellers').textContent=centsToMoney(sum(s,'sellerCents')+sum(w,'washerCents'));$('#report-commission-breakdown').textContent=`Vendedores ${centsToMoney(sum(s,'sellerCents'))} + lavadores ${centsToMoney(sum(w,'washerCents'))}`;$('#report-sales').textContent=centsToMoney(sum(s,'grossCents'));const grouped={};for(const o of ops){const key=localDateKey(o.createdAt);grouped[key]??={wash:0,sale:0,machine:0,legacy:0,commission:0,moved:0};const g=grouped[key];g[o.type==='wash'?'wash':'sale']+=o.grossCents;g.machine+=o.machineCents;g.legacy+=o.legacyCents;g.commission+=asInt(o.washerCents)+asInt(o.sellerCents);g.moved+=o.grossCents;}const keys=Object.keys(grouped).sort((a,b)=>b.localeCompare(a));$('#report-body').innerHTML=keys.map(k=>`<tr><td>${escapeHtml(k)}</td><td>${centsToMoney(grouped[k].wash)}</td><td>${centsToMoney(grouped[k].sale)}</td><td>${centsToMoney(grouped[k].machine)}</td><td>${centsToMoney(grouped[k].legacy)}</td><td>${centsToMoney(grouped[k].commission)}</td><td>${centsToMoney(grouped[k].moved)}</td></tr>`).join('');$('#report-empty').classList.toggle('hidden',keys.length>0);}
  function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
  function downloadCsv(filename,headers,rows){const csv='\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');downloadBlob(filename,csv,'text/csv;charset=utf-8');}
  function downloadBlob(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportHistory(){const ops=historyFiltered();const headers=['ID','Data e hora','Responsável','Tipo','Categoria/produto','Pagou farm','Parceria','Quantidade','Valor bruto (centavos)','Máquina (centavos)','LEGACY (centavos)','Lavador (centavos)','Vendedor (centavos)','Valor líquido (centavos)','Total taxas (centavos)','Observações'];const rows=ops.map(o=>[o.id,o.createdAt,o.responsible,o.type==='wash'?'Lavagem':'Venda',o.type==='wash'?o.category:o.product,o.type==='wash'?(o.farmPaid?'Sim':'Não'):'',o.type==='wash'?(o.partnership?'Sim':'Não'):'',o.quantity||'',o.grossCents,o.machineCents,o.legacyCents,o.washerCents,o.sellerCents,o.netCents,o.totalFeesCents,o.notes]);downloadCsv('legacy-historico.csv',headers,rows);}
  function exportReport(){const range=getReportRange($('#report-period').value,$('#report-date').value),ops=state.operations.filter(o=>new Date(o.createdAt)>=range.start&&new Date(o.createdAt)<range.end),headers=['ID','Data e hora','Responsável','Tipo','Bruto (centavos)','Máquina (centavos)','LEGACY (centavos)','Lavador (centavos)','Vendedor (centavos)','Líquido (centavos)'],rows=ops.map(o=>[o.id,o.createdAt,o.responsible,o.type,o.grossCents,o.machineCents,o.legacyCents,o.washerCents,o.sellerCents,o.netCents]);downloadCsv(`legacy-relatorio-${range.label.replace(/[^0-9a-z-]/gi,'_')}.csv`,headers,rows);}
  function exportBackup(){
    const payload={app:'LEGACY Financeiro',version:3,exportedAt:new Date().toISOString(),storage:'Cloudflare D1 compartilhado',operations:state.operations,products:state.products};
    downloadBlob(`legacy-backup-${localDateKey(new Date())}.json`,JSON.stringify(payload,null,2),'application/json');
  }

  function clearAllData(){if(!confirm('ATENÇÃO: apagar todas as operações e produtos personalizados deste navegador?'))return;if(!confirm('Confirma a exclusão definitiva dos dados locais?'))return;state=emptyState();saveState();renderAll();showToast('Dados locais apagados.');}
  function renderAll(){renderProducts();refreshDashboard();renderHistory();refreshReport();}
  const TITLES={dashboard:'Visão geral',wash:'Nova lavagem',sales:'Venda de itens',prices:'Tabela de preços',history:'Histórico',reports:'Relatórios',settings:'Produtos e dados'};
  function navigate(view){if(!TITLES[view])return;$$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));$$('.nav-item[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#page-title').textContent=TITLES[view];$('#sidebar').classList.remove('open');if(view==='dashboard')refreshDashboard();if(view==='history')renderHistory();if(view==='reports')refreshReport();}
  function bindEvents(){
    $$('.nav-item[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));$$('[data-go]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.go)));
    $('#menu-toggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));document.addEventListener('click',e=>{if(window.innerWidth<=760&&!$('#sidebar').contains(e.target)&&!$('#menu-toggle').contains(e.target))$('#sidebar').classList.remove('open');});
    $('#dashboard-period').addEventListener('change',refreshDashboard);$('#wash-category').addEventListener('change',()=>{const outside=$('#wash-category').value==='outsider';$('#partnership-field').classList.toggle('hidden',!outside);invalidateWashPreview();});$('#wash-form').addEventListener('input',invalidateWashPreview);$('#wash-form').addEventListener('change',invalidateWashPreview);$('#calculate-wash').addEventListener('click',calcCurrentWash);$('#register-wash').addEventListener('click',createWash);
    $$('.money-input').forEach(input=>input.addEventListener('legacy-money-change',()=>{invalidateWashPreview();updateSalePreview();}));
    $('#sales-form').addEventListener('submit',registerSale);$('#sale-quantity').addEventListener('input',updateSalePreview);$('#sale-product').addEventListener('change',updateSaleUnit);$('#sale-partnership').addEventListener('change',updateSaleUnit);$('#add-to-cart').addEventListener('click',addCartItem);$('#clear-cart').addEventListener('click',()=>{if(!cart.length)return;if(confirm('Esvaziar todos os produtos deste pedido?')){cart=[];renderCart();}});
    for(const id of ['history-search','history-type','history-from','history-to'])$('#'+id).addEventListener('input',renderHistory);$('#clear-history-filters').addEventListener('click',()=>{$('#history-search').value='';$('#history-type').value='all';$('#history-from').value='';$('#history-to').value='';renderHistory();});$('#export-history').addEventListener('click',exportHistory);$('#report-period').addEventListener('change',refreshReport);$('#report-date').addEventListener('change',refreshReport);$('#refresh-report').addEventListener('click',refreshReport);$('#export-report').addEventListener('click',exportReport);
    $('#product-form').addEventListener('submit',saveProduct);$('#cancel-product-edit').addEventListener('click',()=>setProductForm());$('#backup-export').addEventListener('click',exportBackup);
    $('#details-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});$$('[data-close-dialog]').forEach(btn=>btn.addEventListener('click',()=>$('#details-dialog').close()));$('#print-receipt').addEventListener('click',()=>{if(selectedOperation)makeReceipt(selectedOperation);});$('#delete-operation').addEventListener('click',deleteSelected);$('#logout-button').addEventListener('click',async()=>{try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}catch(_){}location.reload();});$('#retry-auth').addEventListener('click',()=>location.reload());
    window.addEventListener('resize',()=>{if($('#view-dashboard').classList.contains('active'))drawChart(visibleOperations($('#dashboard-period').value));});
  }
  function init(){initMoneyInputs();bindEvents();$('#report-date').value=localDateKey(new Date());const test=runCalculationTests(),testEl=$('#calculation-test-status');testEl.textContent=test.passed?`✓ Testes de cálculo: ${test.total}/${test.total} passaram (6 regras de lavagem + venda).`:`Falha nos testes: ${test.failures.join(', ')}`;testEl.classList.toggle('fail',!test.passed);renderAll();checkDiscord();}
  window.LEGACYFinance={calculateWash,calculateSale,runCalculationTests};
  document.addEventListener('DOMContentLoaded',init);
})();
