
const KEY='haccp_pwa_v1';

const defaults={
  prodotti:[],
  temperature:[],
  frigoriferi:[
    {id:'f1',nome:'Frigo Pesce',tipo:'Frigorifero',min:0,max:4,posizione:'Cucina'},
    {id:'f2',nome:'Frigo Carne',tipo:'Frigorifero',min:0,max:4,posizione:'Cucina'},
    {id:'f3',nome:'Congelatore 1',tipo:'Congelatore',min:-24,max:-18,posizione:'Cucina'}
  ]
};

let data=(()=>{
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
    const merged={...defaults,...saved};
    if(!Array.isArray(merged.frigoriferi) || merged.frigoriferi.length===0){
      merged.frigoriferi=structuredClone(defaults.frigoriferi);
    }
    merged.frigoriferi=merged.frigoriferi.map(f=>({
      id:f.id||id(),
      nome:f.nome||'Attrezzatura',
      tipo:f.tipo || ((Number(f.max)<=-10)?'Congelatore':'Frigorifero'),
      min:Number(f.min),
      max:Number(f.max),
      posizione:f.posizione||''
    }));
    return merged;
  }catch{
    return structuredClone(defaults);
  }
})();

let view='dashboard';

const save=()=>localStorage.setItem(KEY,JSON.stringify(data));
const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const id=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random();
const fmt=d=>d?new Date(d+(d.length===10?'T12:00:00':'')).toLocaleDateString('it-IT'):'-';
const fmtDT=d=>new Date(d).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'});

function daysTo(iso){
  if(!iso)return null;
  let a=new Date();a.setHours(0,0,0,0);
  let b=new Date(iso+'T12:00:00');b.setHours(0,0,0,0);
  return Math.round((b-a)/86400000);
}

function badge(iso){
  const d=daysTo(iso);
  if(d===null)return '<span class="badge">Nessuna scadenza</span>';
  if(d<0)return `<span class="badge danger">Scaduto da ${Math.abs(d)} gg</span>`;
  if(d===0)return '<span class="badge danger">Scade oggi</span>';
  if(d<=3)return `<span class="badge warn">Scade tra ${d} gg</span>`;
  return `<span class="badge">Scade ${fmt(iso)}</span>`;
}

function icon(c=''){
  c=c.toLowerCase();
  if(c.includes('pesce'))return'🐟';
  if(c.includes('carne'))return'🥩';
  if(c.includes('latt'))return'🥛';
  if(c.includes('orto'))return'🥬';
  if(c.includes('surg'))return'❄️';
  return'📦';
}

function equipIcon(tipo=''){
  return tipo.toLowerCase().includes('congel') ? '❄️' : '🧊';
}

function lastTemp(fid){
  return data.temperature.filter(x=>x.frigoId===fid).sort((a,b)=>b.ts.localeCompare(a.ts))[0];
}

function isOut(f,t){
  return t && (Number(t.valore)<Number(f.min)||Number(t.valore)>Number(f.max));
}

function render(){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const el=document.getElementById('view');
  if(view==='dashboard')el.innerHTML=dashboard();
  if(view==='magazzino')el.innerHTML=magazzino();
  if(view==='scadenze')el.innerHTML=scadenze();
  if(view==='temperature')el.innerHTML=temperature();
  if(view==='altro')el.innerHTML=altro();
  if(view==='attrezzature')el.innerHTML=attrezzature();
  bind();
}

function dashboard(){
  const crit=data.prodotti.filter(p=>{const d=daysTo(p.scadenza);return d!==null&&d<=7}).length;
  const temps=data.frigoriferi.map(f=>{
    const t=lastTemp(f.id);
    const out=isOut(f,t);
    return `<div class="card">
      <b>${equipIcon(f.tipo)} ${esc(f.nome)}</b>
      <div class="metric ${out?'danger':'ok'}">${t?t.valore.toFixed(1)+' °C':'--'}</div>
      <div class="sub">${esc(f.tipo)} • Limiti ${f.min} / ${f.max} °C${f.posizione?' • '+esc(f.posizione):''}</div>
      <div class="sub">${t?fmtDT(t.ts):'Nessuna rilevazione'}</div>
    </div>`;
  }).join('');

  return `<section class="hero"><h2>Buongiorno 👨‍🍳</h2><p>Controllo HACCP rapido della cucina</p></section>
  <div class="grid">
    <div class="card"><b>Scadenze critiche</b><div class="metric ${crit?'danger':'ok'}">${crit}</div><div class="sub">entro 7 giorni o già scadute</div></div>
    <div class="card"><b>Attrezzature</b><div class="metric">${data.frigoriferi.length}</div><div class="sub">frigoriferi e congelatori</div></div>
  </div>
  <div class="title"><h2>Temperature</h2><button data-act="newT">+ Registra</button></div>
  <div class="grid">${temps||'<div class="empty">Aggiungi prima un frigorifero o congelatore.</div>'}</div>
  <div class="title"><h2>Azioni rapide</h2></div>
  <div class="grid">
    <button data-act="newP">➕ Nuovo prodotto</button>
    <button class="ghost" data-act="goEquip">🧊 Gestisci attrezzature</button>
  </div>`;
}

