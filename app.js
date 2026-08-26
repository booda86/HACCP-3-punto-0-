
import { firebaseConfig, WORKSPACE_ID } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const LOCAL_KEY='haccp_pwa_v1';
const defaults={prodotti:[],temperature:[],frigoriferi:[],ssop:[],product_memory:[]};

let data={...defaults};
let view='dashboard';
let ssopMonth=new Date().toISOString().slice(0,7);
let currentUser=null,currentProfile=null,ready=false;
let unsubscribers=[];
let currentScanImage=null;

const firebaseApp=initializeApp(firebaseConfig);
const auth=getAuth(firebaseApp);
const db=getFirestore(firebaseApp);

const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const id=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random();
const today=()=>new Date().toISOString().slice(0,10);
const fmt=d=>d?new Date(d+(d.length===10?'T12:00:00':'')).toLocaleDateString('it-IT'):'-';
const fmtDT=d=>new Date(d).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'});
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

function col(name){return collection(db,'workspaces',WORKSPACE_ID,name)}
function saveLocal(){localStorage.setItem(LOCAL_KEY,JSON.stringify(data))}
function loadLocal(){try{return {...defaults,...JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}}catch{return {...defaults}}}

async function saveShared(name,obj){
  const item={...obj,id:obj.id||id(),updatedAt:new Date().toISOString()};
  await setDoc(doc(col(name),item.id),item,{merge:true});
  return item;
}
async function removeShared(name,docId){await deleteDoc(doc(col(name),docId))}

function memoryId(name){let h=2166136261;for(const c of norm(name)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return 'p_'+(h>>>0).toString(16)}
async function rememberProduct(p){
  if(!p.nome)return;
  await saveShared('product_memory',{
    id:memoryId(p.nome),
    nome:p.nome,categoria:p.categoria||'',fornitore:p.fornitore||'',barcode:p.barcode||''
  });
}

async function saveUserProfile(profile){
  if(!currentUser)return;
  const item={id:currentUser.uid,uid:currentUser.uid,email:currentUser.email||'',
    nome:(profile.nome||'').trim(),cognome:(profile.cognome||'').trim(),
    dataNascita:profile.dataNascita||'',updatedAt:new Date().toISOString()};
  await setDoc(doc(col('utenti'),currentUser.uid),item,{merge:true});
  currentProfile=item;
}
async function loadUserProfile(){
  if(!currentUser)return;
  const snap=await getDoc(doc(col('utenti'),currentUser.uid));
  currentProfile=snap.exists()?{id:snap.id,...snap.data()}:
    {id:currentUser.uid,uid:currentUser.uid,email:currentUser.email||'',nome:'',cognome:'',dataNascita:''};
}
function startRealtime(){
  unsubscribers.forEach(u=>u());unsubscribers=[];
  for(const name of ['prodotti','temperature','frigoriferi','ssop','product_memory']){
    unsubscribers.push(onSnapshot(col(name),snap=>{
      data[name]=snap.docs.map(d=>({id:d.id,...d.data()}));
      saveLocal(); if(ready)render();
    }));
  }
}
async function migrateLocalOnce(){
  const marker='cloud_migrated_'+WORKSPACE_ID+'_v43';
  if(localStorage.getItem(marker)==='1')return;
  const old=loadLocal();
  for(const name of ['prodotti','temperature','frigoriferi','ssop']){
    for(const item of (old[name]||[]))await saveShared(name,item);
  }
  localStorage.setItem(marker,'1');
}

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){ready=false;currentProfile=null;showLogin();return}
  hideLogin();startRealtime();await migrateLocalOnce();await loadUserProfile();ready=true;render();
  if(!currentProfile?.nome||!currentProfile?.cognome||!currentProfile?.dataNascita)setTimeout(()=>profileModal(true),300);
});

