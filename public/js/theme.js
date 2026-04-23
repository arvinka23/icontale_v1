// ═══════════════════════════════════════════════════════════════
//  Theme (dark / light / auto)
//
//  Users can explicitly pick a theme; the choice is persisted in
//  localStorage. 'auto' (the default) follows prefers-color-scheme.
//
//  The decision is applied by toggling `data-theme="dark|light"`
//  on <html>, and styles.css overrides the root tokens for the
//  light theme via `:root[data-theme='light']`.
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'icontale_theme';
const VALID = ['auto', 'dark', 'light'];

function systemPrefersDark() {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );
}

export function getStoredTheme() {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : 'auto';
}

export function resolveTheme(choice = getStoredTheme()) {
    if (choice === 'dark' || choice === 'light') return choice;
    return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(choice = getStoredTheme()) {
    const resolved = resolveTheme(choice);
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', resolved === 'dark' ? '#1a1625' : '#f5f3f8');
    }

    updateToggleUi(choice, resolved);
}

/**
 * Cycle through auto -> light -> dark -> auto.
 * Returns the new user choice (not the resolved theme).
 */
export function cycleTheme() {
    const current = getStoredTheme();
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    return next;
}

function updateToggleUi(choice, resolved) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    const icon = resolved === 'dark' ? '🌙' : '☀️';
    const label =
        choice === 'auto'  ? `Theme: automatisch (${resolved === 'dark' ? 'Dunkel' : 'Hell'})` :
        choice === 'dark'  ? 'Theme: Dunkel'
                           : 'Theme: Hell';

    btn.textContent = icon;
    btn.setAttribute('aria-label', `${label}. Klicken zum Wechseln.`);
    btn.setAttribute('title', label);
    btn.dataset.themeChoice = choice;
}

/**
 * Call once at startup. Wires the toggle button and listens for
 * system theme changes so 'auto' mode tracks them live.
 */
export function initTheme() {
    applyTheme();

    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', () => cycleTheme());

    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => {
            if (getStoredTheme() === 'auto') applyTheme('auto');
        };
        // Both addEventListener and the legacy addListener are needed
        // for older Safari versions. Try/catch keeps startup safe.
        try { mq.addEventListener('change', listener); }
        catch { mq.addListener(listener); }
    }
}