function invItems(items){
  if(!items.length)return'<div class="empty">Nessun prodotto registrato.</div>';
  return items.map(p=>`<div class="item">
    <div class="icon">${icon(p.categoria)}</div>
    <div class="grow">
      <div class="name">${esc(p.nome)}</div>
      <div class="sub">${esc(p.categoria)} • Lotto ${esc(p.lotto)}${p.posizione?'<br>'+esc(p.posizione):''}</div>
      ${badge(p.scadenza)}
    </div>
    <button class="dangerBtn" data-del="${p.id}">✕</button>
  </div>`).join('');
}

function magazzino(){
  return `<div class="title"><h2>Magazzino</h2><button data-act="newP">+ Nuovo</button></div>
  <input id="search" class="search" placeholder="Cerca prodotto, lotto, categoria...">
  <div id="inv" class="list" style="margin-top:12px">${invItems([...data.prodotti].sort((a,b)=>(a.scadenza||'9999').localeCompare(b.scadenza||'9999')))}</div>`;
}

function scadenze(){
  return `<div class="title"><h2>Scadenze</h2></div>
  <div class="list">${invItems([...data.prodotti].filter(p=>p.scadenza).sort((a,b)=>a.scadenza.localeCompare(b.scadenza)))}</div>`;
}

function temperatures(){
  const list=[...data.temperature].sort((a,b)=>b.ts.localeCompare(a.ts));
  return `<div class="title"><h2>Registro temperature</h2><button data-act="newT">+ Registra</button></div>
  ${data.frigoriferi.length===0?'<div class="card"><b>Nessuna attrezzatura configurata</b><div class="sub">Aggiungi un frigorifero o congelatore prima di registrare le temperature.</div><br><button data-act="goEquip">Gestisci attrezzature</button></div>':''}
  <div class="list" style="margin-top:12px">${list.length?list.map(t=>{
    const f=data.frigoriferi.find(x=>x.id===t.frigoId);
    const out=f?isOut(f,t):false;
    return `<div class="item">
      <div class="icon">🌡️</div>
      <div class="grow">
        <div class="name">${esc(f?.nome||'Attrezzatura rimossa')}</div>
        <div class="sub">${fmtDT(t.ts)}${t.operatore?' • '+esc(t.operatore):''}</div>
        <span class="badge ${out?'danger':''}">${t.valore.toFixed(1)} °C ${out?'• FUORI LIMITE':'• OK'}</span>
        ${t.note?'<div class="sub">'+esc(t.note)+'</div>':''}
      </div>
    </div>`;
  }).join(''):'<div class="empty">Nessuna temperatura registrata.</div>'}</div>`;
}

function attrezzature(){
  const fr=data.frigoriferi.filter(f=>f.tipo==='Frigorifero');
  const cg=data.frigoriferi.filter(f=>f.tipo==='Congelatore');
  const card=f=>`<div class="item">
    <div class="icon">${equipIcon(f.tipo)}</div>
    <div class="grow">
      <div class="name">${esc(f.nome)}</div>
      <div class="sub">${esc(f.tipo)} • Limiti ${f.min} / ${f.max} °C${f.posizione?' • '+esc(f.posizione):''}</div>
    </div>
    <button class="ghost" data-edit-eq="${f.id}">✏️</button>
    <button class="dangerBtn" data-del-eq="${f.id}">✕</button>
  </div>`;
  return `<div class="title"><h2>Attrezzature</h2><button data-act="newEquip">+ Aggiungi</button></div>
  <div class="card">
    <b>Configura tutti i tuoi frigoriferi e congelatori</b>
    <div class="sub">Ogni apparecchio può avere nome, tipo, posizione e limiti di temperatura diversi.</div>
  </div>
  <div class="title"><h2>Frigoriferi (${fr.length})</h2></div>
  <div class="list">${fr.length?fr.map(card).join(''):'<div class="empty">Nessun frigorifero.</div>'}</div>
  <div class="title"><h2>Congelatori (${cg.length})</h2></div>
  <div class="list">${cg.length?cg.map(card).join(''):'<div class="empty">Nessun congelatore.</div>'}</div>`;
}

