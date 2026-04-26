// ═══════════════════════════════════════════════════════════════
//  IconTale — Main Entry Point (ES Module)
// ═══════════════════════════════════════════════════════════════

import { state } from './state.js';
import { dom, countWords } from './dom.js';
import { toastError } from './toast.js';
import {
    loadUserEmoji, randomizeEmoji, setTab, initSettingsUI,
    gatherSettings, showTutorial, hideTutorial,
} from './ui.js';
import { loadSoundPreference, playClick } from './sounds.js';
import { registerSocketHandlers } from './socket-handlers.js';
import { initTheme } from './theme.js';
import { initI18n, t, setLocale, getLocale, getSupportedLocales } from './i18n.js';

// ── Socket.io ───────────────────────────────────────────────
// Fetch a short-lived handshake token before the WebSocket upgrade
// so the server can verify that whoever is connecting actually
// loaded the page first. If the fetch fails (offline, proxy error)
// we still try to connect; the server logs the missing token and
// — unless ENFORCE_SOCKET_AUTH is set — accepts the connection so
// the existing UX continues to work.
async function fetchSocketToken() {
    try {
        const res = await fetch('/api/socket-token', { credentials: 'same-origin' });
        if (!res.ok) return '';
        const data = await res.json();
        return typeof data.token === 'string' ? data.token : '';
    } catch {
        return '';
    }
}

const socket = window.io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: false,
    auth: (cb) => {
        fetchSocketToken().then((token) => cb({ token }));
    },
});

// Register all socket event handlers
registerSocketHandlers(socket);

// ── Settings Emit ───────────────────────────────────────────
function emitSettings() {
    if (!state.roomCode || !state.isHost) return;
    const settings = gatherSettings();
    socket.emit('update-settings', { roomCode: state.roomCode, settings });
}

function setMenuFeedback(message = '') {
    const feedback = document.getElementById('menu-feedback');
    if (!feedback) return;
    if (!message) {
        feedback.textContent = '';
        feedback.classList.add('hidden');
        return;
    }
    feedback.textContent = message;
    feedback.classList.remove('hidden');
}

// ── Event Bindings ──────────────────────────────────────────

// Emoji selection
dom.changeEmoji.onclick = () => randomizeEmoji();

// Tab switching
dom.tabCreate.onclick = () => { setTab('create'); playClick(); };
dom.tabJoin.onclick   = () => { setTab('join');   playClick(); };

const tabButtons = [dom.tabCreate, dom.tabJoin];
tabButtons.forEach((btn, idx) => {
    btn.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = e.key === 'ArrowRight' ? (idx + 1) % tabButtons.length : (idx - 1 + tabButtons.length) % tabButtons.length;
        tabButtons[next].focus();
        tabButtons[next].click();
    });
});

// Tutorial
dom.tutorialClose.onclick = hideTutorial;
dom.tutorialStart.onclick = hideTutorial;
dom.helpBtn.onclick = showTutorial;

// ── Story draft autosave ─────────────────────────────────────
// Persist the current textarea contents in sessionStorage so an
// accidental reload or browser crash during the writing phase does
// not silently wipe the player's story. Keyed per lobby + round so
// drafts don't leak between games in the same tab.
function draftKey() {
    if (!state.roomCode) return null;
    const round = dom.roundCurrent?.textContent || '0';
    return `icontale_draft_${state.roomCode}_r${round}`;
}

function saveDraft() {
    const key = draftKey();
    if (!key) return;
    const value = dom.writingStory.value;
    if (value && !state.storySubmitted) {
        try { sessionStorage.setItem(key, value); } catch { /* storage full / disabled */ }
    } else {
        try { sessionStorage.removeItem(key); } catch { /* noop */ }
    }
}

export function restoreDraftIfAny() {
    const key = draftKey();
    if (!key) return;
    try {
        const saved = sessionStorage.getItem(key);
        if (saved && !dom.writingStory.value) {
            dom.writingStory.value = saved;
            dom.wordCount.textContent = String(countWords(saved));
        }
    } catch { /* ignore */ }
}

