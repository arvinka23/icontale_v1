// ═══════════════════════════════════════════════════════════════
//  Game State + Phase Machine
// ═══════════════════════════════════════════════════════════════

// Valid game phases
export const Phase = Object.freeze({
    MENU:        'menu',
    LOBBY:       'lobby',
    WRITING:     'writing',
    GUESSING:    'guessing',
    RESULTS:     'results',
    LEADERBOARD: 'leaderboard',
    GAMEOVER:    'gameover',
    SPECTATING:  'spectating',
});

// Valid phase transitions
const TRANSITIONS = {
    [Phase.MENU]:        [Phase.LOBBY, Phase.SPECTATING],
    [Phase.LOBBY]:       [Phase.WRITING, Phase.MENU, Phase.SPECTATING],
    [Phase.WRITING]:     [Phase.GUESSING, Phase.LOBBY, Phase.MENU],
    [Phase.GUESSING]:    [Phase.RESULTS, Phase.LOBBY, Phase.MENU],
    [Phase.RESULTS]:     [Phase.LEADERBOARD, Phase.LOBBY, Phase.MENU],
    [Phase.LEADERBOARD]: [Phase.WRITING, Phase.GAMEOVER, Phase.LOBBY, Phase.MENU],
    [Phase.GAMEOVER]:    [Phase.LOBBY, Phase.MENU],
    [Phase.SPECTATING]:  [Phase.MENU],
};

/**
 * Central game state (single source of truth).
 * @type {import('./types').IconTaleState}
 */
export const state = {
    phase:           Phase.MENU,
    roomCode:        null,
    isHost:          false,
    isSpectator:     false,
    settings:        {},
    storySubmitted:  false,
    guessSubmitted:  false,
    soundEnabled:    true,

    selectedEmojiCombo: null,
    selectedPlayerId:   null,

    resultsData:     null,
    resultsPlayers:  [],
    currentChatIdx:  0,
    currentMsgStep:  0,

    lastReplayId:    null,

    writingTimer:    null,
    writingTimeLeft: 180,
    writingMilestonesAnnounced: null,
    typeTextTimers:  [],
    errorTimeout:    null,
};

// Phase change listeners
const listeners = [];

/**
 * Subscribe to phase changes.
 * @param {(newPhase: string, oldPhase: string) => void} fn
 * @returns {() => void} unsubscribe function
 */
export function onPhaseChange(fn) {
    listeners.push(fn);
    return () => {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
    };
}

/**
 * Transition to a new game phase.
 * Validates the transition and cleans up the old phase.
 *
 * @param {string} newPhase one of the Phase values (string so callers
 *   can pass interpolated values without casts)
 * @returns {boolean} whether the transition was accepted
 */
export function setPhase(newPhase) {
    const oldPhase = state.phase;
    /** @type {readonly string[] | undefined} */
    const allowed = TRANSITIONS[/** @type {keyof typeof TRANSITIONS} */ (oldPhase)];

    if (!allowed || !allowed.includes(newPhase)) {
        console.warn(`Invalid phase transition: ${oldPhase} → ${newPhase}`);
        return false;
    }

    cleanupPhase(oldPhase);

    state.phase = /** @type {typeof state.phase} */ (newPhase);

    for (const fn of listeners) {
        try { fn(newPhase, oldPhase); } catch (e) { console.error('Phase listener error:', e); }
    }

    return true;
}

/**
 * Force-set phase (for reconnect scenarios where we skip normal flow).
 * @param {string} newPhase
 */
export function forcePhase(newPhase) {
    cleanupPhase(state.phase);
    state.phase = /** @type {typeof state.phase} */ (newPhase);
}

/**
 * Clean up resources from a phase before leaving it.
 * Prevents memory leaks from timers, intervals, etc.
 */
function cleanupPhase(phase) {
    switch (phase) {
        case Phase.WRITING:
            if (state.writingTimer) {
                clearInterval(state.writingTimer);
                state.writingTimer = null;
            }
            break;

        case Phase.RESULTS:
            // Clean up typeText intervals
            for (const timer of state.typeTextTimers) {
                clearInterval(timer);
            }
            state.typeTextTimers = [];
            break;
    }

    // Always clear error timeout when changing phase
    if (state.errorTimeout) {
        clearTimeout(state.errorTimeout);
        state.errorTimeout = null;
    }
}

/**
 * Reset all game state for a new game / back to lobby.
 */
export function resetGameState() {
    cleanupPhase(state.phase);

    state.storySubmitted = false;
    state.guessSubmitted = false;
    state.selectedEmojiCombo = null;
    state.selectedPlayerId = null;
    state.resultsData = null;
    state.resultsPlayers = [];
    state.currentChatIdx = 0;
    state.currentMsgStep = 0;
    state.writingTimeLeft = 180;
}

// ── Session persistence (for reconnect) ─────────────────────

export function saveSession(roomCode) {
    localStorage.setItem('icontale_session_token', `${roomCode}:${Date.now()}`);
    localStorage.setItem('icontale_room_code', roomCode);
}

export function clearSession() {
    localStorage.removeItem('icontale_session_token');
    localStorage.removeItem('icontale_room_code');
}

export function getStoredSession() {
    const token = localStorage.getItem('icontale_session_token');
    const room  = localStorage.getItem('icontale_room_code');
    return (token && room) ? { token, room } : null;
}