function altro(){
  return `<div class="title"><h2>Altro</h2></div><div class="list">
  <div class="item"><div class="icon">🧊</div><div class="grow"><div class="name">Frigoriferi e congelatori</div><div class="sub">Aggiungi, modifica o elimina le attrezzature e i relativi limiti.</div></div><button data-act="goEquip">Gestisci</button></div>
  <div class="item"><div class="icon">💾</div><div class="grow"><div class="name">Backup dati</div><div class="sub">Scarica una copia JSON.</div></div><button data-act="backup">Esporta</button></div>
  <div class="item"><div class="icon">📄</div><div class="grow"><div class="name">Report temperature</div><div class="sub">Stampa o salva come PDF.</div></div><button data-act="report">Apri</button></div>
  <div class="item"><div class="icon">📱</div><div class="grow"><div class="name">Installazione iPhone</div><div class="sub">Safari → Condividi → Aggiungi alla schermata Home.</div></div></div>
  <div class="item"><div class="icon">🗑️</div><div class="grow"><div class="name">Cancella tutti i dati</div></div><button class="dangerBtn" data-act="reset">Cancella</button></div>
  </div>`;
}

function bind(){
  document.querySelectorAll('[data-act="newP"]').forEach(b=>b.onclick=productModal);
  document.querySelectorAll('[data-act="newT"]').forEach(b=>b.onclick=tempModal);
  document.querySelectorAll('[data-act="newEquip"]').forEach(b=>b.onclick=()=>equipModal());
  document.querySelectorAll('[data-act="goEquip"]').forEach(b=>b.onclick=()=>{view='attrezzature';render()});
  document.querySelectorAll('[data-act="backup"]').forEach(b=>b.onclick=backup);
  document.querySelectorAll('[data-act="report"]').forEach(b=>b.onclick=report);
  document.querySelectorAll('[data-act="reset"]').forEach(b=>b.onclick=()=>{
    if(confirm('Cancellare tutti i dati?')){
      data=structuredClone(defaults);save();render();
    }
  });

  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
    if(confirm('Eliminare questo lotto?')){
      data.prodotti=data.prodotti.filter(p=>p.id!==b.dataset.del);save();render();
    }
  });

  document.querySelectorAll('[data-edit-eq]').forEach(b=>b.onclick=()=>{
    const f=data.frigoriferi.find(x=>x.id===b.dataset.editEq);
    if(f)equipModal(f);
  });

  document.querySelectorAll('[data-del-eq]').forEach(b=>b.onclick=()=>{
    const f=data.frigoriferi.find(x=>x.id===b.dataset.delEq);
    if(!f)return;
    const count=data.temperature.filter(t=>t.frigoId===f.id).length;
    const msg=count
      ? `Eliminare "${f.nome}"? Le ${count} registrazioni già salvate resteranno nello storico.`
      : `Eliminare "${f.nome}"?`;
    if(confirm(msg)){
      data.frigoriferi=data.frigoriferi.filter(x=>x.id!==f.id);
      save();render();
    }
  });

  const s=document.getElementById('search');
  if(s)s.oninput=()=>{
    const q=s.value.toLowerCase();
    document.getElementById('inv').innerHTML=invItems(data.prodotti.filter(p=>
      [p.nome,p.lotto,p.categoria,p.posizione].some(x=>(x||'').toLowerCase().includes(q))
    ));
    bind();
  };
}

function productModal(){
  const m=document.getElementById('modal'),f=document.getElementById('modalForm');
  f.className='modal';
  f.innerHTML=`<h2>Nuovo prodotto / lotto</h2><div class="form">
  <label>Nome<input name="nome" required></label>
  <label>Categoria<select name="categoria"><option>Pesce</option><option>Carne</option><option>Latticini</option><option>Ortofrutta</option><option>Surgelati</option><option>Dispensa</option><option>Altro</option></select></label>
  <label>Lotto<input name="lotto" required></label><label>Scadenza<input name="scadenza" type="date"></label>
  <label>Quantità<input name="quantita"></label><label>Unità<select name="unita"><option>kg</option><option>g</option><option>pz</option><option>L</option><option>ml</option></select></label>
  <label class="full">Posizione<input name="posizione"></label><label class="full">Note<textarea name="note"></textarea></label></div>
  <div class="actions"><button type="button" class="ghost" id="cancel">Annulla</button><button>Salva</button></div>`;
  f.onsubmit=e=>{
    e.preventDefault();
    let x=new FormData(f);
    data.prodotti.push({
      id:id(),nome:x.get('nome').trim(),categoria:x.get('categoria'),lotto:x.get('lotto').trim(),
      scadenza:x.get('scadenza'),quantita:x.get('quantita'),unita:x.get('unita'),
      posizione:x.get('posizione').trim(),note:x.get('note').trim()
    });
    save();m.close();render();
  };
  f.querySelector('#cancel').onclick=()=>m.close();
  m.showModal();
}

