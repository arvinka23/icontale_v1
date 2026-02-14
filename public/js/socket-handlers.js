// ═══════════════════════════════════════════════════════════════
//  Socket Event Handlers + Connection Management
// ═══════════════════════════════════════════════════════════════

import { state, Phase, resetGameState, saveSession, clearSession, getStoredSession, forcePhase } from './state.js';
import { dom, showError } from './dom.js';
import {
    showLobby, updatePlayersList, updateSettingsDisplay, updateSpectatorCount,
    showWritingPhase, showGuessPhase, showResultsPhase, advanceResults,
    showLeaderboard, showGameOver, showSpectatorView, showTeams,
} from './ui.js';
import { playError } from './sounds.js';

// Connection health
const CONNECTION_TIMEOUT = 15_000; // 15s

/**
 * Register all socket event handlers.
 * @param {import('socket.io-client').Socket} socket
 */
export function registerSocketHandlers(socket) {

    // ── Connection Events ───────────────────────────────────

    socket.on('connect', () => {
        console.info('[socket] Connected:', socket.id);
        // Attempt reconnect if we have a stored session
        const session = getStoredSession();
        if (session) {
            socket.emit('reconnect-session', { sessionToken: session.token, roomCode: session.room });
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('[socket] Disconnected:', reason);
        if (reason === 'io server disconnect') {
            // Server kicked us — don't auto-reconnect
            showError('Verbindung vom Server getrennt.');
        } else if (state.phase !== Phase.MENU) {
            showError('Verbindung verloren — versuche neu zu verbinden...');
        }
    });

    socket.on('connect_error', (err) => {
        console.error('[socket] Connection error:', err.message);
        if (state.phase === Phase.MENU) {
            showError('Server nicht erreichbar. Bitte später versuchen.');
        }
    });

    socket.io.on('reconnect', (attempt) => {
        console.info('[socket] Reconnected after', attempt, 'attempts');
        showError('Verbindung wiederhergestellt!');
    });

    socket.io.on('reconnect_failed', () => {
        console.error('[socket] Reconnect failed permanently');
        showError('Verbindung fehlgeschlagen. Bitte Seite neu laden.');
        playError();
    });

    // ── Reconnect Session ───────────────────────────────────

    socket.on('reconnect-success', ({ roomCode, players, settings, started, isHost: hostFlag, gamePhase }) => {
        state.roomCode = roomCode;
        state.settings = settings;
        state.isHost = hostFlag;
        state.isSpectator = false;
        saveSession(roomCode);
        showLobby(roomCode, players, settings);
        if (started && gamePhase !== 'lobby') {
            showError('Verbindung wiederhergestellt! Warte auf die nächste Phase...');
        }
    });

    socket.on('reconnect-failed', () => {
        clearSession();
    });

    // ── Lobby Events ────────────────────────────────────────

    socket.on('lobby-created', ({ roomCode, players, settings }) => {
        state.isHost = true;
        state.isSpectator = false;
        state.roomCode = roomCode;
        state.settings = settings;
        saveSession(roomCode);
        showLobby(roomCode, players, settings);
    });

    socket.on('lobby-joined', ({ roomCode, players, settings }) => {
        state.isHost = false;
        state.isSpectator = false;
        state.roomCode = roomCode;
        state.settings = settings;
        saveSession(roomCode);
        showLobby(roomCode, players, settings);
    });

    socket.on('players-update', (players) => {
        updatePlayersList(players);
    });

    socket.on('settings-update', (settings) => {
        updateSettingsDisplay(settings);
    });

    socket.on('spectators-update', (spectators) => {
        updateSpectatorCount(spectators.length);
    });

    socket.on('lobby-error', ({ message }) => {
        showError(message);
        playError();
    });

    socket.on('lobby-closed', ({ reason } = {}) => {
        clearSession();
        showError(reason || 'Lobby wurde geschlossen.');
        setTimeout(() => window.location.reload(), 2000);
    });

    socket.on('host-changed', ({ newHostId }) => {
        state.isHost = (newHostId === socket.id);
        if (state.isHost) showError('Du bist jetzt der Host!');
    });

    socket.on('player-disconnected', ({ name, reconnectTimeout }) => {
        showError(`${name} hat die Verbindung verloren. Wartezeit: ${Math.round(reconnectTimeout / 1000)}s`);
    });

    socket.on('player-reconnected', ({ name }) => {
        showError(`${name} ist wieder verbunden!`);
    });

    socket.on('server-shutdown', ({ message }) => {
        showError(message || 'Server wird neu gestartet...');
    });

    // ── Spectator Events ────────────────────────────────────

    socket.on('spectator-joined', ({ roomCode, players, settings, started, currentRound, totalRounds }) => {
        state.isSpectator = true;
        state.roomCode = roomCode;
        state.settings = settings;
        if (started) {
            showSpectatorView(`Spiel läuft — Runde ${currentRound}/${totalRounds}`);
        } else {
            showSpectatorView(`Lobby ${roomCode} — Warte auf Spielstart...`);
        }
    });

    socket.on('spectator-round-started', ({ currentRound, totalRounds, settings }) => {
        showSpectatorView(`Schreibphase — Runde ${currentRound}/${totalRounds} (${settings.gameMode})`);
    });

    socket.on('spectator-guess-phase', () => {
        showSpectatorView('Ratephase läuft...');
    });

    // ── Team Events ─────────────────────────────────────────

    socket.on('teams-assigned', ({ teams, players }) => {
        showTeams(teams, players);
    });

    // ── Game Flow Events ────────────────────────────────────

    socket.on('game-started', ({ gameMode }) => {
        state.settings.gameMode = gameMode;
    });

    socket.on('round-started', ({ emojis, writingStartTime, currentRound, totalRounds, settings }) => {
        state.settings = settings;
        showWritingPhase(emojis, writingStartTime, settings, currentRound, totalRounds);
    });

    socket.on('writing-progress', ({ submitted, total }) => {
        dom.storiesSubmitted.textContent = submitted;
        dom.storiesTotal.textContent = total;
    });

    socket.on('guess-phase', (data) => {
        // Clean up writing timer
        if (state.writingTimer) {
            clearInterval(state.writingTimer);
            state.writingTimer = null;
        }
        showGuessPhase(data, socket);
    });

    socket.on('guessing-progress', ({ submitted, total }) => {
        // Could show a progress indicator
    });

    socket.on('results-phase', (data) => {
        showResultsPhase(data);
    });

    socket.on('results-progress', ({ currentChatIdx: idx, currentMsgStep: step }) => {
        advanceResults(idx, step);

        // Auto-transition to leaderboard when all results shown
        if (state.isHost && idx === state.resultsPlayers.length - 1 && step >= 2) {
            setTimeout(() => {
                socket.emit('leaderboard-phase', { roomCode: state.roomCode });
            }, 500);
        }
    });

    socket.on('leaderboard-phase', (data) => {
        showLeaderboard(data);
    });

    socket.on('game-over', (data) => {
        clearSession();
        showGameOver(data);
    });

    socket.on('back-to-lobby', ({ players, settings }) => {
        resetGameState();
        state.settings = settings;
        showLobby(state.roomCode, players, settings);
    });

    socket.on('story-error', ({ message }) => {
        showError(message);
        playError();
    });
}

/**
 * Emit helper with timeout — shows error if server doesn't respond.
 * @param {import('socket.io-client').Socket} socket
 * @param {string} event
 * @param {object} data
 * @param {number} timeout
 */
export function emitWithTimeout(socket, event, data, timeout = CONNECTION_TIMEOUT) {
    socket.emit(event, data);
    // For critical actions, we could add acknowledgment callbacks here
}
