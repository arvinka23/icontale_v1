// Tiny pre-paint shim. Runs before the main bundle so the chosen
// theme is applied on first paint (no "flash of wrong theme").
//
// Kept as a separate blocking <script> in <head> because the main
// app entry is a module and therefore deferred by default.
(function () {
    try {
        var stored = localStorage.getItem('icontale_theme');
        var choice = stored === 'dark' || stored === 'light' ? stored : null;
        var resolved =
            choice ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light');
        document.documentElement.setAttribute('data-theme', resolved);
    } catch (_) {
        // localStorage blocked (privacy mode, etc.) — fall back to
        // the CSS default theme.
    }
})();
