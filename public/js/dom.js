// ═══════════════════════════════════════════════════════════════
//  DOM References + Utility Functions
// ═══════════════════════════════════════════════════════════════

import { state } from './state.js';
import { toastError } from './toast.js';

/**
 * Typed getElementById wrapper. The caller picks the expected element
 * subtype so downstream code can use .value / .checked / .dataset
 * without extra casts under checkJs.
 *
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
const $ = (id) => /** @type {T} */ (document.getElementById(id));

/**
 * All DOM element references, cached once on module load. Types are
 * annotated so public/js/tsconfig.client.json can verify .value,
 * .checked and .disabled usages at check-time.
 *
 * @type {{
 *   mainMenu: HTMLElement,
 *   tabCreate: HTMLButtonElement,
 *   tabJoin: HTMLButtonElement,
 *   username: HTMLInputElement,
 *   roomCodeInput: HTMLInputElement,
 *   roomCodeGroup: HTMLElement,
 *   menuActionBtn: HTMLButtonElement,
 *   spectatorBtn: HTMLButtonElement,
 *   userEmoji: HTMLElement,
 *   changeEmoji: HTMLButtonElement,
 *   helpBtn: HTMLButtonElement,
 *   lobby: HTMLElement,
 *   roomCode: HTMLElement,
 *   copyCodeBtn: HTMLButtonElement,
 *   copyLinkBtn: HTMLButtonElement,
 *   playersGrid: HTMLElement,
 *   startGame: HTMLButtonElement,
 *   startHint: HTMLElement,
 *   settingsPanel: HTMLElement,
 *   settingsDisplay: HTMLElement,
 *   spectatorCount: HTMLElement,
 *   spectatorNum: HTMLElement,
 *   teamDisplay: HTMLElement,
 *   modeOptions: HTMLElement,
 *   modeDesc: HTMLElement,
 *   timerGroup: HTMLElement,
 *   timerOptions: HTMLElement,
 *   wordlimitGroup: HTMLElement,
 *   wordlimitOpts: HTMLElement,
 *   emojicountOpts: HTMLElement,
 *   roundsOpts: HTMLElement,
 *   packOptions: HTMLElement,
 *   writingSection: HTMLElement,
 *   writingTimerTime: HTMLElement,
 *   writingTimerBar: HTMLElement,
 *   writingTimerAnnounce: HTMLElement,
 *   writingEmojis: HTMLElement,
 *   writingStory: HTMLTextAreaElement,
 *   writingFinishBtn: HTMLButtonElement,
 *   wordCount: HTMLElement,
 *   wordLimit: HTMLElement,
 *   roundIndicator: HTMLElement,
 *   roundCurrent: HTMLElement,
 *   roundTotal: HTMLElement,
 *   writingProgress: HTMLElement,
 *   storiesSubmitted: HTMLElement,
 *   storiesTotal: HTMLElement,
 *   guessSection: HTMLElement,
 *   guessStory: HTMLElement,
 *   emojiGuessGroup: HTMLElement,
 *   emojiOptions: HTMLElement,
 *   playerOptions: HTMLElement,
 *   submitGuess: HTMLButtonElement,
 *   guessRoundIndicator: HTMLElement,
 *   guessRoundCurrent: HTMLElement,
 *   guessRoundTotal: HTMLElement,
 *   resultsSection: HTMLElement,
 *   resultsSidebar: HTMLElement,
 *   resultsChat: HTMLElement,
 *   resultsContinueBtn: HTMLButtonElement,
 *   resultsRoundInd: HTMLElement,
 *   resultsRoundCur: HTMLElement,
 *   resultsRoundTot: HTMLElement,
 *   teamScores: HTMLElement,
 *   leaderboardContainer: HTMLElement,
 *   leaderboardTable: HTMLTableElement,
 *   postRoundActions: HTMLElement,
 *   nextRoundBtn: HTMLButtonElement,
 *   newGameBtn: HTMLButtonElement,
 *   gameoverSection: HTMLElement,
 *   gameoverTable: HTMLTableElement,
 *   gameoverTeamScores: HTMLElement,
 *   gameoverNewGameBtn: HTMLButtonElement,
 *   spectatorSection: HTMLElement,
 *   spectatorInfo: HTMLElement,
 *   spectatorContent: HTMLElement,
 *   tutorialModal: HTMLElement,
 *   tutorialClose: HTMLButtonElement,
 *   tutorialStart: HTMLButtonElement,
 *   loadingOverlay: HTMLElement,
 *   connectionStatus: HTMLElement,
 * }}
 */
