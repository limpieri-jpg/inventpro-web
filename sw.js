// InventPro Service Worker — cache offline essenziale
const CACHE = 'inventpro-v1'
const OFFLINE_URL = '/inventpro-web/'

// Asset statici da pre-cachare
const PRECACHE = [
  '/inventpro-web/',
  '/inventpro-web/index.html',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Solo GET, ignora richieste Supabase/API
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.hostname.includes('supabase') || url.hostname.includes('anthropic') || url.hostname.includes('resend')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cacha le risorse statiche (JS, CSS, font)
        if (res.ok && (url.pathname.match(/\.(js|css|woff2?|png|jpg|svg)$/) || url.pathname === '/inventpro-web/')) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match(OFFLINE_URL)))
  )
})