export function clearDraft() {
    const key = draftKey();
    if (!key) return;
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

let draftSaveTimer = null;
function scheduleDraftSave() {
    if (draftSaveTimer) return;
    draftSaveTimer = setTimeout(() => {
        draftSaveTimer = null;
        saveDraft();
    }, 1500);
}

// Word count (writing phase) + debounced draft autosave
dom.writingStory.addEventListener('input', () => {
    const words = countWords(dom.writingStory.value);
    dom.wordCount.textContent = String(words);
    const limit = parseInt(dom.wordLimit.textContent ?? '500') || 500;
    dom.wordCount.classList.toggle('over-limit', words > limit);
    scheduleDraftSave();
});

window.addEventListener('beforeunload', saveDraft);

// Submit / Edit story toggle
dom.writingFinishBtn.onclick = () => {
    if (!state.storySubmitted) {
        const story = dom.writingStory.value.trim();
        if (!story) return toastError(t('writing.error.empty'));
        const words = countWords(story);
        const limit = parseInt(dom.wordLimit.textContent) || 500;
        if (words > limit) return toastError(t('writing.error.tooLong', { limit, words }));

        socket.emit('submit-story', { roomCode: state.roomCode, story });
        state.storySubmitted = true;
        dom.writingStory.disabled = true;
        dom.writingSection.classList.add('writing-finished');
        dom.writingFinishBtn.innerHTML = '<span class="btn-icon">✏️</span> Bearbeiten';
        clearDraft();
        playClick();
    } else {
        state.storySubmitted = false;
        dom.writingStory.disabled = false;
        dom.writingSection.classList.remove('writing-finished');
        dom.writingFinishBtn.innerHTML = '<span class="btn-icon">✅</span> Abschicken';
    }
};

// Results continue
dom.resultsContinueBtn.onclick = () => {
    socket.emit('results-continue', { roomCode: state.roomCode });
};

// Round/game buttons
dom.nextRoundBtn.onclick = () => {
    socket.emit('next-round', { roomCode: state.roomCode });
};

dom.newGameBtn.onclick = () => {
    socket.emit('new-game', { roomCode: state.roomCode });
};

dom.gameoverNewGameBtn.onclick = () => {
    socket.emit('new-game', { roomCode: state.roomCode });
};

// Replay viewer (if replay button exists in game-over screen)
document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement | null} */ (e.target);
    if (target && target.closest('#replay-btn') && state.lastReplayId) {
        import('./replay.js').then(({ openReplay }) => {
            openReplay(state.lastReplayId);
        });
    }
});

// Menu action (create / join)
dom.menuActionBtn.onclick = () => {
    setMenuFeedback('');
    const username = dom.username.value.trim();
    const userEmoji = localStorage.getItem('icontale_user_emoji') || '😀';

    if (!username) {
        setMenuFeedback(t('menu.feedback.nameRequired'));
        return toastError(t('error.usernameRequired'));
    }

    if (dom.tabCreate.classList.contains('active')) {
        socket.emit('create-lobby', { username, emoji: userEmoji });
    } else {
        const roomCode = dom.roomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 6) {
            setMenuFeedback(t('menu.feedback.roomCodeHint'));
            return toastError(t('error.roomCodeInvalid'));
        }
        socket.emit('join-lobby', { username, roomCode, emoji: userEmoji });
    }
    playClick();
};

dom.spectatorBtn.onclick = () => {
    const roomCode = dom.roomCodeInput.value.trim().toUpperCase();
    if (roomCode.length !== 6) {
        setMenuFeedback(t('menu.feedback.roomCodeHint'));
        return toastError(t('error.roomCodeInvalid'));
    }
    socket.emit('join-spectator', { roomCode });
};

dom.startGame.onclick = () => {
    if (state.roomCode && state.isHost) {
        socket.emit('start-game', { roomCode: state.roomCode });
        playClick();
    }
};

