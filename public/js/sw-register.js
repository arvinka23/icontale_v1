// ═══════════════════════════════════════════════════════════════
//  Service Worker Registration
//  Split out of index.html so that the page can run under a strict
//  Content-Security-Policy without `script-src 'unsafe-inline'`.
// ═══════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            // A failed registration is non-fatal: the app still works
            // without offline support. Keep a single-line console entry
            // so problems are visible in devtools without noisy stack traces.
            console.warn('[sw] registration failed:', err && err.message);
        });
    });
}