export const dom = {
    // Menu
    mainMenu:       $('main-menu'),
    tabCreate:      $('tab-create'),
    tabJoin:        $('tab-join'),
    username:       $('username'),
    roomCodeInput:  $('room-code-input'),
    roomCodeGroup:  $('room-code-group'),
    menuActionBtn:  $('menu-action-btn'),
    spectatorBtn:   $('spectator-btn'),
    userEmoji:      $('user-emoji'),
    changeEmoji:    $('change-emoji'),
    helpBtn:        $('help-btn'),

    // Lobby
    lobby:          $('lobby'),
    roomCode:       $('room-code'),
    copyCodeBtn:    $('copy-code-btn'),
    copyLinkBtn:    $('copy-link-btn'),
    playersGrid:    $('players-grid'),
    startGame:      $('start-game'),
    startHint:      $('start-hint'),
    settingsPanel:  $('settings-panel'),
    settingsDisplay:$('settings-display'),
    spectatorCount: $('spectator-count'),
    spectatorNum:   $('spectator-num'),
    teamDisplay:    $('team-display'),

    // Settings
    modeOptions:    $('mode-options'),
    modeDesc:       $('mode-desc'),
    timerGroup:     $('timer-group'),
    timerOptions:   $('timer-options'),
    wordlimitGroup: $('wordlimit-group'),
    wordlimitOpts:  $('wordlimit-options'),
    emojicountOpts: $('emojicount-options'),
    roundsOpts:     $('rounds-options'),
    packOptions:    $('pack-options'),

    // Writing
    writingSection:    $('writing-section'),
    writingTimerTime:  $('writing-timer-time'),
    writingTimerBar:   $('writing-timer-bar'),
    writingTimerAnnounce: $('writing-timer-announce'),
    writingEmojis:     $('writing-emojis'),
    writingStory:      $('writing-story'),
    writingFinishBtn:  $('writing-finish-btn'),
    wordCount:         $('word-count'),
    wordLimit:         $('word-limit'),
    roundIndicator:    $('round-indicator'),
    roundCurrent:      $('round-current'),
    roundTotal:        $('round-total'),
    writingProgress:   $('writing-progress'),
    storiesSubmitted:  $('stories-submitted'),
    storiesTotal:      $('stories-total'),

    // Guessing
    guessSection:       $('guess-section'),
    guessStory:         $('guess-story'),
    emojiGuessGroup:    $('emoji-guess-group'),
    emojiOptions:       $('emoji-options'),
    playerOptions:      $('player-options'),
    submitGuess:        $('submit-guess'),
    guessRoundIndicator:$('guess-round-indicator'),
    guessRoundCurrent:  $('guess-round-current'),
    guessRoundTotal:    $('guess-round-total'),

    // Results
    resultsSection:     $('results-section'),
    resultsSidebar:     $('results-sidebar'),
    resultsChat:        $('results-chat'),
    resultsContinueBtn: $('results-continue-btn'),
    resultsRoundInd:    $('results-round-indicator'),
    resultsRoundCur:    $('results-round-current'),
    resultsRoundTot:    $('results-round-total'),
    teamScores:         $('team-scores'),
    leaderboardContainer: $('leaderboard-container'),
    leaderboardTable:   $('leaderboard-table'),
    postRoundActions:   $('post-round-actions'),
    nextRoundBtn:       $('next-round-btn'),
    newGameBtn:         $('new-game-btn'),

    // Game over
    gameoverSection:    $('gameover-section'),
    gameoverTable:      $('gameover-table'),
    gameoverTeamScores: $('gameover-team-scores'),
    gameoverNewGameBtn: $('gameover-new-game-btn'),

    // Spectator
    spectatorSection:   $('spectator-section'),
    spectatorInfo:      $('spectator-info'),
    spectatorContent:   $('spectator-content'),

    // Global
    tutorialModal:  $('tutorial-modal'),
    tutorialClose:  $('tutorial-close'),
    tutorialStart:  $('tutorial-start-btn'),
    loadingOverlay: $('loading-overlay'),
    connectionStatus: $('connection-status'),
};

// ── Utility functions ───────────────────────────────────────

const SECTIONS = [
    dom.mainMenu, dom.lobby, dom.writingSection, dom.guessSection,
    dom.resultsSection, dom.gameoverSection, dom.spectatorSection,
];

/** Hide all game sections. */
export function hideAllSections() {
    for (const el of SECTIONS) {
        if (el) el.classList.add('hidden');
    }
}

/**
 * Show a short error message.
 * Thin shim kept for backwards compatibility with existing call sites.
 * New code should import `toastInfo` / `toastSuccess` / `toastError`
 * directly from './toast.js' so the intent is visible.
 */
export function showError(message) {
    toastError(message);
}

/**
 * Count the words in a string.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Format seconds as MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Typewriter text effect. Writes `text` character-by-character into
 * `el.textContent`. Returns the interval ID so callers can clean it up.
 *
 * @param {string} text
 * @param {HTMLElement} el
 * @param {number} [speed] milliseconds per character
 * @returns {ReturnType<typeof setInterval>}
 */
export function typeText(text, el, speed = 18) {
    el.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
        el.textContent = text.slice(0, i + 1);
        i++;
        if (i >= text.length) clearInterval(interval);
    }, speed);

    // Track for cleanup
    state.typeTextTimers.push(interval);
    return interval;
}
