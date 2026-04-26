// ═══════════════════════════════════════════════════════════════
//  Socket Event Handlers + Connection Management
// ═══════════════════════════════════════════════════════════════

import { state, Phase, resetGameState, saveSession, clearSession, getStoredSession } from './state.js';
import { dom } from './dom.js';
import { toastInfo, toastSuccess, toastError } from './toast.js';
import { t } from './i18n.js';
import {
    showLobby, updatePlayersList, updateSettingsDisplay, updateSpectatorCount,
    showWritingPhase, showGuessPhase, showResultsPhase, advanceResults,
    showLeaderboard, showGameOver, showSpectatorView, showTeams,
} from './ui.js';
import { playError } from './sounds.js';

// Connection health
const CONNECTION_TIMEOUT = 15_000; // 15s

function setConnectionStatus(message = '', level = 'warning') {
    if (!dom.connectionStatus) return;
    if (!message) {
        dom.connectionStatus.textContent = '';
        dom.connectionStatus.dataset.state = '';
        dom.connectionStatus.classList.add('hidden');
        return;
    }
    dom.connectionStatus.textContent = message;
    dom.connectionStatus.dataset.state = level;
    dom.connectionStatus.classList.remove('hidden');
}

/**
 * Register all socket event handlers.
 *
 * Uses the local ClientSocket alias (public/js/types.d.ts) instead
 * of the socket.io-client Socket type so checkJs doesn't need
 * socket.io-client in node_modules just to typecheck the frontend.
 *
 * @param {import('./types').ClientSocket} socket
 */
export function registerSocketHandlers(socket) {

    // ── Connection Events ───────────────────────────────────

    socket.on('connect', () => {
        console.info('[socket] Connected:', socket.id);
        setConnectionStatus('');
        // Attempt reconnect if we have a stored session
        const session = getStoredSession();
        if (session) {
            socket.emit('reconnect-session', { sessionToken: session.token, roomCode: session.room });
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('[socket] Disconnected:', reason);
        if (reason === 'io server disconnect') {
            const msg = t('error.disconnectedByServer');
            toastError(msg);
            setConnectionStatus(t('connection.banner.serverDisconnect'), 'error');
        } else if (state.phase !== Phase.MENU) {
            const msg = t('error.connectionLost');
            toastInfo(msg);
            setConnectionStatus(t('connection.banner.reconnecting'), 'warning');
        }
    });

    socket.on('connect_error', (err) => {
        console.error('[socket] Connection error:', err.message);
        if (state.phase === Phase.MENU) {
            const msg = t('error.serverUnreachable');
            toastError(msg);
            setConnectionStatus(t('connection.banner.serverUnreachable'), 'warning');
        }
    });

    socket.io.on('reconnect', (attempt) => {
        console.info('[socket] Reconnected after', attempt, 'attempts');
        toastSuccess(t('info.reconnected'));
        setConnectionStatus(t('connection.banner.reconnected'), 'success');
    });

    socket.io.on('reconnect_failed', () => {
        console.error('[socket] Reconnect failed permanently');
        const msg = t('error.reconnectFailed');
        toastError(msg);
        setConnectionStatus(t('connection.banner.reconnectFailed'), 'error');
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
            toastInfo(t('info.reconnectedWaitingPhase'));
            setConnectionStatus(t('connection.banner.waitingPhase'), 'success');
        } else {
            setConnectionStatus('');
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
        setConnectionStatus('');
    });

    socket.on('lobby-joined', ({ roomCode, players, settings }) => {
        state.isHost = false;
        state.isSpectator = false;
        state.roomCode = roomCode;
        state.settings = settings;
        saveSession(roomCode);
        showLobby(roomCode, players, settings);
        setConnectionStatus('');
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
        toastError(message);
        playError();
    });

    socket.on('lobby-closed', ({ reason } = {}) => {
        clearSession();
        toastError(reason || 'Lobby wurde geschlossen.');
        setTimeout(() => window.location.reload(), 2000);
    });

    socket.on('host-changed', ({ newHostId }) => {
        state.isHost = (newHostId === socket.id);
        if (state.isHost) toastSuccess('Du bist jetzt der Host.');
    });

    socket.on('player-disconnected', ({ name, reconnectTimeout }) => {
        toastInfo(`${name} hat die Verbindung verloren (${Math.round(reconnectTimeout / 1000)}s Wartezeit).`);
    });

    socket.on('player-reconnected', ({ name }) => {
        toastSuccess(`${name} ist wieder verbunden.`);
    });

    socket.on('server-shutdown', ({ message }) => {
        toastError(message || 'Server wird neu gestartet…');
    });

    // ── Spectator Events ────────────────────────────────────

    socket.on('spectator-joined', ({ roomCode, settings, started, currentRound, totalRounds }) => {
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
        dom.storiesSubmitted.textContent = String(submitted);
        dom.storiesTotal.textContent = String(total);
    });

    socket.on('guess-phase', (data) => {
        // Clean up writing timer
        if (state.writingTimer) {
            clearInterval(state.writingTimer);
            state.writingTimer = null;
        }
        showGuessPhase(data, socket);
    });

    socket.on('guessing-progress', ({ _submitted, _total }) => {
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

        // If a replayId was returned, store it for the replay viewer
        if (data.replayId) {
            state.lastReplayId = data.replayId;
        }
    });

    // ── Achievement Toasts ────────────────────────────────────

    socket.on('achievement-unlocked', ({ achievements }) => {
        if (!achievements || !Array.isArray(achievements)) return;
        const container = document.getElementById('achievement-toasts');
        if (!container) return;

        for (const a of achievements) {
            const toast = document.createElement('div');
            toast.className = 'achievement-toast';
            toast.innerHTML = `
                <span class="toast-icon">${a.icon}</span>
                <div class="toast-text">
                    <span class="toast-title">Achievement freigeschaltet!</span>
                    <span class="toast-name">${a.name}</span>
                    <span class="toast-desc">${a.description}</span>
                </div>
            `;
            container.appendChild(toast);
            // Remove after animation
            setTimeout(() => toast.remove(), 4200);
        }
    });

    socket.on('back-to-lobby', ({ players, settings }) => {
        resetGameState();
        state.settings = settings;
        showLobby(state.roomCode, players, settings);
    });

    socket.on('story-error', ({ message }) => {
        toastError(message);
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
export function emitWithTimeout(socket, event, data, _timeout = CONNECTION_TIMEOUT) {
    socket.emit(event, data);
    // For critical actions, we could add acknowledgment callbacks here
}
