
import { firebaseConfig, WORKSPACE_ID } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const LOCAL_KEY='haccp_pwa_v1';
const defaults={prodotti:[],temperature:[],frigoriferi:[],ssop:[]};
let data={...defaults};
let view='dashboard';
let ssopMonth=new Date().toISOString().slice(0,7);
let currentUser=null;
let ready=false;
let unsubscribers=[];

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const id=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random();
const fmt=d=>d?new Date(d+(d.length===10?'T12:00:00':'')).toLocaleDateString('it-IT'):'-';
const fmtDT=d=>new Date(d).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'});

function col(name){return collection(db,'workspaces',WORKSPACE_ID,name)}
function saveLocal(){localStorage.setItem(LOCAL_KEY,JSON.stringify(data))}
function loadLocal(){try{return {...defaults,...JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}}catch{return {...defaults}}}

async function saveShared(name,obj){
  const item={...obj,id:obj.id||id(),updatedAt:new Date().toISOString()};
  await setDoc(doc(col(name),item.id),item,{merge:true});
  return item;
}
async function removeShared(name,docId){await deleteDoc(doc(col(name),docId))}

function startRealtime(){
  unsubscribers.forEach(u=>u());
  unsubscribers=[];
  for(const name of ['prodotti','temperature','frigoriferi','ssop']){
    const u=onSnapshot(col(name),snap=>{
      data[name]=snap.docs.map(d=>({id:d.id,...d.data()}));
      saveLocal();
      if(ready) render();
    });
    unsubscribers.push(u);
  }
}

async function migrateLocalOnce(){
  const marker='cloud_migrated_'+WORKSPACE_ID;
  if(localStorage.getItem(marker)==='1') return;
  const old=loadLocal();
  for(const name of ['prodotti','temperature','frigoriferi','ssop']){
    for(const item of (old[name]||[])){
      await saveShared(name,item);
    }
  }
  localStorage.setItem(marker,'1');
}

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){
    ready=false;
    showLogin();
    return;
  }
  hideLogin();
  startRealtime();
  await migrateLocalOnce();
  ready=true;
  render();
});

function showLogin(){
  let d=document.getElementById('loginGate');
  if(!d){
    d=document.createElement('dialog');
    d.id='loginGate';
    d.innerHTML=`<form id="loginForm" style="padding:22px;min-width:min(90vw,420px);font-family:-apple-system">
      <h2>☁️ HACCP condiviso</h2>
      <p style="color:#667;line-height:1.45">Accedi per vedere e aggiornare gli stessi dati da tutti i telefoni.</p>
      <label style="display:block;margin:10px 0">Email<input id="loginEmail" type="email" required style="width:100%;padding:12px;margin-top:6px"></label>
      <label style="display:block;margin:10px 0">Password<input id="loginPass" type="password" required minlength="6" style="width:100%;padding:12px;margin-top:6px"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button type="submit">Accedi</button>
        <button type="button" id="registerBtn" class="ghost">Crea account</button>
      </div>
      <div id="loginMsg" style="margin-top:12px;color:#b3261e"></div>
    </form>`;
    document.body.appendChild(d);
    const f=d.querySelector('#loginForm');
    f.onsubmit=async e=>{
      e.preventDefault();
      const email=d.querySelector('#loginEmail').value.trim();
      const pass=d.querySelector('#loginPass').value;
      const msg=d.querySelector('#loginMsg');
      try{msg.textContent='Accesso...';await signInWithEmailAndPassword(auth,email,pass);msg.textContent='';}
      catch(err){msg.textContent=humanAuthError(err)}
    };
    d.querySelector('#registerBtn').onclick=async()=>{
      const email=d.querySelector('#loginEmail').value.trim();
      const pass=d.querySelector('#loginPass').value;
      const msg=d.querySelector('#loginMsg');
      try{msg.textContent='Creazione account...';await createUserWithEmailAndPassword(auth,email,pass);msg.textContent='';}
      catch(err){msg.textContent=humanAuthError(err)}
    };
  }
  if(!d.open)d.showModal();
}
function hideLogin(){const d=document.getElementById('loginGate');if(d?.open)d.close()}
function humanAuthError(e){
  const c=e?.code||'';
  if(c.includes('invalid-credential'))return'Email o password non corretti.';
  if(c.includes('email-already-in-use'))return'Questa email è già registrata.';
  if(c.includes('weak-password'))return'Usa una password di almeno 6 caratteri.';
  if(c.includes('invalid-email'))return'Email non valida.';
  return 'Errore di accesso. Riprova.';
}

