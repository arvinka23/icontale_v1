// ═══════════════════════════════════════════════════════════════
//  IconTale — Service Worker (PWA shell cache)
//
//  The cache name is patched at build time (scripts/build-assets.js
//  could be extended to replace __ICONTALE_VERSION__ with the current
//  package.json version / git SHA). If no substitution happens, the
//  placeholder still yields a valid string, so the SW keeps working
//  in dev.
// ═══════════════════════════════════════════════════════════════

const VERSION = '__ICONTALE_VERSION__';
const CACHE_NAME = `icontale-${VERSION === '__ICONTALE_VERSION__' ? 'dev' : VERSION}`;

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
    '/js/replay.js',
    '/js/sw-register.js',
    '/js/toast.js',
    '/js/theme.js',
    '/js/theme-preload.js',
    '/js/focus-trap.js',
    '/js/radio-nav.js',
    '/js/i18n.js',
    '/locales/de.json',
    '/locales/en.json',
    '/manifest.json',
    '/favicon.ico',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable.png',
    '/fonts/inter-latin-400-normal.woff2',
    '/fonts/inter-latin-500-normal.woff2',
    '/fonts/inter-latin-600-normal.woff2',
    '/fonts/inter-latin-700-normal.woff2',
    '/fonts/inter-latin-800-normal.woff2',
];

// Install: cache shell assets (best-effort; missing files are logged
// but don't abort the install — useful for hashed CSS variants).
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.all(
                SHELL_ASSETS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[sw] failed to cache', url, err && err.message);
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

// Activate: drop old caches.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first, falling back to the cached shell when offline.
// Socket.io traffic and API endpoints are never intercepted.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;
    if (url.pathname.startsWith('/socket.io')) return;
    if (url.pathname.startsWith('/replay/')) return;
    if (url.pathname === '/health') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