function showLogin(){
  let d=document.getElementById('loginGate');
  if(!d){
    d=document.createElement('dialog');d.id='loginGate';
    d.innerHTML=`<form id="loginForm" style="padding:22px;min-width:min(92vw,440px);font-family:-apple-system">
      <h2>☁️ HACCP condiviso</h2>
      <p style="color:#667">Accedi con il tuo account personale.</p>
      <label style="display:block;margin:10px 0">Email<input id="loginEmail" type="email" required style="width:100%;padding:12px;margin-top:6px"></label>
      <label style="display:block;margin:10px 0">Password<input id="loginPass" type="password" minlength="6" required style="width:100%;padding:12px;margin-top:6px"></label>
      <details style="margin-top:14px;padding:12px;border:1px solid #ddd;border-radius:12px">
        <summary style="font-weight:800">👤 Dati nuovo utente</summary>
        <label style="display:block;margin:10px 0">Nome<input id="regNome" style="width:100%;padding:12px;margin-top:6px"></label>
        <label style="display:block;margin:10px 0">Cognome<input id="regCognome" style="width:100%;padding:12px;margin-top:6px"></label>
        <label style="display:block;margin:10px 0">Data di nascita<input id="regNascita" type="date" style="width:100%;padding:12px;margin-top:6px"></label>
      </details>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="submit">Accedi</button><button type="button" id="registerBtn" class="ghost">Crea account</button></div>
      <div id="loginMsg" style="margin-top:12px;color:#b3261e"></div>
    </form>`;
    document.body.appendChild(d);
    d.querySelector('#loginForm').onsubmit=async e=>{
      e.preventDefault();const msg=d.querySelector('#loginMsg');
      try{msg.textContent='Accesso...';await signInWithEmailAndPassword(auth,d.querySelector('#loginEmail').value.trim(),d.querySelector('#loginPass').value);msg.textContent=''}
      catch{msg.textContent='Email o password non corretti.'}
    };
    d.querySelector('#registerBtn').onclick=async()=>{
      const nome=d.querySelector('#regNome').value.trim(),cognome=d.querySelector('#regCognome').value.trim(),dataNascita=d.querySelector('#regNascita').value,msg=d.querySelector('#loginMsg');
      if(!nome||!cognome||!dataNascita){msg.textContent='Compila nome, cognome e data di nascita.';return}
      try{const cred=await createUserWithEmailAndPassword(auth,d.querySelector('#loginEmail').value.trim(),d.querySelector('#loginPass').value);currentUser=cred.user;await saveUserProfile({nome,cognome,dataNascita})}
      catch{msg.textContent='Errore nella creazione account.'}
    };
  }
  if(!d.open)d.showModal();
}
function hideLogin(){const d=document.getElementById('loginGate');if(d?.open)d.close()}
function profileName(){return [currentProfile?.nome,currentProfile?.cognome].filter(Boolean).join(' ').trim()||currentUser?.email||'Utente'}

function daysTo(x){if(!x)return null;let a=new Date();a.setHours(0,0,0,0);let b=new Date(x+'T12:00:00');b.setHours(0,0,0,0);return Math.round((b-a)/86400000)}
function badge(x){const d=daysTo(x);if(d===null)return'<span class="badge">Nessuna scadenza</span>';if(d<0)return`<span class="badge danger">Scaduto da ${-d} gg</span>`;if(d===0)return'<span class="badge danger">Scade oggi</span>';if(d<=3)return`<span class="badge warn">Scade tra ${d} gg</span>`;return`<span class="badge">Scade ${fmt(x)}</span>`}
function ssopNC(r){return['attrezzaturePO','attrezzaturePS','igieneAttrezzaturePO','igieneAttrezzaturePS','localiPO','localiPS','igieneLocaliPO','igieneLocaliPS','personale'].some(k=>r[k]==='NC')}
function tempOut(f,t){return !!(t&&(Number(t.valore)<Number(f.min)||Number(t.valore)>Number(f.max)))}
function tempTodayFor(fid){const day=today();return data.temperature.find(t=>String(t.frigoId)===String(fid)&&(t.giorno===day||String(t.ts||'').slice(0,10)===day))}
function dailyStatus(){const total=data.frigoriferi.length,done=data.frigoriferi.filter(f=>!!tempTodayFor(f.id)).length;return{total,done,missing:total-done}}

