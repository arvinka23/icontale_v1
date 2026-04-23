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
import { loadSoundPreference, toggleSound, playClick } from './sounds.js';
import { registerSocketHandlers } from './socket-handlers.js';
import { openReplay } from './replay.js';
import { initTheme } from './theme.js';

// ── Socket.io (loaded globally via <script> tag) ────────────
// socket.io.js exposes a global `io(opts)` factory on window. We
// narrow it to the surface public/js actually uses so the checker
// can verify every emit/on call.
const socket = /** @type {import('./types').ClientSocket} */ (
    /** @type {(opts?: object) => unknown} */ (
        /** @type {any} */ (window).io
    )({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    })
);

// Register all socket event handlers
registerSocketHandlers(socket);

// ── Settings Emit ───────────────────────────────────────────
function emitSettings() {
    if (!state.roomCode || !state.isHost) return;
    const settings = gatherSettings();
    socket.emit('update-settings', { roomCode: state.roomCode, settings });
}

// ── Event Bindings ──────────────────────────────────────────

// Emoji selection
dom.changeEmoji.onclick = () => randomizeEmoji();

// Tab switching
dom.tabCreate.onclick = () => { setTab('create'); playClick(); };
dom.tabJoin.onclick   = () => { setTab('join');   playClick(); };

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
        if (!story) return toastError('Bitte schreibe eine Geschichte.');
        const words = countWords(story);
        const limit = parseInt(dom.wordLimit.textContent) || 500;
        if (words > limit) return toastError(`Max ${limit} Wörter erlaubt (aktuell: ${words}).`);

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
        openReplay(state.lastReplayId);
    }
});

// Menu action (create / join)
dom.menuActionBtn.onclick = () => {
    const username = dom.username.value.trim();
    const userEmoji = localStorage.getItem('icontale_user_emoji') || '😀';

    if (!username) return toastError('Bitte gib einen Namen ein.');

    if (dom.tabCreate.classList.contains('active')) {
        socket.emit('create-lobby', { username, emoji: userEmoji });
    } else {
        const roomCode = dom.roomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 6) return toastError('Bitte gib einen gültigen 6-stelligen Code ein.');
        socket.emit('join-lobby', { username, roomCode, emoji: userEmoji });
    }
    playClick();
};

dom.spectatorBtn.onclick = () => {
    const roomCode = dom.roomCodeInput.value.trim().toUpperCase();
    if (roomCode.length !== 6) return toastError('Bitte gib einen gültigen 6-stelligen Code ein.');
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

// ── Lobby share (copy code / link) ──────────────────────────

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) { /* fall through to the legacy path */ }

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
        if (ok) toastSuccess(`Lobby-Code ${state.roomCode} kopiert.`);
        else    toastError('Kopieren fehlgeschlagen. Bitte den Code manuell übernehmen.');
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
        if (ok) toastSuccess('Einladungslink kopiert.');
        else    toastError('Kopieren fehlgeschlagen.');
    };
}

// ── Deeplink (?room=XYZ123) ─────────────────────────────────

(function prefillFromDeeplink() {
    const params = new URLSearchParams(window.location.search);
    const candidate = (params.get('room') || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(candidate)) return;

    setTab('join');
    dom.roomCodeInput.value = candidate;
    // Keep the username input focused so the user just has to type
    // their nickname and press Enter — no extra clicks.
    setTimeout(() => dom.username.focus(), 0);
})();

// ── Initialization ──────────────────────────────────────────
initTheme();
loadUserEmoji();
loadSoundPreference();
setTab('create');
initSettingsUI(emitSettings);

// Show tutorial on first visit
if (!localStorage.getItem('icontale_tutorial_seen')) {
    showTutorial();
}

console.info('[IconTale] Client initialized (ES Modules)');