function daysTo(x){
  if(!x)return null;
  let a=new Date();a.setHours(0,0,0,0);
  let b=new Date(x+'T12:00:00');b.setHours(0,0,0,0);
  return Math.round((b-a)/86400000);
}
function badge(x){
  let d=daysTo(x);
  if(d===null)return'<span class="badge">Nessuna scadenza</span>';
  if(d<0)return`<span class="badge danger">Scaduto da ${-d} gg</span>`;
  if(d===0)return'<span class="badge danger">Scade oggi</span>';
  if(d<=3)return`<span class="badge warn">Scade tra ${d} gg</span>`;
  return`<span class="badge">Scade ${fmt(x)}</span>`;
}
function lastTemp(fid){return data.temperature.filter(x=>x.frigoId===fid).sort((a,b)=>b.ts.localeCompare(a.ts))[0]}
function tempOut(f,t){return !!(t&&(Number(t.valore)<Number(f.min)||Number(t.valore)>Number(f.max)))}
function ssopNC(r){return['attrezzaturePO','attrezzaturePS','igieneAttrezzaturePO','igieneAttrezzaturePS','localiPO','localiPS','igieneLocaliPO','igieneLocaliPS','personale'].some(k=>r[k]==='NC')}

function render(){
  if(!ready)return;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const el=document.getElementById('view');
  if(view==='dashboard')el.innerHTML=dashboard();
  if(view==='magazzino')el.innerHTML=magazzino();
  if(view==='scadenze')el.innerHTML=scadenze();
  if(view==='temperature')el.innerHTML=temperature();
  if(view==='attrezzature')el.innerHTML=attrezzature();
  if(view==='ssop')el.innerHTML=ssopView();
  if(view==='altro')el.innerHTML=altro();
  bind();
}

