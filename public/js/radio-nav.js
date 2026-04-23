// ═══════════════════════════════════════════════════════════════
//  Arrow-key navigation for ARIA radio groups
//
//  Browsers give buttons role='radio' inside a role='radiogroup'
//  only basic tab semantics — left/right/up/down arrow navigation
//  is the author's job. This module wires that up uniformly and
//  implements the "roving tabindex" pattern so only one button
//  per group is in the tab order at a time.
//
//  Call enhanceRadioGroup(groupElement, childSelector) once per
//  group. The enhancer is idempotent: calling it again on the same
//  container is a no-op unless the children changed.
// ═══════════════════════════════════════════════════════════════

const PROCESSED = new WeakSet();

export function enhanceRadioGroup(container, childSelector = '[role="radio"], .setting-btn') {
    if (!container) return;

    const children = Array.from(container.querySelectorAll(childSelector));
    if (children.length === 0) return;

    setRovingTabindex(children);

    if (PROCESSED.has(container)) return;
    PROCESSED.add(container);

    container.addEventListener('keydown', (e) => {
        const items = Array.from(container.querySelectorAll(childSelector))
            .filter((el) => !el.disabled);
        if (items.length === 0) return;

        const activeIdx = items.indexOf(document.activeElement);
        let nextIdx = activeIdx;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextIdx = (activeIdx + 1) % items.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIdx = (activeIdx - 1 + items.length) % items.length;
                break;
            case 'Home':
                nextIdx = 0;
                break;
            case 'End':
                nextIdx = items.length - 1;
                break;
            case ' ':
            case 'Enter':
                if (activeIdx >= 0) {
                    e.preventDefault();
                    items[activeIdx].click();
                }
                return;
            default:
                return;
        }

        e.preventDefault();
        const target = items[nextIdx];
        if (target) {
            setRovingTabindex(items, target);
            target.focus();
            target.click();
        }
    });

    // Keep tabindex in sync when callers toggle .active / aria-checked
    // outside of this module (e.g. network updates).
    const observer = new MutationObserver(() => {
        const refreshed = Array.from(container.querySelectorAll(childSelector));
        setRovingTabindex(refreshed);
    });
    observer.observe(container, {
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-checked', 'class'],
    });
}

function setRovingTabindex(items, preferred) {
    const chosen =
        preferred ||
        items.find((el) => el.getAttribute('aria-checked') === 'true') ||
        items.find((el) => el.classList.contains('active')) ||
        items[0];

    for (const el of items) {
        el.tabIndex = el === chosen ? 0 : -1;
    }
}
