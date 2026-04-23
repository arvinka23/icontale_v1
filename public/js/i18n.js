// ═══════════════════════════════════════════════════════════════
//  Client-side i18n runtime
//
//  Loads locale JSON from /locales/<code>.json and exposes a single
//  t(key, vars) helper plus a translatePage() bootstrap that rewrites
//  any element carrying data-i18n / data-i18n-attr="<attr>:<key>"
//  marker attributes.
//
//  Keys use dot-separated paths. Variable interpolation uses {name}.
//  Pluralization is picked automatically when two keys exist under
//  the same prefix with .one / .other suffixes (see settings.chip.
//  rounds in the locale files).
//
//  Missing keys fall back to the key itself and a single console
//  warning per key so regressions are obvious without spamming.
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'icontale_language';
const DEFAULT_LOCALE = 'de';
const SUPPORTED_LOCALES = ['de', 'en'];

const loaded = new Map();  // code -> messages
const missing = new Set(); // already-warned keys
let current = DEFAULT_LOCALE;

function resolveBrowserLocale() {
    // ?lang=en overrides persisted choice and navigator.language so
    // hreflang deep-links and QA URLs always pick the right locale.
    try {
        const urlLocale = new URLSearchParams(window.location.search)
            .get('lang');
        if (urlLocale && SUPPORTED_LOCALES.includes(urlLocale)) return urlLocale;
    } catch { /* URLSearchParams unavailable (very old WebView) */ }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;

    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    const short = nav.slice(0, 2).toLowerCase();
    return SUPPORTED_LOCALES.includes(short) ? short : DEFAULT_LOCALE;
}

async function loadLocale(code) {
    if (loaded.has(code)) return loaded.get(code);
    try {
        const res = await fetch(`/locales/${code}.json`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        loaded.set(code, json);
        return json;
    } catch (err) {
        console.warn('[i18n] failed to load locale', code, err);
        return null;
    }
}

/**
 * Translate a key with optional `{var}` interpolation.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
    const messages = loaded.get(current) || loaded.get(DEFAULT_LOCALE);
    if (!messages) return key;

    let value = messages[key];

    // Pluralisation: `{n}` picks `.one` vs `.other` when both exist.
    if (value === undefined && vars && typeof vars.n === 'number') {
        const suffix = vars.n === 1 ? '.one' : '.other';
        value = messages[key + suffix];
    }

    if (value === undefined) {
        if (!missing.has(key)) {
            missing.add(key);
            console.warn('[i18n] missing key:', key);
        }
        return key;
    }

    if (!vars) return value;

    return value.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
}

/**
 * Rewrite every element in `root` that carries a data-i18n marker.
 * - data-i18n="some.key"            -> element.textContent
 * - data-i18n-attr="title:some.key" -> element.setAttribute('title', …)
 *   (multiple pairs comma-separated)
 * - data-i18n-placeholder="key"     -> element.placeholder
 */
export function translatePage(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.setAttribute('placeholder', t(key));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        const spec = el.getAttribute('data-i18n-attr') || '';
        for (const pair of spec.split(',')) {
            const [attr, key] = pair.split(':').map((s) => s.trim());
            if (attr && key) el.setAttribute(attr, t(key));
        }
    });
}

/** Apply language metadata to <html>. */
function applyHtmlLocale(code) {
    const meta = (loaded.get(code) || {}).$meta || {};
    document.documentElement.setAttribute('lang', meta.language || code);
    if (meta.dir) document.documentElement.setAttribute('dir', meta.dir);
    document.title = t('app.title');
}

/** Switch locale at runtime. Persists the choice in localStorage. */
export async function setLocale(code) {
    if (!SUPPORTED_LOCALES.includes(code)) return;
    await loadLocale(code);
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage disabled */ }
    applyHtmlLocale(code);
    translatePage();
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { locale: code } }));
}

export function getLocale() {
    return current;
}

export function getSupportedLocales() {
    return SUPPORTED_LOCALES.slice();
}

/**
 * Bootstrap: called once at startup. Loads the default + preferred
 * locale (German first as a fallback) and runs translatePage().
 */
export async function initI18n() {
    // Ensure the default locale is available for fallback lookups.
    await loadLocale(DEFAULT_LOCALE);
    const preferred = resolveBrowserLocale();
    if (preferred !== DEFAULT_LOCALE) await loadLocale(preferred);
    current = preferred;
    applyHtmlLocale(current);
    translatePage();
}
