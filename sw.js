// Service Worker: permite que la app cargue (el "shell": HTML/CSS/JS/íconos) aunque
// no haya conexión, una vez que se visitó al menos una vez con internet. No cachea ni
// intercepta llamadas a Supabase (son de otro origen) — esas siguen fallando natural-
// mente sin red, y la app ya las maneja con la cola de Pendientes.
// v2: al subir este número, los teléfonos borran el caché anterior (que podía tener guardado un HTML
// en lugar de un archivo .js después de un despliegue).
const CACHE_NAME = 'ibp-app-shell-v2';
const CORE_ASSETS = ['/', '/manifest.webmanifest', '/favicon.ico'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no tocar Supabase / fuentes externas

  const esArchivoConHash = url.pathname.startsWith('/assets/');

  // Solo se guarda lo que de verdad es el archivo pedido: algunos hostings (p. ej. Netlify con una regla
  // "todo a index.html") responden con el HTML de la app cuando un archivo ya no existe; guardar eso en
  // caché dejaría la app rota incluso sin conexión.
  const guardable = response => {
    if (!response || !response.ok) return false;
    const tipo = response.headers.get('content-type') || '';
    return request.mode === 'navigate' || !tipo.includes('text/html');
  };
  const guardar = response => {
    if (guardable(response)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  };

  if (esArchivoConHash) {
    // Su nombre cambia con cada versión (nunca cambia el contenido de un nombre): primero el caché.
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(guardar)));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(guardar)
      .catch(() =>
        caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});
