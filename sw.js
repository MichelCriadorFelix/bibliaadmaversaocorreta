// Service Worker Vercel Friendly - v8 (Cache Busting Update)
const CACHE_NAME = 'adma-bible-v8';

// Assets críticos que devem estar sempre disponíveis offline
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/icon-192.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Tenta cachear, mas não falha se algum recurso externo falhar
      return cache.addAll(PRECACHE_ASSETS).catch(err => console.warn('Precache warning', err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. APIs do próprio app (Next/Vercel) e Google Gemini NÃO devem ser cacheadas pelo SW
  // Elas são dinâmicas ou gerenciadas pela lógica da aplicação (Database Cache)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('googleapis')) {
      return; 
  }

  // 2. Fontes e Scripts Externos (Google Fonts, Tailwind, Lucide via ESM)
  // Estratégia: Stale-While-Revalidate (Usa cache se tiver, mas atualiza em background)
  if (url.hostname.includes('fonts') || url.hostname.includes('cdn.tailwindcss') || url.hostname.includes('esm.sh')) {
     event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
           const cachedResponse = await cache.match(event.request);
           const fetchPromise = fetch(event.request).then((networkResponse) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
           }).catch(() => cachedResponse); // Se falhar rede, retorna o que tem (mesmo se stale)

           return cachedResponse || fetchPromise;
        })
     );
     return;
  }

  // 3. Navegação (HTML) e Assets Locais
  // Estratégia: Network First, falling back to Cache
  if (event.request.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request).then(response => {
              // Se achou, retorna. Se for navegação e não achou, retorna index.html (SPA)
              if (response) return response;
              if (event.request.mode === 'navigate') return caches.match('/index.html');
              return null;
          });
        })
    );
    return;
  }
});
