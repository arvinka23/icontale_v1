// ═══════════════════════════════════════════════════════════════
//  Focus trap utility
//
//  Keeps keyboard focus inside a modal container while it is open,
//  restores focus to the trigger element on close and wires the
//  Escape key. Used by the tutorial overlay and the replay modal.
//
//  Intentionally free of dependencies so any overlay component can
//  adopt it. Call activateFocusTrap(...) when the modal opens, save
//  the returned handle, then call handle.release() when it closes.
// ═══════════════════════════════════════════════════════════════

const FOCUSABLE = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]:not([contenteditable="false"])',
].join(',');

function getFocusable(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return false;
        if (el.closest('[hidden]')) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

/**
 * Activate a focus trap inside `container`.
 *
 * @param {HTMLElement} container
 * @param {{ onEscape?: () => void, initialFocus?: HTMLElement }} [opts]
 * @returns {{ release: () => void }}
 */
export function activateFocusTrap(container, opts = {}) {
    const { onEscape, initialFocus } = opts;
    const previouslyFocused = document.activeElement;

    function onKeydown(e) {
        if (e.key === 'Escape' && typeof onEscape === 'function') {
            e.preventDefault();
            onEscape();
            return;
        }

        if (e.key !== 'Tab') return;

        const focusable = getFocusable(container);
        if (focusable.length === 0) {
            e.preventDefault();
            container.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || !container.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }

    container.addEventListener('keydown', onKeydown);

    // Make sure the container itself is focusable so the initial focus
    // call has something sensible to land on when there is nothing else.
    if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
    }

    const target = initialFocus || getFocusable(container)[0] || container;
    // Defer one tick so the element is actually visible (the 'hidden'
    // class toggle happens synchronously before this is called).
    setTimeout(() => target.focus(), 0);

    return {
        release() {
            container.removeEventListener('keydown', onKeydown);
            if (previouslyFocused instanceof HTMLElement) {
                try { previouslyFocused.focus(); } catch (_) { /* detached node */ }
            }
        },
    };
}
