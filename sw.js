// sw.js - Service Worker para BananaPass

// Define un nombre para la caché actual. Cámbialo si haces cambios significativos en los archivos cacheados.
const CACHE_NAME = 'bananapass-cache-v1';

// Lista de URLs que se van a pre-cachear cuando el Service Worker se instale.
const URLS_TO_CACHE = [
  '/', // La página principal (asume que es index.html en la raíz)
  '/index.html', // Cachear explícitamente index.html también
  '/logo.png',
  '/manifest.json',
  '/assets/images/hero-background.jpg',
  '/assets/images/blog-oaxaca.jpg',
  '/assets/images/placeholder-post.jpg' // Como se discutió, para el blog
  // Los recursos externos (CDNs como Swiper, Google Fonts) se intentarán cachear dinámicamente
  // por el manejador 'fetch' si es posible (si tienen cabeceras CORS correctas).
];

// Evento 'install': Se dispara cuando el Service Worker se registra por primera vez o se actualiza.
self.addEventListener('install', event => {
  console.log('[Service Worker] Evento: install');
  // event.waitUntil() asegura que el SW no se instale hasta que el código dentro se complete.
  event.waitUntil(
    caches.open(CACHE_NAME) // Abre la caché especificada.
      .then(cache => {
        console.log('[Service Worker] Pre-cacheando URLs principales');
        return cache.addAll(URLS_TO_CACHE); // Añade todos los archivos de la lista a la caché.
      })
      .then(() => {
        // Fuerza al Service Worker en espera a convertirse en el activo.
        // Útil para que las actualizaciones del SW se activen más rápido.
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Falló el pre-cacheo:', error);
      })
  );
});

// Evento 'activate': Se dispara después de 'install' y cuando el SW toma control de la página.
// Es un buen lugar para limpiar cachés antiguas.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Evento: activate');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Si el nombre de una caché no coincide con la CACHE_NAME actual, se elimina.
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Permite que un Service Worker activo tome control inmediato de los clientes (páginas)
      // en su scope que no estén ya controlados por otro SW.
      return self.clients.claim();
    })
  );
});

// Evento 'fetch': Se dispara cada vez que la página (o el propio SW) realiza una solicitud de red.
self.addEventListener('fetch', event => {
  // Solo nos interesan las solicitudes GET.
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignorar las solicitudes que no son HTTP/HTTPS (ej. chrome-extension://)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Estrategia: Cache First, luego Network. Y cachear dinámicamente las nuevas respuestas.
  event.respondWith(
    caches.match(event.request) // Intenta encontrar la solicitud en la caché.
      .then(cachedResponse => {
        // Si la respuesta está en la caché, la devuelve.
        if (cachedResponse) {
          // console.log('[Service Worker] Sirviendo desde caché:', event.request.url);
          return cachedResponse;
        }

        // Si no está en caché, la busca en la red.
        // console.log('[Service Worker] Solicitando a la red:', event.request.url);
        // Clonamos la solicitud. Una solicitud es un stream y solo puede ser consumida una vez.
        // Necesitamos una para el fetch y otra para el cache.put si la respuesta es exitosa.
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          networkResponse => {
            // Si la solicitud de red falla o devuelve un error, no la cacheamos.
            // Solo cacheamos respuestas válidas (status 200) y que sean 'basic' (mismo origen)
            // o 'cors' (otro origen con cabeceras CORS correctas).
            // Evitamos cachear 'opaque' responses directamente aquí porque no podemos verificar su estado.
            if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
              // console.log(`[Service Worker] No se cachea ${event.request.url} - Estado: ${networkResponse ? networkResponse.status : 'N/A'}, Tipo: ${networkResponse ? networkResponse.type : 'N/A'}`);
              return networkResponse; // Devuelve la respuesta problemática tal cual.
            }

            // Clonamos la respuesta. Una respuesta es un stream y también solo puede ser consumida una vez.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('[Service Worker] Cacheando nuevo recurso:', event.request.url);
                cache.put(event.request, responseToCache); // Guarda la respuesta en caché.
              });

            return networkResponse; // Devuelve la respuesta de red.
          }
        ).catch(error => {
          console.error('[Service Worker] Fallo en Fetch; para:', event.request.url, error);
          // Aquí podrías devolver una página offline genérica si la solicitud era para navegación:
          // if (event.request.mode === 'navigate') {
          //   return caches.match('/offline.html'); // Necesitarías crear y pre-cachear offline.html
          // }
          // Para otras solicitudes (imágenes, etc.), deja que el navegador maneje el error.
        });
      })
  );
});