function dashboard(){
  const crit=data.prodotti.filter(p=>{let d=daysTo(p.scadenza);return d!==null&&d<=7}).length;
  const today=new Date().toISOString().slice(0,10),done=data.ssop.some(r=>r.data===today);
  return `<section class="hero"><h2>HACCP condiviso ☁️</h2><p>${esc(currentUser?.email||'')} • dati sincronizzati</p></section>
  <div class="grid">
    <div class="card"><b>Scadenze critiche</b><div class="metric ${crit?'danger':'ok'}">${crit}</div></div>
    <div class="card"><b>SSOP oggi</b><div class="metric ${done?'ok':''}">${done?'✓':'—'}</div><div class="sub">${done?'Compilato':'Da compilare'}</div></div>
  </div>
  <div class="title"><h2>Temperature</h2><button data-a="newT">+ Registra</button></div>
  <div class="grid">${data.frigoriferi.map(f=>{let t=lastTemp(f.id);return`<div class="card"><b>${f.tipo==='Congelatore'?'❄️':'🧊'} ${esc(f.nome)}</b><div class="metric ${tempOut(f,t)?'danger':'ok'}">${t?t.valore.toFixed(1)+' °C':'--'}</div><div class="sub">${f.min}/${f.max} °C</div></div>`}).join('')||'<div class="card">Nessuna attrezzatura</div>'}</div>
  <div class="title"><h2>Azioni rapide</h2></div>
  <div class="grid"><button data-a="newP">➕ Nuovo prodotto</button><button class="ghost" data-a="goSSOP">🧼 Controllo SSOP</button></div>`;
}
function inv(items){
  return items.length?items.map(p=>`<div class="item"><div class="icon">📦</div><div class="grow"><div class="name">${esc(p.nome)}</div><div class="sub">${esc(p.categoria||'')} • Lotto ${esc(p.lotto)}</div>${badge(p.scadenza)}</div><button class="dangerBtn" data-del="${p.id}">✕</button></div>`).join(''):'<div class="empty">Nessun prodotto.</div>';
}
function magazzino(){return`<div class="title"><h2>Magazzino</h2><button data-a="newP">+ Nuovo</button></div><input id="search" class="search" placeholder="Cerca prodotto, lotto..."><div id="inv" class="list" style="margin-top:12px">${inv(data.prodotti)}</div>`}
function scadenze(){return`<div class="title"><h2>Scadenze</h2></div><div class="list">${inv([...data.prodotti].filter(p=>p.scadenza).sort((a,b)=>a.scadenza.localeCompare(b.scadenza)))}</div>`}
function temperature(){
  return`<div class="title"><h2>Registro temperature</h2><button data-a="newT">+ Registra</button></div><div class="list">${[...data.temperature].sort((a,b)=>b.ts.localeCompare(a.ts)).map(t=>{let f=data.frigoriferi.find(x=>x.id===t.frigoId);return`<div class="item"><div class="icon">🌡️</div><div class="grow"><div class="name">${esc(f?.nome||'Attrezzatura')}</div><div class="sub">${fmtDT(t.ts)}${t.operatore?' • '+esc(t.operatore):''}</div><span class="badge ${f&&tempOut(f,t)?'danger':''}">${Number(t.valore).toFixed(1)} °C ${f&&tempOut(f,t)?'• FUORI LIMITE':'• OK'}</span>${t.note?`<div class="sub">${esc(t.note)}</div>`:''}</div></div>`}).join('')||'<div class="empty">Nessuna temperatura.</div>'}</div>`;
}
function attrezzature(){
  return`<div class="title"><h2>Attrezzature</h2><button data-a="newE">+ Aggiungi</button></div><div class="list">${data.frigoriferi.map(f=>`<div class="item"><div class="icon">${f.tipo==='Congelatore'?'❄️':'🧊'}</div><div class="grow"><div class="name">${esc(f.nome)}</div><div class="sub">${esc(f.tipo)} • ${f.min}/${f.max} °C${f.posizione?' • '+esc(f.posizione):''}</div></div><button class="ghost" data-edit="${f.id}">✏️</button><button class="dangerBtn" data-del-eq="${f.id}">✕</button></div>`).join('')||'<div class="empty">Nessuna attrezzatura.</div>'}</div>`;
}
function ssopView(){
  let[y,m]=ssopMonth.split('-').map(Number),n=new Date(y,m,0).getDate(),rows='';
  for(let d=1;d<=n;d++){
    let dt=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,r=data.ssop.find(x=>x.data===dt);
    rows+=`<div class="item"><div class="icon">${r?(ssopNC(r)?'⚠️':'✅'):'📋'}</div><div class="grow"><div class="name">${fmt(dt)}</div><div class="sub">${r?(ssopNC(r)?'Presente NC':'Tutto conforme'):'Non compilato'}</div></div><button data-ssop="${dt}">${r?'Apri':'Compila'}</button></div>`;
  }
  return`<div class="title"><h2>Controllo SSOP</h2><button data-a="ssopPDF">PDF</button></div><div class="card"><b>C = Conforme • NC = Non Conforme</b><div class="sub">PO = Preoperativa • PS = Postoperativa</div></div><div class="title"><h2>Mese</h2></div><input id="ssopMonth" type="month" value="${ssopMonth}"><div class="list" style="margin-top:12px">${rows}</div>`;
}
function altro(){
  return`<div class="title"><h2>Altro</h2></div><div class="list">
  <div class="item"><div class="icon">🧼</div><div class="grow"><div class="name">Controllo SSOP</div></div><button data-a="goSSOP">Apri</button></div>
  <div class="item"><div class="icon">🧊</div><div class="grow"><div class="name">Frigoriferi e congelatori</div></div><button data-a="goE">Gestisci</button></div>
  <div class="item"><div class="icon">☁️</div><div class="grow"><div class="name">Account condiviso</div><div class="sub">${esc(currentUser?.email||'')}</div></div><button data-a="logout">Esci</button></div>
  </div>`;
}