function render(){
  if(!ready)return;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const e=document.getElementById('view');
  e.innerHTML=view==='dashboard'?dashboard():view==='magazzino'?magazzino():view==='scadenze'?scadenze():view==='temperature'?temperature():view==='attrezzature'?attrezzature():view==='ssop'?ssopView():altro();
  bind();
}
function dashboard(){
  const crit=data.prodotti.filter(p=>{let d=daysTo(p.scadenza);return d!==null&&d<=7}).length,ssopDone=data.ssop.some(r=>r.data===today()),ds=dailyStatus();
  return `<section class="hero"><h2>HACCP condiviso ☁️</h2><p>${esc(profileName())} • ${fmt(today())}</p></section>
  <div class="grid"><div class="card"><b>Temperature oggi</b><div class="metric ${ds.missing?'danger':'ok'}">${ds.done}/${ds.total}</div><div class="sub">${ds.missing?ds.missing+' mancanti':'Tutte registrate'}</div></div>
  <div class="card"><b>SSOP oggi</b><div class="metric ${ssopDone?'ok':''}">${ssopDone?'✓':'—'}</div><div class="sub">${ssopDone?'Compilato':'Da compilare'}</div></div>
  <div class="card"><b>Scadenze critiche</b><div class="metric ${crit?'danger':'ok'}">${crit}</div></div></div>
  <div class="title"><h2>Azioni rapide</h2></div>
  <div class="grid"><button data-a="scanLot">📷 Scanner lotto</button><button data-a="newP" class="ghost">✏️ Lotto manuale</button></div>
  <div class="title"><h2>Controllo giornaliero frighi</h2><button data-a="goTemps">Apri</button></div>
  <div class="list">${data.frigoriferi.map(f=>{const t=tempTodayFor(f.id);return`<div class="item"><div class="icon">${f.tipo==='Congelatore'?'❄️':'🧊'}</div><div class="grow"><div class="name">${esc(f.nome)}</div><div class="sub">${esc(f.tipo)} • Limiti ${f.min}/${f.max} °C</div>${t?`<span class="badge ${tempOut(f,t)?'danger':''}">${Number(t.valore).toFixed(1)} °C • registrata oggi</span>`:'<span class="badge danger">MANCANTE OGGI</span>'}</div><button data-temp-eq="${f.id}">${t?'Modifica':'Registra'}</button></div>`}).join('')||'<div class="empty">Nessuna attrezzatura.</div>'}</div>`;
}
function inv(items){return items.length?items.map(p=>`<div class="item"><div class="icon">${p.categoria==='Pesce'?'🐟':p.categoria==='Carne'?'🥩':'📦'}</div><div class="grow"><div class="name">${esc(p.nome)}</div><div class="sub">${esc(p.categoria||'')} • Lotto ${esc(p.lotto)}${p.fornitore?'<br>Fornitore: '+esc(p.fornitore):''}${p.barcode?'<br>Barcode: '+esc(p.barcode):''}</div>${badge(p.scadenza)}</div><button class="dangerBtn" data-del="${p.id}">✕</button></div>`).join(''):'<div class="empty">Nessun prodotto.</div>'}
function magazzino(){return`<div class="title"><h2>Magazzino</h2><div><button data-a="scanLot">📷 Scanner</button> <button data-a="newP">+ Manuale</button></div></div><input id="search" class="search" placeholder="Cerca prodotto, lotto, categoria..."><div id="inv" class="list" style="margin-top:12px">${inv(data.prodotti)}</div>`}
function scadenze(){return`<div class="title"><h2>Scadenze</h2></div><div class="list">${inv([...data.prodotti].filter(p=>p.scadenza).sort((a,b)=>a.scadenza.localeCompare(b.scadenza)))}</div>`}
function temperature(){return`<div class="title"><h2>Temperature giornaliere</h2></div><div class="card"><b>Una registrazione al giorno per ogni attrezzatura</b><div class="sub">Se esiste già, viene modificata.</div></div><div class="list" style="margin-top:12px">${data.frigoriferi.map(f=>{const t=tempTodayFor(f.id);return`<div class="item"><div class="icon">🌡️</div><div class="grow"><div class="name">${esc(f.nome)}</div><div class="sub">${esc(f.tipo)} • ${f.min}/${f.max} °C</div>${t?`<span class="badge ${tempOut(f,t)?'danger':''}">${Number(t.valore).toFixed(1)} °C • ${esc(t.operatore||'')}</span>`:'<span class="badge danger">Non registrata oggi</span>'}</div><button data-temp-eq="${f.id}">${t?'Modifica':'Registra'}</button></div>`}).join('')||'<div class="empty">Nessun frigo/congelatore.</div>'}</div>`}
function attrezzature(){return`<div class="title"><h2>Attrezzature</h2><button data-a="newE">+ Aggiungi</button></div><div class="list">${data.frigoriferi.map(f=>`<div class="item"><div class="icon">${f.tipo==='Congelatore'?'❄️':'🧊'}</div><div class="grow"><div class="name">${esc(f.nome)}</div><div class="sub">${esc(f.tipo)} • ${f.min}/${f.max} °C${f.posizione?' • '+esc(f.posizione):''}</div></div><button class="ghost" data-edit="${f.id}">✏️</button><button class="dangerBtn" data-del-eq="${f.id}">✕</button></div>`).join('')||'<div class="empty">Nessuna attrezzatura.</div>'}</div>`}
function ssopView(){let[y,m]=ssopMonth.split('-').map(Number),n=new Date(y,m,0).getDate(),rows='';for(let d=1;d<=n;d++){const dt=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,r=data.ssop.find(x=>x.data===dt);rows+=`<div class="item"><div class="icon">${r?(ssopNC(r)?'⚠️':'✅'):'📋'}</div><div class="grow"><div class="name">${fmt(dt)}</div><div class="sub">${r?(ssopNC(r)?'Presente NC':'Tutto conforme'):'Non compilato'}</div></div><button data-ssop="${dt}">${r?'Apri':'Compila'}</button></div>`}return`<div class="title"><h2>Controllo SSOP</h2><button data-a="ssopPDF">PDF</button></div><div class="card"><b>C = Conforme • NC = Non Conforme</b><div class="sub">PO = Preoperativa • PS = Postoperativa</div></div><input id="ssopMonth" type="month" value="${ssopMonth}" style="margin-top:12px"><div class="list" style="margin-top:12px">${rows}</div>`}
function altro(){return`<div class="title"><h2>Altro</h2></div><div class="list"><div class="item"><div class="icon">👤</div><div class="grow"><div class="name">${esc(profileName())}</div><div class="sub">${esc(currentUser?.email||'')}<br>${currentProfile?.dataNascita?'Nato/a il '+fmt(currentProfile.dataNascita):''}</div></div><button data-a="profile">Profilo</button></div><div class="item"><div class="icon">🧼</div><div class="grow"><div class="name">Controllo SSOP</div></div><button data-a="goSSOP">Apri</button></div><div class="item"><div class="icon">🧊</div><div class="grow"><div class="name">Frigoriferi e congelatori</div></div><button data-a="goE">Gestisci</button></div><div class="item"><div class="icon">☁️</div><div class="grow"><div class="name">Account cloud</div></div><button data-a="logout">Esci</button></div></div>`}

