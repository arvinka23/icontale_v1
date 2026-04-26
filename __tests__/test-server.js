/**
 * Minimal test server that replicates key socket event patterns from server.ts.
 * Uses real sanitize, wordfilter, and scoring modules. In-memory lobbies only.
 */
import crypto from 'crypto';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import * as san from '../lib/sanitize';
import * as filter from '../lib/wordfilter';
import { processRoundResults, calculateTeamScores } from '../lib/scoring';
import { getRandomEmojis } from '../lib/emoji-packs';
import { registerCounter, renderMetrics, __reset as resetMetrics } from '../lib/metrics';

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

const DEFAULT_SETTINGS = {
    gameMode: 'classic',
    timerDuration: 180,
    wordLimit: 500,
    emojiCount: 3,
    rounds: 1,
    emojiPacks: ['all'],
};

const MAX_LOBBIES = 100;
const MAX_PLAYERS_PER_LOBBY = 20;
const SOCKET_RATE_WINDOW = 10_000;
const SOCKET_RATE_MAX = 25; // Lower for tests to trigger rate limit easily

/**
 * @param {{ rateLimitMax?: number }} options
 * @returns {{ server: import('http').Server; io: import('socket.io').Server; port: number; close: () => Promise<void> }}
 */
export function createTestServer(options = {}) {
    const rateLimitMax = options.rateLimitMax ?? SOCKET_RATE_MAX;
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        pingTimeout: 5000,
        pingInterval: 2000,
        cors: { origin: '*' },
    });

    const lobbies = {};
    const socketRateLimits = new Map();

    function getLobby(code) {
        return lobbies[code] ?? null;
    }

    function checkSocketRate(socketId) {
        const now = Date.now();
        let entry = socketRateLimits.get(socketId);
        if (!entry || now - entry.start > SOCKET_RATE_WINDOW) {
            entry = { start: now, count: 0 };
            socketRateLimits.set(socketId, entry);
        }
        entry.count++;
        return entry.count <= rateLimitMax;
    }

    function clearLobbyTimers(lobby) {
        if (lobby.writingTimeout) {
            clearTimeout(lobby.writingTimeout);
            lobby.writingTimeout = null;
        }
    }

    function startRound(roomCode) {
        const lobby = getLobby(roomCode);
        if (!lobby) return;

        lobby.currentRound++;
        lobby.stories = {};
        lobby.guesses = {};
        const { settings } = lobby;

        for (const p of lobby.players) {
            lobby.emojis[p.id] = getRandomEmojis(settings.emojiCount, settings.emojiPacks);
        }

        lobby.writingStartTime = Date.now();
        clearLobbyTimers(lobby);
        lobby.writingTimeout = setTimeout(() => {
            const l = getLobby(roomCode);
            if (l && l.started && Object.keys(l.stories).length < l.players.length) {
                startGuessingPhase(roomCode);
            }
        }, settings.timerDuration * 1000);

        for (const p of lobby.players) {
            io.to(p.id).emit('round-started', {
                emojis: lobby.emojis[p.id],
                writingStartTime: lobby.writingStartTime,
                currentRound: lobby.currentRound,
                totalRounds: settings.rounds,
                settings,
            });
        }
        for (const s of lobby.spectators) {
            io.to(s.id).emit('spectator-round-started', {
                currentRound: lobby.currentRound,
                totalRounds: settings.rounds,
                settings,
            });
        }
        io.to(roomCode).emit('game-started', {
            currentRound: lobby.currentRound,
            totalRounds: settings.rounds,
            gameMode: settings.gameMode,
        });
    }

    function startGuessingPhase(roomCode) {
        const lobby = getLobby(roomCode);
        if (!lobby) return;

        const activePlayers = lobby.players.filter((p) => !p.disconnected);
        const playerIds = activePlayers.map((p) => p.id);

        if (playerIds.length < 2) {
            io.to(roomCode).emit('lobby-error', { message: 'Nicht genug aktive Spieler.' });
            return;
        }

        let deranged = false;
        let attempts = 0;
        const assignments = {};
        while (!deranged && attempts < 1000) {
            attempts++;
            const shuffled = [...playerIds].sort(() => 0.5 - Math.random());
            deranged = true;
            for (let i = 0; i < playerIds.length; i++) {
                if (playerIds[i] === shuffled[i]) {
                    deranged = false;
                    break;
                }
            }
            if (deranged) {
                for (let i = 0; i < playerIds.length; i++) {
                    assignments[playerIds[i]] = shuffled[i];
                }
            }
        }
        lobby.assignments = assignments;
        const { settings } = lobby;

        for (const id of playerIds) {
            const authorId = assignments[id];
            const story = lobby.stories[authorId] || '';
            const correctEmojis = lobby.emojis[authorId];
            let emojiOptions = null;
            if (settings.gameMode !== 'blind') {
                const combos = [correctEmojis];
                while (combos.length < 6) {
                    const combo = getRandomEmojis(settings.emojiCount, settings.emojiPacks);
                    if (!combos.some((arr) => arr.join() === combo.join())) combos.push(combo);
                }
                combos.sort(() => 0.5 - Math.random());
                emojiOptions = combos;
            }
            io.to(id).emit('guess-phase', {
                story,
                emojiOptions,
                correctEmojis,
                players: lobby.players.filter((p) => p.id !== id && !p.disconnected).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                authorId,
                gameMode: settings.gameMode,
            });
        }
        for (const s of lobby.spectators) {
            io.to(s.id).emit('spectator-guess-phase');
        }
    }

    function processResults(roomCode) {
        const lobby = getLobby(roomCode);
        if (!lobby) return;

        const { results, leaderboardDetails, teamScores } = processRoundResults(lobby);
        lobby.resultsState = { currentChatIdx: 0, currentMsgStep: 0 };
        lobby.leaderboardDetails = leaderboardDetails;

        io.to(roomCode).emit('results-phase', {
            results,
            leaderboard: lobby.leaderboard,
            players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
            resultsState: lobby.resultsState,
            teams: lobby.teams,
            teamScores,
            currentRound: lobby.currentRound,
            totalRounds: lobby.settings.rounds,
            gameMode: lobby.settings.gameMode,
        });
    }

    app.use(express.json({ limit: '1mb' }));
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', lobbies: Object.keys(lobbies).length });
    });

    // Register a minimal metric surface so /metrics integration tests
    // see the same shape as the real server.
    resetMetrics();
    const testCounter = registerCounter(
        'icontale_test_events_total',
        'Test-only counter so /metrics has something to render'
    );
    testCounter.inc();

    app.get('/metrics', async (_req, res) => {
        const body = await renderMetrics();
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(body);
    });

    io.on('connection', (socket) => {
        socket.use(([_event], next) => {
            if (!checkSocketRate(socket.id)) {
                return next(new Error('Rate limited'));
            }
            next();
        });

        socket.on('create-lobby', (payload) => {
            try {
                const { username, emoji, settings } = payload ?? {};
                const uResult = san.validateUsername(username);
                if (!uResult.valid) return socket.emit('lobby-error', { message: uResult.error });

                const nameCheck = filter.checkUsername(uResult.value);
                if (!nameCheck.clean) return socket.emit('lobby-error', { message: nameCheck.reason });

                if (Object.keys(lobbies).length >= MAX_LOBBIES) {
                    return socket.emit('lobby-error', { message: 'Server is full. Please try again later.' });
                }

                const eResult = san.validateEmoji(emoji);
                const safeSettings = san.validateSettings(settings ?? {});
                const merged = { ...DEFAULT_SETTINGS, ...safeSettings };
                if (merged.gameMode === 'speed') {
                    merged.timerDuration = 60;
                    merged.wordLimit = 100;
                }

                const roomCode = generateRoomCode();
                lobbies[roomCode] = {
                    host: socket.id,
                    players: [{ id: socket.id, name: uResult.value, emoji: eResult.value }],
                    spectators: [],
                    settings: merged,
                    started: false,
                    currentRound: 0,
                    totalScores: {},
                    roundHistory: [],
                    emojis: {},
                    stories: {},
                    guesses: {},
                    assignments: {},
                    teams: null,
                    resultsState: null,
                    leaderboard: {},
                    leaderboardDetails: {},
                    writingTimeout: null,
                    writingStartTime: null,
                    lastActivity: Date.now(),
                    replayLog: [],
                };

                socket.join(roomCode);
                socket.emit('lobby-created', {
                    roomCode,
                    players: lobbies[roomCode].players,
                    settings: merged,
                });
                io.to(roomCode).emit('players-update', lobbies[roomCode].players);
            } catch {
                socket.emit('lobby-error', { message: 'Internal error creating lobby.' });
            }
        });

        socket.on('join-lobby', (payload) => {
            try {
                const { username, roomCode, emoji } = payload ?? {};
                const uResult = san.validateUsername(username);
                if (!uResult.valid) return socket.emit('lobby-error', { message: uResult.error });

                const nameCheck = filter.checkUsername(uResult.value);
                if (!nameCheck.clean) return socket.emit('lobby-error', { message: nameCheck.reason });

                const cResult = san.validateRoomCode(roomCode);
                if (!cResult.valid) return socket.emit('lobby-error', { message: cResult.error });

                const eResult = san.validateEmoji(emoji);
                const lobby = getLobby(cResult.value);

                if (!lobby) return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });
                if (lobby.started) return socket.emit('lobby-error', { message: 'Spiel bereits gestartet.' });
                if (lobby.players.length >= MAX_PLAYERS_PER_LOBBY) {
                    return socket.emit('lobby-error', { message: `Lobby ist voll (max ${MAX_PLAYERS_PER_LOBBY}).` });
                }
                if (lobby.players.some((p) => p.name === uResult.value)) {
                    return socket.emit('lobby-error', { message: 'Dieser Name ist bereits vergeben.' });
                }

                lobby.players.push({ id: socket.id, name: uResult.value, emoji: eResult.value });
                lobby.lastActivity = Date.now();
                socket.join(cResult.value);

                socket.emit('lobby-joined', {
                    roomCode: cResult.value,
                    players: lobby.players,
                    settings: lobby.settings,
                });
                io.to(cResult.value).emit('players-update', lobby.players);
            } catch {
                socket.emit('lobby-error', { message: 'Internal error joining lobby.' });
            }
        });

        socket.on('join-spectator', (payload) => {
            try {
                const { roomCode } = payload ?? {};
                const cResult = san.validateRoomCode(roomCode);
                if (!cResult.valid) return socket.emit('lobby-error', { message: cResult.error });

                const lobby = getLobby(cResult.value);
                if (!lobby) return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });

                lobby.spectators.push({ id: socket.id });
                socket.join(cResult.value);

                socket.emit('spectator-joined', {
                    roomCode: cResult.value,
                    players: lobby.players,
                    spectators: lobby.spectators,
                    settings: lobby.settings,
                    started: lobby.started,
                    currentRound: lobby.currentRound,
                    totalRounds: lobby.settings.rounds,
                });
                io.to(cResult.value).emit('spectators-update', lobby.spectators);
            } catch {
                socket.emit('lobby-error', { message: 'Internal error joining as spectator.' });
            }
        });

        socket.on('update-settings', (payload) => {
            try {
                const { roomCode, settings } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby || lobby.host !== socket.id || lobby.started) return;

                const safeSettings = san.validateSettings(settings ?? {});
                lobby.settings = { ...lobby.settings, ...safeSettings };
                if (lobby.settings.gameMode === 'speed') {
                    lobby.settings.timerDuration = 60;
                    lobby.settings.wordLimit = 100;
                }
                lobby.lastActivity = Date.now();
                io.to(roomCode ?? '').emit('settings-update', lobby.settings);
            } catch {
                // ignore
            }
        });

        socket.on('start-game', (payload) => {
            try {
                const { roomCode } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby || lobby.host !== socket.id) return;
                if (lobby.started) return;
                if (lobby.players.length < 3) {
                    return socket.emit('lobby-error', { message: 'Mindestens 3 Spieler nötig.' });
                }

                lobby.started = true;
                lobby.lastActivity = Date.now();

                if (lobby.settings.gameMode === 'team') {
                    const shuffled = [...lobby.players].sort(() => 0.5 - Math.random());
                    const mid = Math.ceil(shuffled.length / 2);
                    lobby.teams = {
                        A: shuffled.slice(0, mid).map((p) => p.id),
                        B: shuffled.slice(mid).map((p) => p.id),
                    };
                    io.to(roomCode ?? '').emit('teams-assigned', {
                        teams: lobby.teams,
                        players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                    });
                }

                startRound(roomCode ?? '');
            } catch {
                // ignore
            }
        });

        socket.on('submit-story', (payload) => {
            try {
                const { roomCode, story } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby || !lobby.started) return;

                const result = san.validateStory(story, lobby.settings.wordLimit);
                if (!result.valid) return socket.emit('story-error', { message: result.error });

                const storyCheck = filter.checkStory(result.value);
                if (!storyCheck.clean) return socket.emit('story-error', { message: storyCheck.reason });

                lobby.stories[socket.id] = result.value;
                lobby.lastActivity = Date.now();

                io.to(roomCode ?? '').emit('writing-progress', {
                    submitted: Object.keys(lobby.stories).length,
                    total: lobby.players.length,
                });

                if (Object.keys(lobby.stories).length === lobby.players.length) {
                    clearLobbyTimers(lobby);
                    startGuessingPhase(roomCode ?? '');
                }
            } catch {
                // ignore
            }
        });

        socket.on('submit-guess', (payload) => {
            try {
                const { roomCode, guess } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby) return;
                if (!lobby.guesses) lobby.guesses = {};
                if (!guess || typeof guess !== 'object') return;

                lobby.guesses[socket.id] = { guess };
                lobby.lastActivity = Date.now();

                io.to(roomCode ?? '').emit('guessing-progress', {
                    submitted: Object.keys(lobby.guesses).length,
                    total: lobby.players.length,
                });

                if (Object.keys(lobby.guesses).length === lobby.players.length) {
                    processResults(roomCode ?? '');
                }
            } catch {
                // ignore
            }
        });

        socket.on('results-continue', (payload) => {
            try {
                const { roomCode } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby || !lobby.resultsState || lobby.host !== socket.id) return;

                let { currentChatIdx, currentMsgStep } = lobby.resultsState;
                currentMsgStep++;
                const totalSteps = lobby.settings.gameMode === 'blind' ? 3 : 4;

                if (currentMsgStep >= totalSteps) {
                    if (currentChatIdx < lobby.players.length - 1) {
                        currentChatIdx++;
                        currentMsgStep = 0;
                    } else {
                        currentMsgStep = totalSteps - 1;
                    }
                }
                lobby.resultsState = { currentChatIdx, currentMsgStep };
                io.to(roomCode ?? '').emit('results-progress', lobby.resultsState);
            } catch {
                // ignore
            }
        });

        socket.on('leaderboard-phase', (payload) => {
            try {
                const { roomCode } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby) return;

                const teamScores = calculateTeamScores(lobby);
                io.to(roomCode ?? '').emit('leaderboard-phase', {
                    leaderboard: lobby.leaderboard,
                    leaderboardDetails: lobby.leaderboardDetails,
                    players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                    teams: lobby.teams,
                    teamScores,
                    currentRound: lobby.currentRound,
                    totalRounds: lobby.settings.rounds,
                    totalScores: lobby.totalScores,
                });
            } catch {
                // ignore
            }
        });

        socket.on('next-round', (payload) => {
            try {
                const { roomCode } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby || lobby.host !== socket.id) return;

                for (const [pid, score] of Object.entries(lobby.leaderboard ?? {})) {
                    lobby.totalScores[pid] = (lobby.totalScores[pid] || 0) + score;
                }

                if (lobby.currentRound < lobby.settings.rounds) {
                    lobby.roundHistory.push({ round: lobby.currentRound, leaderboard: { ...lobby.leaderboard } });
                    lobby.emojis = {};
                    lobby.stories = {};
                    lobby.guesses = {};
                    lobby.leaderboard = {};
                    lobby.leaderboardDetails = {};
                    lobby.resultsState = null;
                    startRound(roomCode ?? '');
                } else {
                    io.to(roomCode ?? '').emit('game-over', {
                        totalScores: lobby.totalScores,
                        roundHistory: lobby.roundHistory,
                        players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                        teams: lobby.teams,
                        replayId: null,
                    });
                }
            } catch {
                // ignore
            }
        });

        socket.on('new-game', (payload) => {
            try {
                const { roomCode } = payload ?? {};
                const lobby = getLobby(roomCode ?? '');
                if (!lobby || lobby.host !== socket.id) return;

                clearLobbyTimers(lobby);
                lobby.started = false;
                lobby.currentRound = 0;
                lobby.totalScores = {};
                lobby.roundHistory = [];
                lobby.emojis = {};
                lobby.stories = {};
                lobby.guesses = {};
                lobby.leaderboard = {};
                lobby.leaderboardDetails = {};
                lobby.resultsState = null;
                lobby.assignments = {};
                lobby.teams = null;
                lobby.lastActivity = Date.now();

                io.to(roomCode ?? '').emit('back-to-lobby', {
                    players: lobby.players,
                    settings: lobby.settings,
                });
            } catch {
                // ignore
            }
        });

        socket.on('disconnect', () => {
            socketRateLimits.delete(socket.id);
            for (const code in lobbies) {
                const lobby = lobbies[code];
                lobby.spectators = lobby.spectators.filter((s) => s.id !== socket.id);
                const playerIdx = lobby.players.findIndex((p) => p.id === socket.id);
                if (playerIdx === -1) continue;

                if (!lobby.started) {
                    lobby.players = lobby.players.filter((p) => p.id !== socket.id);
                    if (lobby.host === socket.id || lobby.players.length === 0) {
                        if (lobby.players.length > 0) {
                            lobby.host = lobby.players[0].id;
                            io.to(code).emit('host-changed', { newHost: lobby.players[0].name, newHostId: lobby.players[0].id });
                            io.to(code).emit('players-update', lobby.players);
                        } else {
                            clearLobbyTimers(lobby);
                            delete lobbies[code];
                            io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                        }
                    } else {
                        io.to(code).emit('players-update', lobby.players);
                    }
                } else {
                    io.to(code).emit('player-disconnected', { name: lobby.players[playerIdx].name, reconnectTimeout: 120000 });
                    lobby.players[playerIdx].disconnected = true;
                    lobby.players[playerIdx].disconnectedAt = Date.now();
                }
            }
        });
    });

    return new Promise((resolve) => {
        server.listen(0, () => {
            const port = server.address().port;
            resolve({
                server,
                io,
                port,
                close: () =>
                    new Promise((done) => {
                        io.close();
                        server.close(done);
                    }),
            });
        });
    });
}