// Keyboard: Enter to submit in menu
dom.username.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.menuActionBtn.click();
});
dom.roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.menuActionBtn.click();
});
dom.username.addEventListener('input', () => setMenuFeedback(''));
dom.roomCodeInput.addEventListener('input', () => {
    if (!dom.tabJoin.classList.contains('active')) {
        setMenuFeedback('');
        return;
    }
    const code = dom.roomCodeInput.value.trim().toUpperCase();
    if (code.length === 0 || code.length === 6) {
        setMenuFeedback('');
        return;
    }
    setMenuFeedback(t('menu.feedback.roomCodeProgress', { remaining: 6 - code.length }));
});

// ── Lobby share (copy code / link) ──────────────────────────

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fall through to the legacy path */ }

    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

if (dom.copyCodeBtn) {
    dom.copyCodeBtn.onclick = async () => {
        if (!state.roomCode) return;
        const ok = await copyToClipboard(state.roomCode);
        const { toastSuccess, toastError } = await import('./toast.js');
        if (ok) toastSuccess(t('lobby.copyCode.success', { code: state.roomCode }));
        else    toastError(t('lobby.copy.fail'));
    };
}

if (dom.copyLinkBtn) {
    dom.copyLinkBtn.onclick = async () => {
        if (!state.roomCode) return;
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', state.roomCode);
        const ok = await copyToClipboard(url.toString());
        const { toastSuccess, toastError } = await import('./toast.js');
        if (ok) toastSuccess(t('lobby.copyLink.success'));
        else    toastError(t('lobby.copy.fail'));
    };
}

// ── Deeplink (?room=XYZ123) ─────────────────────────────────

function getDeeplinkRoomCode() {
    const params = new URLSearchParams(window.location.search);
    const candidate = (params.get('room') || '').trim().toUpperCase();
    return /^[A-Z0-9]{6}$/.test(candidate) ? candidate : '';
}

(function prefillFromDeeplink() {
    const candidate = getDeeplinkRoomCode();
    if (!candidate) return;

    setTab('join');
    dom.roomCodeInput.value = candidate;
    // Keep the username input focused so the user just has to type
    // their nickname and press Enter — no extra clicks.
    setTimeout(() => dom.username.focus(), 0);
})();

// ── Language toggle ─────────────────────────────────────────
// Cycles through the supported locales on click. Full RTL or user-
// facing locale selector UI is tracked in the improvement plan.
const languageToggle = document.getElementById('language-toggle');
if (languageToggle) {
    languageToggle.addEventListener('click', () => {
        const locales = getSupportedLocales();
        const idx = locales.indexOf(getLocale());
        const next = locales[(idx + 1) % locales.length];
        setLocale(next);
    });
}

// Re-render the pieces of UI that live inside JS strings (setTab,
// non-host settings chips, start hint) whenever the locale changes.
window.addEventListener('i18n:change', () => {
    setTab(dom.tabCreate.classList.contains('active') ? 'create' : 'join');
    if (state.roomCode && !state.isHost && state.settings) {
        // Re-emit a dummy settings update — gatherSettings runs on the
        // locally cached values so the chips pick up the new language.
        document.dispatchEvent(new CustomEvent('icontale:rerender-settings'));
    }
});

// ── Initialization ──────────────────────────────────────────
await initI18n();
initTheme();
loadUserEmoji();
loadSoundPreference();
setTab('create');
initSettingsUI(emitSettings);

// Defer websocket handshake until initial UI is painted.
requestAnimationFrame(() => socket.connect());

// Show tutorial on first visit
const hasTutorialSeen = !!localStorage.getItem('icontale_tutorial_seen');
const hasDeepLink = !!getDeeplinkRoomCode();
if (!hasTutorialSeen && !hasDeepLink) {
    showTutorial();
}

console.info('[IconTale] Client initialized (ES Modules)');
