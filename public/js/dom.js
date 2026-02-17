// ═══════════════════════════════════════════════════════════════
//  DOM References + Utility Functions
// ═══════════════════════════════════════════════════════════════

import { state } from './state.js';

const $ = (id) => document.getElementById(id);

/** All DOM element references (cached once on load). */
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
    errorMessage:   $('error-message'),
    tutorialModal:  $('tutorial-modal'),
    tutorialClose:  $('tutorial-close'),
    tutorialStart:  $('tutorial-start-btn'),
    loadingOverlay: $('loading-overlay'),
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

/** Show a temporary error/info message. */
export function showError(message) {
    if (state.errorTimeout) clearTimeout(state.errorTimeout);

    dom.errorMessage.textContent = message;
    dom.errorMessage.classList.remove('hidden');
    dom.errorMessage.style.animation = 'slideInDown 0.3s ease';

    state.errorTimeout = setTimeout(() => {
        dom.errorMessage.classList.add('hidden');
        state.errorTimeout = null;
    }, 5000);
}

/** Count words in a string. */
export function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Format seconds as MM:SS. */
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Typewriter text effect.
 * Returns the interval ID so callers can clean it up.
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