function bind(){
  document.querySelectorAll('[data-a="newP"]').forEach(b=>b.onclick=productModal);
  document.querySelectorAll('[data-a="newT"]').forEach(b=>b.onclick=tempModal);
  document.querySelectorAll('[data-a="newE"]').forEach(b=>b.onclick=()=>equipModal());
  document.querySelectorAll('[data-a="goE"]').forEach(b=>b.onclick=()=>{view='attrezzature';render()});
  document.querySelectorAll('[data-a="goSSOP"]').forEach(b=>b.onclick=()=>{view='ssop';render()});
  document.querySelectorAll('[data-a="ssopPDF"]').forEach(b=>b.onclick=ssopPDF);
  document.querySelectorAll('[data-a="logout"]').forEach(b=>b.onclick=()=>signOut(auth));
  document.querySelectorAll('[data-ssop]').forEach(b=>b.onclick=()=>ssopModal(b.dataset.ssop));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>equipModal(data.frigoriferi.find(x=>x.id===b.dataset.edit)));
  document.querySelectorAll('[data-del-eq]').forEach(b=>b.onclick=async()=>{if(confirm('Eliminare attrezzatura?'))await removeShared('frigoriferi',b.dataset.delEq)});
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Eliminare questo lotto?'))await removeShared('prodotti',b.dataset.del)});
  let sm=document.getElementById('ssopMonth');if(sm)sm.onchange=()=>{ssopMonth=sm.value;render()};
  let s=document.getElementById('search');if(s)s.oninput=()=>{let q=s.value.toLowerCase();document.getElementById('inv').innerHTML=inv(data.prodotti.filter(p=>[p.nome,p.lotto,p.categoria].some(x=>(x||'').toLowerCase().includes(q))));bind()};
}