function bind(){
  document.querySelectorAll('[data-a="newP"]').forEach(b=>b.onclick=()=>productModal());
  document.querySelectorAll('[data-a="scanLot"]').forEach(b=>b.onclick=scannerModal);
  document.querySelectorAll('[data-a="newE"]').forEach(b=>b.onclick=()=>equipModal());
  document.querySelectorAll('[data-a="goE"]').forEach(b=>b.onclick=()=>{view='attrezzature';render()});
  document.querySelectorAll('[data-a="goSSOP"]').forEach(b=>b.onclick=()=>{view='ssop';render()});
  document.querySelectorAll('[data-a="goTemps"]').forEach(b=>b.onclick=()=>{view='temperature';render()});
  document.querySelectorAll('[data-a="ssopPDF"]').forEach(b=>b.onclick=ssopPDF);
  document.querySelectorAll('[data-a="profile"]').forEach(b=>b.onclick=()=>profileModal(false));
  document.querySelectorAll('[data-a="logout"]').forEach(b=>b.onclick=()=>signOut(auth));
  document.querySelectorAll('[data-temp-eq]').forEach(b=>b.onclick=()=>{const f=data.frigoriferi.find(x=>String(x.id)===String(b.dataset.tempEq));if(f)dailyTempModal(f)});
  document.querySelectorAll('[data-ssop]').forEach(b=>b.onclick=()=>ssopModal(b.dataset.ssop));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>equipModal(data.frigoriferi.find(x=>x.id===b.dataset.edit)));
  document.querySelectorAll('[data-del-eq]').forEach(b=>b.onclick=async()=>{if(confirm('Eliminare attrezzatura?'))await removeShared('frigoriferi',b.dataset.delEq)});
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Eliminare questo lotto?'))await removeShared('prodotti',b.dataset.del)});
  const sm=document.getElementById('ssopMonth');if(sm)sm.onchange=()=>{ssopMonth=sm.value;render()};
  const s=document.getElementById('search');if(s)s.oninput=()=>{const q=s.value.toLowerCase();document.getElementById('inv').innerHTML=inv(data.prodotti.filter(p=>[p.nome,p.lotto,p.categoria,p.fornitore,p.barcode].some(x=>(x||'').toLowerCase().includes(q))));bind()};
}
function modalBase(title,html,onSubmit){
  const m=document.getElementById('modal'),f=document.getElementById('modalForm');f.className='modal';
  f.innerHTML=`<h2>${title}</h2>${html}<div class="actions"><button type="button" class="ghost" id="cancel">Annulla</button><button>Salva</button></div>`;
  f.onsubmit=onSubmit;f.querySelector('#cancel').onclick=()=>m.close();m.showModal();return{m,f};
}
function profileModal(required=false){
  const ex=currentProfile||{};
  const {m,f}=modalBase(required?'Completa il profilo':'Profilo utente',`<div class="form"><label class="full">Nome<input name="nome" required value="${esc(ex.nome||'')}"></label><label class="full">Cognome<input name="cognome" required value="${esc(ex.cognome||'')}"></label><label class="full">Data di nascita<input name="dataNascita" type="date" required value="${esc(ex.dataNascita||'')}"></label><label class="full">Email<input value="${esc(currentUser?.email||'')}" disabled></label></div>`,async e=>{e.preventDefault();const x=new FormData(f);await saveUserProfile({nome:x.get('nome'),cognome:x.get('cognome'),dataNascita:x.get('dataNascita')});m.close();render()});
  if(required)f.querySelector('#cancel').style.display='none';
}

