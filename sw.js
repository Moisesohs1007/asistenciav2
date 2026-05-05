const CACHE_NAME = 'asistencia-v2-1.2.3';
const ASSETS = [
  './index.html',
  './apoderado.html',
  './manifest.json',
  './css/style.css',
  './css/portal.css',
  './js/main.js',
  './js/portal.js',
  './js/auth.js',
  './js/supabase-client.js',
  './compat.js?v=113',
  './db_supabase.js?v=113',
  './img/wa-logo.png'
];

// Instalar y cachear archivos base
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia: red primero, cache como fallback (Network First)
self.addEventListener('fetch', e => {
  // No cachear peticiones a Supabase (ni API, ni Storage, ni Realtime) ni extensiones
  const url = e.request.url;
  if (url.includes('supabase.co') || url.includes('factiliza') || e.request.method !== 'GET') {
    return;
  }

  // Si es un recurso estático del mismo origen, Network-first
  if (url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
