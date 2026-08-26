const CACHE='haccp-cloud-v4-4-2-icon-force';
const ASSETS=[
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './apple-touch-icon-precomposed.png',
  './favicon-192.png',
  './icons/icon-haccp-v441-180.png',
  './icons/icon-haccp-v441-192.png',
  './icons/icon-haccp-v441-512.png'
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
    const c=r.clone();
    caches.open(CACHE).then(k=>k.put(e.request,c));
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