function modalBase(title,html,onSubmit){
  const m=document.getElementById('modal'),f=document.getElementById('modalForm');f.className='modal';
  f.innerHTML=`<h2>${title}</h2>${html}<div class="actions"><button type="button" class="ghost" id="cancel">Annulla</button><button>Salva</button></div>`;
  f.onsubmit=onSubmit;f.querySelector('#cancel').onclick=()=>m.close();m.showModal();return{m,f};
}
function productModal(){
  const {m,f}=modalBase('Nuovo prodotto',`<div class="form"><label>Nome<input name="nome" required></label><label>Categoria<input name="cat"></label><label>Lotto<input name="lotto" required></label><label>Scadenza<input type="date" name="scad"></label></div>`,async e=>{e.preventDefault();let x=new FormData(f);await saveShared('prodotti',{id:id(),nome:x.get('nome').trim(),categoria:x.get('cat').trim(),lotto:x.get('lotto').trim(),scadenza:x.get('scad')});m.close()});
}
function tempModal(){
  if(!data.frigoriferi.length)return alert('Aggiungi prima un frigorifero o congelatore.');
  const {m,f}=modalBase('Registra temperatura',`<div class="form"><label class="full">Attrezzatura<select name="frigo">${data.frigoriferi.map(x=>`<option value="${x.id}">${esc(x.nome)} (${x.min}/${x.max} °C)</option>`).join('')}</select></label><label>Temperatura °C<input name="val" required></label><label>Operatore<input name="op"></label><label class="full">Note<textarea name="note"></textarea></label></div>`,async e=>{e.preventDefault();let x=new FormData(f),v=parseFloat(String(x.get('val')).replace(',','.'));if(Number.isNaN(v))return alert('Temperatura non valida');await saveShared('temperature',{id:id(),frigoId:x.get('frigo'),valore:v,operatore:x.get('op').trim(),note:x.get('note').trim(),ts:new Date().toISOString()});m.close()});
}
function equipModal(ex=null){
  const {m,f}=modalBase(ex?'Modifica attrezzatura':'Nuova attrezzatura',`<div class="form"><label class="full">Nome<input name="nome" required value="${esc(ex?.nome||'')}"></label><label>Tipo<select name="tipo"><option ${ex?.tipo==='Frigorifero'?'selected':''}>Frigorifero</option><option ${ex?.tipo==='Congelatore'?'selected':''}>Congelatore</option></select></label><label>Posizione<input name="pos" value="${esc(ex?.posizione||'')}"></label><label>Min °C<input name="min" value="${ex?.min??0}"></label><label>Max °C<input name="max" value="${ex?.max??4}"></label></div>`,async e=>{e.preventDefault();let x=new FormData(f),min=parseFloat(String(x.get('min')).replace(',','.')),max=parseFloat(String(x.get('max')).replace(',','.'));if(Number.isNaN(min)||Number.isNaN(max)||min>=max)return alert('Controlla i limiti di temperatura');await saveShared('frigoriferi',{id:ex?.id||id(),nome:x.get('nome').trim(),tipo:x.get('tipo'),posizione:x.get('pos').trim(),min,max});m.close()});
}
function sel(n,l,v=''){return`<label class="full">${l}<select name="${n}"><option value="">—</option><option ${v==='C'?'selected':''}>C</option><option ${v==='NC'?'selected':''}>NC</option></select></label>`}
function ssopModal(dt){
  let ex=data.ssop.find(x=>x.data===dt)||{data:dt};
  const {m,f}=modalBase(`SSOP — ${fmt(dt)}`,`<div class="form">${sel('attrezzaturePO','Idoneità attrezzature — PO',ex.attrezzaturePO)}${sel('attrezzaturePS','Idoneità attrezzature — PS',ex.attrezzaturePS)}${sel('igieneAttrezzaturePO','Igiene attrezzature — PO',ex.igieneAttrezzaturePO)}${sel('igieneAttrezzaturePS','Igiene attrezzature — PS',ex.igieneAttrezzaturePS)}${sel('localiPO','Idoneità locali — PO',ex.localiPO)}${sel('localiPS','Idoneità locali — PS',ex.localiPS)}${sel('igieneLocaliPO','Igiene locali — PO',ex.igieneLocaliPO)}${sel('igieneLocaliPS','Igiene locali — PS',ex.igieneLocaliPS)}${sel('personale','Igiene del personale',ex.personale)}<label class="full">Verificatore / firma<input name="ver" value="${esc(ex.verificatore||'')}"></label><label class="full">Non conformità<textarea name="nc">${esc(ex.nonConformita||'')}</textarea></label><label class="full">Azione correttiva<textarea name="ac">${esc(ex.azioneCorrettiva||'')}</textarea></label></div>`,async e=>{e.preventDefault();let x=new FormData(f),r={id:ex.id||id(),data:dt,attrezzaturePO:x.get('attrezzaturePO'),attrezzaturePS:x.get('attrezzaturePS'),igieneAttrezzaturePO:x.get('igieneAttrezzaturePO'),igieneAttrezzaturePS:x.get('igieneAttrezzaturePS'),localiPO:x.get('localiPO'),localiPS:x.get('localiPS'),igieneLocaliPO:x.get('igieneLocaliPO'),igieneLocaliPS:x.get('igieneLocaliPS'),personale:x.get('personale'),verificatore:x.get('ver').trim(),nonConformita:x.get('nc').trim(),azioneCorrettiva:x.get('ac').trim()};if(ssopNC(r)&&(!r.nonConformita||!r.azioneCorrettiva))return alert('Con una NC devi indicare non conformità e azione correttiva.');await saveShared('ssop',r);m.close()});
}
function ssopPDF(){
  let rows=data.ssop.filter(r=>r.data.startsWith(ssopMonth)).sort((a,b)=>a.data.localeCompare(b.data)),w=open('','_blank'),v=x=>x||'—';
  w.document.write(`<html><head><style>body{font-family:Arial;padding:18px;font-size:10px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:4px;text-align:center}</style></head><body><h1>CONTROLLO SSOP</h1><h2>${ssopMonth}</h2><table><tr><th>Giorno</th><th>Id.Att PO</th><th>Id.Att PS</th><th>Ig.Att PO</th><th>Ig.Att PS</th><th>Id.Loc PO</th><th>Id.Loc PS</th><th>Ig.Loc PO</th><th>Ig.Loc PS</th><th>Pers.</th><th>Verificatore</th></tr>${rows.map(r=>`<tr><td>${Number(r.data.slice(-2))}</td><td>${v(r.attrezzaturePO)}</td><td>${v(r.attrezzaturePS)}</td><td>${v(r.igieneAttrezzaturePO)}</td><td>${v(r.igieneAttrezzaturePS)}</td><td>${v(r.localiPO)}</td><td>${v(r.localiPS)}</td><td>${v(r.igieneLocaliPO)}</td><td>${v(r.igieneLocaliPS)}</td><td>${v(r.personale)}</td><td>${esc(r.verificatore)}</td></tr>`).join('')}</table><script>onload=()=>print()</script></body></html>`);w.document.close();
}

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js');
