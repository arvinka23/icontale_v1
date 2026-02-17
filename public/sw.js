// ═══════════════════════════════════════════════════════════════
//  IconTale — Service Worker (PWA Shell Cache)
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'icontale-v3';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/js/main.js',
    '/js/constants.js',
    '/js/state.js',
    '/js/dom.js',
    '/js/ui.js',
    '/js/sounds.js',
    '/js/socket-handlers.js',
    '/manifest.json',
    '/favicon.ico',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable.png',
    '/og-image.png',
];

// Install: cache shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first for API/socket, cache-first for shell
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET and socket.io requests
    if (event.request.method !== 'GET' || url.pathname.startsWith('/socket.io')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