function categoryFromText(text){
  const t=norm(text);
  const groups={
    'Pesce':['salmone','tonno','orata','spigola','branzino','merluzzo','baccala','pesce','gambero','gamberone','calamaro','polpo','seppia','cozza','vongola','ostrica','acciuga','sardina','spada'],
    'Carne':['manzo','vitello','pollo','tacchino','maiale','suino','bovino','carne','agnello','coniglio','salsiccia','prosciutto'],
    'Latticini':['latte','mozzarella','formaggio','burro','panna','ricotta','yogurt','parmigiano','pecorino'],
    'Ortofrutta':['verdura','frutta','pomodoro','zucchina','melanzana','patata','insalata','carota','cipolla','limone','arancia'],
    'Surgelati':['surgelato','congelato','frozen','-18','-20'],
    'Dispensa':['pasta','riso','farina','olio','aceto','zucchero','sale','conserva','pelati']
  };
  for(const [cat,words] of Object.entries(groups))if(words.some(w=>t.includes(w)))return cat;
  return 'Altro';
}
function extractDate(text){
  const patterns=[
    /\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/,
    /\b(0?[1-9]|[12]\d|3[01])[-\/.](0?[1-9]|1[0-2])[-\/.](20\d{2})\b/,
    /\b(0?[1-9]|[12]\d|3[01])[-\/.](0?[1-9]|1[0-2])[-\/.](\d{2})\b/
  ];
  let m=text.match(patterns[0]); if(m)return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=text.match(patterns[1]); if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=text.match(patterns[2]); if(m)return`20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
}
function extractLot(text){
  const lines=text.split(/\n/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines){
    const m=line.match(/(?:lotto|lot\b|lot\.|batch|l\.?)\s*[:\-]?\s*([A-Z0-9\-\/]{3,})/i);
    if(m)return m[1];
  }
  return '';
}
function extractWeight(text){
  const m=text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|ml)\b/i);
  return m?`${m[1]} ${m[2]}`:'';
}
function suggestName(text){
  const lines=text.split(/\n/).map(x=>x.trim()).filter(x=>x.length>=3 && x.length<=60);
  const bad=/lotto|lot\b|scad|scadenza|da consum|peso|kg\b|barcode|ean|prodotto il|confezionato/i;
  const good=lines.filter(x=>!bad.test(x));
  return good[0]||'';
}
function applyMemory(suggestion){
  const n=norm(suggestion.nome);
  if(!n)return suggestion;
  const exact=(data.product_memory||[]).find(m=>norm(m.nome)===n);
  if(exact){
    suggestion.categoria=exact.categoria||suggestion.categoria;
    suggestion.fornitore=exact.fornitore||suggestion.fornitore;
    suggestion.barcode=suggestion.barcode||exact.barcode||'';
  }
  return suggestion;
}

async function barcodeFromImage(img){
  try{
    if('BarcodeDetector' in window){
      const formats=await BarcodeDetector.getSupportedFormats();
      const detector=new BarcodeDetector({formats});
      const codes=await detector.detect(img);
      if(codes?.length)return codes[0].rawValue||'';
    }
  }catch{}
  try{
    if(window.ZXingBrowser){
      const reader=new ZXingBrowser.BrowserMultiFormatReader();
      const result=await reader.decodeFromImageElement(img);
      if(result)return result.getText();
    }
  }catch{}
  return '';
}
async function ocrImage(img){
  if(!window.Tesseract)throw new Error('OCR non disponibile');
  const result=await Tesseract.recognize(img,'ita+eng',{logger:m=>{
    const el=document.getElementById('scanStatus');
    if(el && m.status==='recognizing text')el.textContent=`Lettura etichetta ${Math.round((m.progress||0)*100)}%`;
  }});
  return result?.data?.text||'';
}

function scannerModal(){
  const m=document.getElementById('modal'),f=document.getElementById('modalForm');f.className='modal';
  f.innerHTML=`<h2>📷 Scanner lotto</h2>
  <div class="card"><b>iPhone e Android</b><div class="sub">Scatta una foto dell'etichetta. L'app prova a leggere prodotto, lotto, scadenza, peso e barcode. Controlla sempre i dati prima di salvare.</div></div>
  <div style="margin-top:12px">
    <input id="scanFile" type="file" accept="image/*" capture="environment">
    <img id="scanPreview" alt="" style="display:none;width:100%;max-height:300px;object-fit:contain;margin-top:12px;border-radius:14px">
    <div id="scanStatus" class="sub" style="margin-top:10px"></div>
  </div>
  <div class="actions"><button type="button" class="ghost" id="cancel">Annulla</button><button type="button" id="analyzeBtn">Analizza foto</button></div>`;
  f.querySelector('#cancel').onclick=()=>m.close();
  const file=f.querySelector('#scanFile'),img=f.querySelector('#scanPreview'),status=f.querySelector('#scanStatus');
  file.onchange=()=>{const selected=file.files?.[0];if(!selected)return;const url=URL.createObjectURL(selected);img.src=url;img.style.display='block';currentScanImage=img;status.textContent='Foto pronta.'};
  f.querySelector('#analyzeBtn').onclick=async()=>{
    if(!currentScanImage||!currentScanImage.src)return alert('Scatta o scegli prima una foto.');
    try{
      status.textContent='Analisi barcode...';
      const barcode=await barcodeFromImage(currentScanImage);
      status.textContent='Lettura testo...';
      const text=await ocrImage(currentScanImage);
      let suggestion=applyMemory({
        nome:suggestName(text),
        categoria:categoryFromText(text),
        lotto:extractLot(text),
        scadenza:extractDate(text),
        peso:extractWeight(text),
        fornitore:'',
        barcode,
        ocrText:text
      });
      m.close();
      productModal(suggestion,true);
    }catch(e){
      status.textContent='Non sono riuscito a leggere bene la foto. Puoi compilare manualmente.';
      setTimeout(()=>{m.close();productModal({},true)},800);
    }
  };
  m.showModal();
}

function productModal(prefill={},fromScan=false){
  const cats=['Pesce','Carne','Latticini','Ortofrutta','Surgelati','Dispensa','Altro'];
  const {m,f}=modalBase(fromScan?'Conferma dati etichetta':'Nuovo prodotto / lotto',
  `<div class="form">
    <label class="full">Nome prodotto<input name="nome" required value="${esc(prefill.nome||'')}"></label>
    <label>Categoria<select name="cat">${cats.map(c=>`<option ${c===(prefill.categoria||'Altro')?'selected':''}>${c}</option>`).join('')}</select></label>
    <label>Lotto<input name="lotto" required value="${esc(prefill.lotto||'')}"></label>
    <label>Scadenza<input type="date" name="scad" value="${esc(prefill.scadenza||'')}"></label>
    <label>Fornitore<input name="fornitore" value="${esc(prefill.fornitore||'')}"></label>
    <label>Peso / quantità<input name="peso" value="${esc(prefill.peso||'')}"></label>
    <label class="full">Barcode / QR<input name="barcode" value="${esc(prefill.barcode||'')}"></label>
    ${fromScan?'<div class="full sub">⚠️ Controlla sempre lotto e scadenza prima di salvare.</div>':''}
  </div>`,
  async e=>{
    e.preventDefault();const x=new FormData(f);
    const p={id:id(),nome:x.get('nome').trim(),categoria:x.get('cat'),lotto:x.get('lotto').trim(),scadenza:x.get('scad'),
      fornitore:x.get('fornitore').trim(),peso:x.get('peso').trim(),barcode:x.get('barcode').trim(),
      inseritoDa:profileName(),inseritoDaUid:currentUser?.uid||'',origine:fromScan?'scanner':'manuale'};
    await saveShared('prodotti',p);await rememberProduct(p);m.close();
  });
}

function dailyTempModal(frigo){
  const existing=tempTodayFor(frigo.id),fixedId=`${frigo.id}_${today()}`;
  const {m,f}=modalBase(`${existing?'Modifica':'Registra'} temperatura — ${esc(frigo.nome)}`,
  `<div class="form"><label class="full">Data<input value="${fmt(today())}" disabled></label>
  <label class="full">Attrezzatura<input value="${esc(frigo.nome)} — ${esc(frigo.tipo)} (${frigo.min}/${frigo.max} °C)" disabled></label>
  <label>Temperatura °C<input name="val" required inputmode="decimal" value="${existing?.valore??''}"></label>
  <label>Operatore<input name="op" value="${esc(existing?.operatore||profileName())}"></label>
  <label class="full">Note / azione correttiva<textarea name="note">${esc(existing?.note||'')}</textarea></label></div>`,
  async e=>{e.preventDefault();const x=new FormData(f),valore=parseFloat(String(x.get('val')).replace(',','.'));if(Number.isNaN(valore))return alert('Temperatura non valida.');const fuori=valore<Number(frigo.min)||valore>Number(frigo.max),note=x.get('note').trim();if(fuori&&!note)return alert('Temperatura fuori limite: inserisci una nota o azione correttiva.');await saveShared('temperature',{id:fixedId,giorno:today(),frigoId:frigo.id,frigoNome:frigo.nome,frigoTipo:frigo.tipo||'',frigoMin:Number(frigo.min),frigoMax:Number(frigo.max),valore,operatore:(x.get('op')||profileName()).trim(),operatoreUid:currentUser?.uid||'',note,ts:new Date().toISOString()});m.close()});
}
function equipModal(ex=null){
  const {m,f}=modalBase(ex?'Modifica attrezzatura':'Nuova attrezzatura',
  `<div class="form"><label class="full">Nome<input name="nome" required value="${esc(ex?.nome||'')}"></label>
  <label>Tipo<select name="tipo"><option ${ex?.tipo==='Frigorifero'?'selected':''}>Frigorifero</option><option ${ex?.tipo==='Congelatore'?'selected':''}>Congelatore</option></select></label>
  <label>Posizione<input name="pos" value="${esc(ex?.posizione||'')}"></label>
  <label>Min °C<input name="min" required value="${ex?.min??0}"></label><label>Max °C<input name="max" required value="${ex?.max??4}"></label></div>`,
  async e=>{e.preventDefault();const x=new FormData(f),min=parseFloat(String(x.get('min')).replace(',','.')),max=parseFloat(String(x.get('max')).replace(',','.'));if(Number.isNaN(min)||Number.isNaN(max)||min>=max)return alert('Controlla i limiti.');await saveShared('frigoriferi',{id:ex?.id||id(),nome:x.get('nome').trim(),tipo:x.get('tipo'),posizione:x.get('pos').trim(),min,max});m.close()});
}
function sel(n,l,v=''){return`<label class="full">${l}<select name="${n}"><option value="">—</option><option ${v==='C'?'selected':''}>C</option><option ${v==='NC'?'selected':''}>NC</option></select></label>`}
function ssopModal(dt){
  const ex=data.ssop.find(x=>x.data===dt)||{data:dt};
  const {m,f}=modalBase(`SSOP — ${fmt(dt)}`,`<div class="form">
  ${sel('attrezzaturePO','Idoneità attrezzature — PO',ex.attrezzaturePO)}${sel('attrezzaturePS','Idoneità attrezzature — PS',ex.attrezzaturePS)}
  ${sel('igieneAttrezzaturePO','Igiene attrezzature — PO',ex.igieneAttrezzaturePO)}${sel('igieneAttrezzaturePS','Igiene attrezzature — PS',ex.igieneAttrezzaturePS)}
  ${sel('localiPO','Idoneità locali — PO',ex.localiPO)}${sel('localiPS','Idoneità locali — PS',ex.localiPS)}
  ${sel('igieneLocaliPO','Igiene locali — PO',ex.igieneLocaliPO)}${sel('igieneLocaliPS','Igiene locali — PS',ex.igieneLocaliPS)}
  ${sel('personale','Igiene del personale',ex.personale)}
  <label class="full">Verificatore / firma<input name="ver" value="${esc(ex.verificatore||profileName())}"></label>
  <label class="full">Non conformità<textarea name="nc">${esc(ex.nonConformita||'')}</textarea></label>
  <label class="full">Azione correttiva<textarea name="ac">${esc(ex.azioneCorrettiva||'')}</textarea></label></div>`,
  async e=>{e.preventDefault();const x=new FormData(f),r={id:ex.id||id(),data:dt,attrezzaturePO:x.get('attrezzaturePO'),attrezzaturePS:x.get('attrezzaturePS'),igieneAttrezzaturePO:x.get('igieneAttrezzaturePO'),igieneAttrezzaturePS:x.get('igieneAttrezzaturePS'),localiPO:x.get('localiPO'),localiPS:x.get('localiPS'),igieneLocaliPO:x.get('igieneLocaliPO'),igieneLocaliPS:x.get('igieneLocaliPS'),personale:x.get('personale'),verificatore:x.get('ver').trim(),verificatoreUid:currentUser?.uid||'',nonConformita:x.get('nc').trim(),azioneCorrettiva:x.get('ac').trim()};if(ssopNC(r)&&(!r.nonConformita||!r.azioneCorrettiva))return alert('Con una NC devi indicare non conformità e azione correttiva.');await saveShared('ssop',r);m.close()});
}
function ssopPDF(){const rows=data.ssop.filter(r=>r.data.startsWith(ssopMonth)).sort((a,b)=>a.data.localeCompare(b.data)),w=open('','_blank'),v=x=>x||'—';w.document.write(`<html><head><style>body{font-family:Arial;padding:18px;font-size:10px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:4px;text-align:center}</style></head><body><h1>CONTROLLO SSOP</h1><h2>${ssopMonth}</h2><table><tr><th>Giorno</th><th>Id.Att PO</th><th>Id.Att PS</th><th>Ig.Att PO</th><th>Ig.Att PS</th><th>Id.Loc PO</th><th>Id.Loc PS</th><th>Ig.Loc PO</th><th>Ig.Loc PS</th><th>Pers.</th><th>Verificatore</th></tr>${rows.map(r=>`<tr><td>${Number(r.data.slice(-2))}</td><td>${v(r.attrezzaturePO)}</td><td>${v(r.attrezzaturePS)}</td><td>${v(r.igieneAttrezzaturePO)}</td><td>${v(r.igieneAttrezzaturePS)}</td><td>${v(r.localiPO)}</td><td>${v(r.localiPS)}</td><td>${v(r.igieneLocaliPO)}</td><td>${v(r.igieneLocaliPS)}</td><td>${v(r.personale)}</td><td>${esc(r.verificatore)}</td></tr>`).join('')}</table><script>onload=()=>print()</script></body></html>`);w.document.close()}

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js');