function tempModal(){
  if(data.frigoriferi.length===0){
    alert('Prima aggiungi almeno un frigorifero o congelatore.');
    view='attrezzature';render();return;
  }
  const m=document.getElementById('modal'),f=document.getElementById('modalForm');
  f.className='modal';
  f.innerHTML=`<h2>Registra temperatura</h2><div class="form">
  <label class="full">Attrezzatura<select name="frigo">${data.frigoriferi.map(x=>`<option value="${x.id}">${esc(x.nome)} — ${esc(x.tipo)} (${x.min}/${x.max} °C)</option>`).join('')}</select></label>
  <label>Temperatura °C<input name="val" required inputmode="decimal"></label>
  <label>Operatore<input name="op"></label>
  <label class="full">Note / azione correttiva<textarea name="note"></textarea></label></div>
  <div class="actions"><button type="button" class="ghost" id="cancel">Annulla</button><button>Salva</button></div>`;
  f.onsubmit=e=>{
    e.preventDefault();
    let x=new FormData(f),v=parseFloat(String(x.get('val')).replace(',','.'));
    if(Number.isNaN(v))return alert('Temperatura non valida');
    data.temperature.push({
      id:id(),frigoId:x.get('frigo'),valore:v,operatore:x.get('op').trim(),
      note:x.get('note').trim(),ts:new Date().toISOString()
    });
    save();m.close();render();
  };
  f.querySelector('#cancel').onclick=()=>m.close();
  m.showModal();
}

function equipModal(existing=null){
  const m=document.getElementById('modal'),f=document.getElementById('modalForm');
  f.className='modal';
  const tipo=existing?.tipo||'Frigorifero';
  f.innerHTML=`<h2>${existing?'Modifica':'Nuova'} attrezzatura</h2><div class="form">
  <label class="full">Nome<input name="nome" required value="${esc(existing?.nome||'')}" placeholder="Es. Frigo antipasti 1"></label>
  <label>Tipo<select name="tipo">
    <option ${tipo==='Frigorifero'?'selected':''}>Frigorifero</option>
    <option ${tipo==='Congelatore'?'selected':''}>Congelatore</option>
  </select></label>
  <label>Posizione<input name="posizione" value="${esc(existing?.posizione||'')}" placeholder="Es. Cucina, dispensa..."></label>
  <label>Temperatura minima °C<input name="min" required inputmode="decimal" value="${existing?.min ?? 0}"></label>
  <label>Temperatura massima °C<input name="max" required inputmode="decimal" value="${existing?.max ?? 4}"></label>
  </div>
  <div class="actions"><button type="button" class="ghost" id="cancel">Annulla</button><button>Salva</button></div>`;

  const tipoSel=f.querySelector('[name="tipo"]');
  tipoSel.onchange=()=>{
    const min=f.querySelector('[name="min"]');
    const max=f.querySelector('[name="max"]');
    if(tipoSel.value==='Congelatore'){min.value='-24';max.value='-18';}
    else{min.value='0';max.value='4';}
  };

  f.onsubmit=e=>{
    e.preventDefault();
    const x=new FormData(f);
    const min=parseFloat(String(x.get('min')).replace(',','.'));
    const max=parseFloat(String(x.get('max')).replace(',','.'));
    if(Number.isNaN(min)||Number.isNaN(max))return alert('Inserisci limiti di temperatura validi.');
    if(min>=max)return alert('La temperatura minima deve essere inferiore alla massima.');
    const obj={
      id:existing?.id||id(),
      nome:x.get('nome').trim(),
      tipo:x.get('tipo'),
      posizione:x.get('posizione').trim(),
      min,max
    };
    if(existing){
      data.frigoriferi=data.frigoriferi.map(z=>z.id===existing.id?obj:z);
    }else{
      data.frigoriferi.push(obj);
    }
    save();m.close();render();
  };
  f.querySelector('#cancel').onclick=()=>m.close();
  m.showModal();
}

function backup(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='haccp_backup.json';
  a.click();
}

function report(){
  const w=open('','_blank');
  w.document.write(`<html><head><style>
  body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px;text-align:left}
  </style></head><body><h1>HACCP Manager Pro</h1><h2>Registro temperature</h2>
  <table><tr><th>Data/Ora</th><th>Attrezzatura</th><th>Tipo</th><th>°C</th><th>Limiti</th><th>Operatore</th><th>Note</th></tr>
  ${data.temperature.map(t=>{
    const f=data.frigoriferi.find(x=>x.id===t.frigoId);
    return `<tr><td>${fmtDT(t.ts)}</td><td>${esc(f?.nome||'Rimossa')}</td><td>${esc(f?.tipo||'')}</td><td>${t.valore.toFixed(1)}</td><td>${f?`${f.min}/${f.max} °C`:''}</td><td>${esc(t.operatore)}</td><td>${esc(t.note)}</td></tr>`
  }).join('')}</table><script>onload=()=>print()</script></body></html>`);
  w.document.close();
}

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js');
render();
