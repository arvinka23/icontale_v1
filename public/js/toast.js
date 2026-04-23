// ═══════════════════════════════════════════════════════════════
//  Toast Notifications
//
//  One module, three levels (info / success / error) and two ARIA
//  live regions:
//
//     - info/success go into a role="status" region (polite),
//     - error goes into a role="alert" region (assertive),
//
//  so positive messages never steal focus or announcement priority
//  from actual error messages. Multiple toasts stack vertically and
//  self-dismiss after a level-specific timeout.
//
//  Replaces the previous `showError()` helper, which rendered both
//  positive and negative messages in the same red box and reset
//  itself every call.
// ═══════════════════════════════════════════════════════════════

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = {
    info:    3500,
    success: 3000,
    error:   6000,
};

let stackEl = null;
let statusRegion = null;
let alertRegion = null;

function ensureRegions() {
    if (stackEl) return;
    stackEl = document.getElementById('toast-stack');
    if (!stackEl) return;
    statusRegion = stackEl.querySelector('.toast-region-status');
    alertRegion = stackEl.querySelector('.toast-region-alert');
}

function trimRegion(region) {
    while (region && region.children.length > MAX_VISIBLE) {
        region.firstElementChild.remove();
    }
}

/**
 * Show a toast notification.
 * @param {string} message - user-visible text (already translated).
 * @param {'info'|'success'|'error'} [level] - severity, default 'info'.
 * @param {{ duration?: number }} [options]
 * @returns {HTMLElement|null} the toast element, or null if the DOM
 *   is not ready yet (e.g. called before <body> parsed).
 */
export function showToast(message, level = 'info', options = {}) {
    ensureRegions();
    if (!stackEl) return null;

    const region = level === 'error' ? alertRegion : statusRegion;
    if (!region) return null;

    const toast = document.createElement('div');
    toast.className = `toast toast-${level}`;

    const icon = document.createElement('span');
    icon.className = 'toast-emoji';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = level === 'error' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
    toast.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    toast.appendChild(text);

    region.appendChild(toast);
    trimRegion(region);

    const duration = options.duration ?? DEFAULT_DURATION[level] ?? DEFAULT_DURATION.info;
    const timer = setTimeout(() => dismiss(toast), duration);

    toast.addEventListener('click', () => {
        clearTimeout(timer);
        dismiss(toast);
    });

    return toast;
}

function dismiss(toast) {
    if (!toast || !toast.isConnected) return;
    toast.classList.add('toast-leaving');
    // Match the CSS leave animation (250 ms). Fall back to immediate
    // removal if the class never took effect (e.g. reduced-motion).
    setTimeout(() => toast.remove(), 260);
}

/** Shortcut helpers — keep call sites short and intention-revealing. */
export const toastInfo    = (msg, opts) => showToast(msg, 'info', opts);
export const toastSuccess = (msg, opts) => showToast(msg, 'success', opts);
export const toastError   = (msg, opts) => showToast(msg, 'error', opts);
