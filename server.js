// ═══════════════════════════════════════════════════════════════
//  IconTale — Server
// ═══════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const crypto     = require('crypto');
const express    = require('express');
const http       = require('http');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { Server } = require('socket.io');

const log    = require('./lib/logger');
const san    = require('./lib/sanitize');
const filter = require('./lib/wordfilter');
const { processRoundResults, calculateTeamScores } = require('./lib/scoring');

// ── Environment validation ──────────────────────────────────

const PORT     = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ['*'];

if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    log.fatal({ port: process.env.PORT }, 'Invalid PORT — must be 1-65535');
    process.exit(1);
}

log.info({ NODE_ENV, PORT, origins: ALLOWED_ORIGINS }, 'Environment validated');

// ── Express setup ───────────────────────────────────────────

const app    = express();
const server = http.createServer(app);

// HTTPS redirect in production
if (NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.hostname}${req.url}`);
        }
        next();
    });
}

// CORS configuration
app.use(cors({
    origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
    methods: ['GET'],
    credentials: true,
}));

// Security headers (allow inline scripts/styles for SPA + websocket)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
            connectSrc:  ["'self'", 'ws:', 'wss:'],
            imgSrc:      ["'self'", 'data:'],
        },
    },
}));

// Rate limiting — general HTTP
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 min
    max: 200,                   // per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
}));

app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        lobbies: Object.keys(lobbies).length,
        timestamp: new Date().toISOString(),
    });
});

// ── Socket.io setup ─────────────────────────────────────────

const io = new Server(server, {
    pingTimeout: 30000,
    pingInterval: 10000,
    cors: {
        origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true,
    },
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
    },
});

// Socket.io authentication middleware
io.use((socket, next) => {
    // Basic connection validation — reject clients without proper handshake
    const origin = socket.handshake.headers.origin;
    if (ALLOWED_ORIGINS.includes('*') || !origin || ALLOWED_ORIGINS.includes(origin)) {
        return next();
    }
    log.warn({ origin, socketId: socket.id }, 'Rejected socket connection from disallowed origin');
    return next(new Error('Origin not allowed'));
});

// ── Socket rate limiting (per socket) ───────────────────────

/** @type {Map<string, { start: number, count: number }>} */
const socketRateLimits = new Map();
const SOCKET_RATE_WINDOW = 10_000; // 10 seconds
const SOCKET_RATE_MAX    = 60;     // max events per window

/**
 * Check if a socket is within its rate limit.
 * @param {string} socketId - Socket identifier.
 * @returns {boolean} true if under limit.
 */
function checkSocketRate(socketId) {
    const now = Date.now();
    let entry = socketRateLimits.get(socketId);
    if (!entry || now - entry.start > SOCKET_RATE_WINDOW) {
        entry = { start: now, count: 0 };
        socketRateLimits.set(socketId, entry);
    }
    entry.count++;
    return entry.count <= SOCKET_RATE_MAX;
}

// Clean up stale rate-limit entries every minute
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of socketRateLimits) {
        if (now - entry.start > SOCKET_RATE_WINDOW * 2) socketRateLimits.delete(id);
    }
}, 60_000);

// ── Emoji Packs ─────────────────────────────────────────────

/** @type {Record<string, string[]>} */
const EMOJI_PACKS = {
    faces:   ['😀','😂','😍','😎','🤔','😱','🥳','😡','😭','😴','👻','🤖'],
    animals: ['🐶','🐱','🦄','🐉','🐟','🐬','🐋','🦈','🐊','🐢','🐍','🦎','🦖','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🦒','🦘','🦥','🦦','🦨','🦡','🐁','🐇','🐿️','🦔'],
    food:    ['🍕','🍔','🍟','🍎','🍌','🍉','🍰','🍩','🍪','🍫','🍿','🍦','🍭','🍺','🍻','🥤','☕','🍵','🧃','🥪','🥗','🍲','🍜','🍣','🍙','🥠','🦐','🦞','🦀'],
    sports:  ['⚽','🏀','🏈','🎲','🎸','🎮','🎤','🎧','🏆','🥇','🥈','🥉','🎯','🎳','🕹️'],
    nature:  ['🌈','🔥','⭐','🌊','🌸','🌍','🌙','☀️','🌪️','🌋','❄️','🌵','🌺','🍀','🌻','🌴'],
    objects: ['📚','🧩','🖌️','🎨','🧸','🎁','🎂','🚗','✈️','🚀','💎','🔮','📱','💡','🔑','🎭'],
};

/**
 * Collect all emojis for the given pack selection.
 * @param {string[]} packs - Pack names (or ['all']).
 * @returns {string[]}
 */
function getAllEmojis(packs) {
    if (!packs || packs.length === 0 || packs.includes('all')) {
        return Object.values(EMOJI_PACKS).flat();
    }
    return packs.filter(p => EMOJI_PACKS[p]).flatMap(p => EMOJI_PACKS[p]);
}

// ── Default Settings ────────────────────────────────────────

/**
 * @typedef {Object} GameSettings
 * @property {'classic'|'speed'|'blind'|'team'} gameMode
 * @property {number} timerDuration  - Seconds.
 * @property {number} wordLimit
 * @property {number} emojiCount
 * @property {number} rounds
 * @property {string[]} emojiPacks
 */

/** @type {GameSettings} */
const DEFAULT_SETTINGS = {
    gameMode:      'classic',
    timerDuration: 180,
    wordLimit:     500,
    emojiCount:    3,
    rounds:        1,
    emojiPacks:    ['all'],
};

// ── Server Limits ───────────────────────────────────────────

const MAX_LOBBIES = parseInt(process.env.MAX_LOBBIES, 10) || 100;
const MAX_PLAYERS_PER_LOBBY = 20;

// ── Helpers ─────────────────────────────────────────────────

/**
 * Generate a cryptographically secure 6-character room code.
 * @returns {string} Uppercase alphanumeric code.
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

/**
 * Pick N random emojis from the given packs (without mutation).
 * @param {number} count
 * @param {string[]} packs
 * @returns {string[]}
 */
function getRandomEmojis(count, packs) {
    const pool = getAllEmojis(packs);
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, pool.length));
}

/**
 * @typedef {Object} Player
 * @property {string} id           - Socket ID.
 * @property {string} name
 * @property {string} emoji
 * @property {boolean} [disconnected]
 * @property {number}  [disconnectedAt]
 */

/**
 * @typedef {Object} Lobby
 * @property {string}       host           - Host socket ID.
 * @property {Player[]}     players
 * @property {{ id: string }[]} spectators
 * @property {GameSettings} settings
 * @property {boolean}      started
 * @property {number}       currentRound
 * @property {Record<string,number>} totalScores
 * @property {Object[]}     roundHistory
 * @property {Record<string,string[]>} emojis
 * @property {Record<string,string>}   stories
 * @property {Record<string,{guess:object}>} guesses
 * @property {Record<string,string>}         assignments
 * @property {{ A: string[], B: string[] }|null} teams
 * @property {{ currentChatIdx: number, currentMsgStep: number }|null} resultsState
 * @property {Record<string,number>} leaderboard
 * @property {Record<string,object>} leaderboardDetails
 * @property {ReturnType<typeof setTimeout>|null} writingTimeout
 * @property {number|null}  writingStartTime
 * @property {number}       lastActivity
 */

/**
 * Safely retrieve a lobby by code.
 * @param {string} code
 * @returns {Lobby|null}
 */
function getLobby(code) {
    return lobbies[code] || null;
}

/**
 * Find the lobby a socket belongs to.
 * @param {string} socketId
 * @returns {{ code: string, lobby: Lobby, role: 'player'|'spectator' }|null}
 */
function findLobbyBySocket(socketId) {
    for (const code in lobbies) {
        const lobby = lobbies[code];
        if (lobby.players.some(p => p.id === socketId)) return { code, lobby, role: 'player' };
        if (lobby.spectators.some(s => s.id === socketId)) return { code, lobby, role: 'spectator' };
    }
    return null;
}

// ── In-memory lobbies ───────────────────────────────────────

/** @type {Record<string, Lobby>} */
const lobbies = {};

/** @type {Map<string, { roomCode: string, oldSocketId: string, playerName: string, playerEmoji: string, disconnectedAt: number, gamePhase: string }>} */
const disconnectedSessions = new Map();
const RECONNECT_TIMEOUT = 2 * 60 * 1000; // 2 min

// Clean up abandoned lobbies every 5 min
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const code in lobbies) {
        const lobby = lobbies[code];
        if (lobby.players.length === 0 || (now - lobby.lastActivity > 30 * 60 * 1000)) {
            clearLobbyTimers(lobby);
            delete lobbies[code];
            io.to(code).emit('lobby-closed', { reason: 'Inactivity timeout.' });
            cleaned++;
        }
    }
    if (cleaned > 0) log.info({ cleaned }, 'Cleaned up inactive lobbies');
}, 5 * 60 * 1000);

// Clean up expired reconnect sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of disconnectedSessions) {
        if (now - session.disconnectedAt > RECONNECT_TIMEOUT) {
            disconnectedSessions.delete(key);
        }
    }
}, 60_000);

/**
 * Clear all timers associated with a lobby.
 * @param {Lobby} lobby
 */
function clearLobbyTimers(lobby) {
    if (lobby.writingTimeout) {
        clearTimeout(lobby.writingTimeout);
        lobby.writingTimeout = null;
    }
}

// ── Socket.io Connection ────────────────────────────────────

io.on('connection', (socket) => {
    log.info({ socketId: socket.id }, 'Client connected');

    // Per-event rate limit guard
    socket.use(([event], next) => {
        if (!checkSocketRate(socket.id)) {
            log.warn({ socketId: socket.id, event }, 'Socket rate limited');
            return next(new Error('Rate limited'));
        }
        next();
    });

    // ── Reconnect ──────────────────────────────────────────

    socket.on('reconnect-session', ({ sessionToken, roomCode }) => {
        try {
            if (!sessionToken || typeof sessionToken !== 'string') return;

            const session = disconnectedSessions.get(sessionToken);
            if (!session) {
                return socket.emit('reconnect-failed', { reason: 'Session expired or not found.' });
            }

            const lobby = getLobby(session.roomCode);
            if (!lobby) {
                disconnectedSessions.delete(sessionToken);
                return socket.emit('reconnect-failed', { reason: 'Lobby no longer exists.' });
            }

            // Restore player in lobby
            const existingIdx = lobby.players.findIndex(p => p.id === session.oldSocketId);
            if (existingIdx !== -1) {
                lobby.players[existingIdx].id = socket.id;
                lobby.players[existingIdx].disconnected = false;
                delete lobby.players[existingIdx].disconnectedAt;
            } else {
                lobby.players.push({ id: socket.id, name: session.playerName, emoji: session.playerEmoji });
            }

            const oldId = session.oldSocketId;
            const newId = socket.id;
            replaceSocketIdInLobby(lobby, oldId, newId);

            if (lobby.host === oldId) lobby.host = newId;

            socket.join(session.roomCode);
            disconnectedSessions.delete(sessionToken);
            lobby.lastActivity = Date.now();

            log.info({ socketId: newId, roomCode: session.roomCode, player: session.playerName }, 'Player reconnected');

            socket.emit('reconnect-success', {
                roomCode: session.roomCode,
                players: lobby.players,
                settings: lobby.settings,
                started: lobby.started,
                currentRound: lobby.currentRound,
                totalRounds: lobby.settings.rounds,
                isHost: lobby.host === newId,
                gamePhase: session.gamePhase || 'lobby',
            });

            io.to(session.roomCode).emit('players-update', lobby.players);
            io.to(session.roomCode).emit('player-reconnected', { name: session.playerName });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in reconnect-session');
        }
    });

    // ── Create lobby ───────────────────────────────────────

    socket.on('create-lobby', ({ username, emoji, settings }) => {
        try {
            // Validate inputs
            const uResult = san.validateUsername(username);
            if (!uResult.valid) return socket.emit('lobby-error', { message: uResult.error });

            // Word filter check
            const nameCheck = filter.checkUsername(uResult.value);
            if (!nameCheck.clean) return socket.emit('lobby-error', { message: nameCheck.reason });

            // Max lobbies limit
            if (Object.keys(lobbies).length >= MAX_LOBBIES) {
                return socket.emit('lobby-error', { message: 'Server is full. Please try again later.' });
            }

            const eResult = san.validateEmoji(emoji);
            const safeSettings = san.validateSettings(settings || {});
            const merged = { ...DEFAULT_SETTINGS, ...safeSettings };

            if (merged.gameMode === 'speed') {
                merged.timerDuration = 60;
                merged.wordLimit = 100;
            }

            const roomCode = generateRoomCode();
            lobbies[roomCode] = {
                host:              socket.id,
                players:           [{ id: socket.id, name: uResult.value, emoji: eResult.value }],
                spectators:        [],
                settings:          merged,
                started:           false,
                currentRound:      0,
                totalScores:       {},
                roundHistory:      [],
                emojis:            {},
                stories:           {},
                guesses:           {},
                assignments:       {},
                teams:             null,
                resultsState:      null,
                leaderboard:       {},
                leaderboardDetails:{},
                writingTimeout:    null,
                writingStartTime:  null,
                lastActivity:      Date.now(),
            };

            socket.join(roomCode);
            log.info({ roomCode, host: uResult.value, lobbies: Object.keys(lobbies).length }, 'Lobby created');
            socket.emit('lobby-created', { roomCode, players: lobbies[roomCode].players, settings: merged });
            io.to(roomCode).emit('players-update', lobbies[roomCode].players);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in create-lobby');
            socket.emit('lobby-error', { message: 'Internal error creating lobby.' });
        }
    });

    // ── Join lobby ─────────────────────────────────────────

    socket.on('join-lobby', ({ username, roomCode, emoji }) => {
        try {
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

            // Duplicate name check
            if (lobby.players.some(p => p.name === uResult.value)) {
                return socket.emit('lobby-error', { message: 'Dieser Name ist bereits vergeben.' });
            }

            lobby.players.push({ id: socket.id, name: uResult.value, emoji: eResult.value });
            lobby.lastActivity = Date.now();
            socket.join(cResult.value);

            log.info({ roomCode: cResult.value, player: uResult.value }, 'Player joined');
            socket.emit('lobby-joined', { roomCode: cResult.value, players: lobby.players, settings: lobby.settings });
            io.to(cResult.value).emit('players-update', lobby.players);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in join-lobby');
            socket.emit('lobby-error', { message: 'Internal error joining lobby.' });
        }
    });

    // ── Join as spectator ──────────────────────────────────

    socket.on('join-spectator', ({ roomCode }) => {
        try {
            const cResult = san.validateRoomCode(roomCode);
            if (!cResult.valid) return socket.emit('lobby-error', { message: cResult.error });

            const lobby = getLobby(cResult.value);
            if (!lobby) return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });

            lobby.spectators.push({ id: socket.id });
            socket.join(cResult.value);

            log.debug({ roomCode: cResult.value }, 'Spectator joined');
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
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in join-spectator');
        }
    });

    // ── Update settings (host only) ────────────────────────

    socket.on('update-settings', ({ roomCode, settings }) => {
        try {
            const lobby = getLobby(roomCode);
            if (!lobby || lobby.host !== socket.id || lobby.started) return;

            const safeSettings = san.validateSettings(settings);
            lobby.settings = { ...lobby.settings, ...safeSettings };

            if (lobby.settings.gameMode === 'speed') {
                lobby.settings.timerDuration = 60;
                lobby.settings.wordLimit = 100;
            }

            lobby.lastActivity = Date.now();
            log.debug({ roomCode, settings: lobby.settings }, 'Settings updated');
            io.to(roomCode).emit('settings-update', lobby.settings);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in update-settings');
        }
    });

    // ── Start game ─────────────────────────────────────────

    socket.on('start-game', ({ roomCode }) => {
        try {
            const lobby = getLobby(roomCode);
            if (!lobby || lobby.host !== socket.id) return;
            if (lobby.started) return;
            if (lobby.players.length < 3) {
                return socket.emit('lobby-error', { message: 'Mindestens 3 Spieler nötig.' });
            }

            lobby.started = true;
            lobby.lastActivity = Date.now();

            // Team mode: auto-assign teams
            if (lobby.settings.gameMode === 'team') {
                const shuffled = [...lobby.players].sort(() => 0.5 - Math.random());
                const mid = Math.ceil(shuffled.length / 2);
                lobby.teams = {
                    A: shuffled.slice(0, mid).map(p => p.id),
                    B: shuffled.slice(mid).map(p => p.id),
                };
                io.to(roomCode).emit('teams-assigned', {
                    teams: lobby.teams,
                    players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
                });
            }

            log.info({ roomCode, players: lobby.players.length, mode: lobby.settings.gameMode }, 'Game started');
            startRound(roomCode);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in start-game');
        }
    });

    // ── Submit story ───────────────────────────────────────

    socket.on('submit-story', ({ roomCode, story }) => {
        try {
            const lobby = getLobby(roomCode);
            if (!lobby || !lobby.started) return;

            const result = san.validateStory(story, lobby.settings.wordLimit);
            if (!result.valid) {
                return socket.emit('story-error', { message: result.error });
            }

            // Word filter check on story content
            const storyCheck = filter.checkStory(result.value);
            if (!storyCheck.clean) {
                return socket.emit('story-error', { message: storyCheck.reason });
            }

            lobby.stories[socket.id] = result.value;
            lobby.lastActivity = Date.now();

            io.to(roomCode).emit('writing-progress', {
                submitted: Object.keys(lobby.stories).length,
                total: lobby.players.length,
            });

            if (Object.keys(lobby.stories).length === lobby.players.length) {
                clearLobbyTimers(lobby);
                startGuessingPhase(roomCode);
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in submit-story');
        }
    });

    // ── Submit guess ───────────────────────────────────────

    socket.on('submit-guess', ({ roomCode, guess }) => {
        try {
            const lobby = getLobby(roomCode);
            if (!lobby) return;
            if (!lobby.guesses) lobby.guesses = {};

            if (!guess || typeof guess !== 'object') return;

            lobby.guesses[socket.id] = { guess };
            lobby.lastActivity = Date.now();

            io.to(roomCode).emit('guessing-progress', {
                submitted: Object.keys(lobby.guesses).length,
                total: lobby.players.length,
            });

            if (Object.keys(lobby.guesses).length === lobby.players.length) {
                processResults(roomCode);
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in submit-guess');
        }
    });

    // ── Results continue (host) ────────────────────────────

    socket.on('results-continue', ({ roomCode }) => {
        try {
            const lobby = getLobby(roomCode);
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
            io.to(roomCode).emit('results-progress', lobby.resultsState);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in results-continue');
        }
    });

    // ── Leaderboard phase (host) ───────────────────────────

    socket.on('leaderboard-phase', ({ roomCode }) => {
        try {
            const lobby = getLobby(roomCode);
            if (!lobby) return;

            const teamScores = calculateTeamScores(lobby);

            io.to(roomCode).emit('leaderboard-phase', {
                leaderboard: lobby.leaderboard,
                leaderboardDetails: lobby.leaderboardDetails,
                players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
                teams: lobby.teams,
                teamScores,
                currentRound: lobby.currentRound,
                totalRounds: lobby.settings.rounds,
                totalScores: lobby.totalScores,
            });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in leaderboard-phase');
        }
    });

    // ── Next round (host, multi-round) ─────────────────────

    socket.on('next-round', ({ roomCode }) => {
        try {
            const lobby = getLobby(roomCode);
            if (!lobby || lobby.host !== socket.id) return;

            // Accumulate scores
            for (const [pid, score] of Object.entries(lobby.leaderboard || {})) {
                lobby.totalScores[pid] = (lobby.totalScores[pid] || 0) + score;
            }

            if (lobby.currentRound < lobby.settings.rounds) {
                lobby.roundHistory.push({
                    round: lobby.currentRound,
                    leaderboard: { ...lobby.leaderboard },
                });

                // Reset round state
                lobby.emojis = {};
                lobby.stories = {};
                lobby.guesses = {};
                lobby.leaderboard = {};
                lobby.leaderboardDetails = {};
                lobby.resultsState = null;

                startRound(roomCode);
            } else {
                io.to(roomCode).emit('game-over', {
                    totalScores: lobby.totalScores,
                    roundHistory: lobby.roundHistory,
                    players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
                    teams: lobby.teams,
                });
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in next-round');
        }
    });

    // ── New game (back to lobby) ───────────────────────────

    socket.on('new-game', ({ roomCode }) => {
        try {
            const lobby = getLobby(roomCode);
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

            log.info({ roomCode }, 'New game (back to lobby)');
            io.to(roomCode).emit('back-to-lobby', {
                players: lobby.players,
                settings: lobby.settings,
            });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in new-game');
        }
    });

    // ── Disconnect ─────────────────────────────────────────

    socket.on('disconnect', (reason) => {
        log.info({ socketId: socket.id, reason }, 'Client disconnected');
        socketRateLimits.delete(socket.id);

        for (const code in lobbies) {
            const lobby = lobbies[code];

            // Remove from spectators
            lobby.spectators = lobby.spectators.filter(s => s.id !== socket.id);

            // Check if this was a player
            const playerIdx = lobby.players.findIndex(p => p.id === socket.id);
            if (playerIdx === -1) continue;

            const player = lobby.players[playerIdx];

            // If game is in progress, save session for possible reconnect
            if (lobby.started) {
                const sessionToken = `${code}:${socket.id}:${Date.now()}`;
                disconnectedSessions.set(sessionToken, {
                    roomCode: code,
                    oldSocketId: socket.id,
                    playerName: player.name,
                    playerEmoji: player.emoji,
                    disconnectedAt: Date.now(),
                    gamePhase: getGamePhase(lobby),
                });

                io.to(code).emit('player-disconnected', {
                    name: player.name,
                    reconnectTimeout: RECONNECT_TIMEOUT,
                });

                log.info({ roomCode: code, player: player.name }, 'Player disconnected mid-game, session saved');

                lobby.players[playerIdx].disconnected = true;
                lobby.players[playerIdx].disconnectedAt = Date.now();

                // Timeout to remove player if they don't reconnect
                setTimeout(() => {
                    try {
                        const currentLobby = getLobby(code);
                        if (!currentLobby) return;

                        const p = currentLobby.players.find(x => x.id === socket.id && x.disconnected);
                        if (!p) return;

                        log.info({ roomCode: code, player: p.name }, 'Reconnect timeout expired, removing player');
                        currentLobby.players = currentLobby.players.filter(x => x.id !== socket.id);
                        delete currentLobby.emojis?.[socket.id];
                        delete currentLobby.stories?.[socket.id];

                        if (currentLobby.host === socket.id) {
                            if (currentLobby.players.length > 0) {
                                const newHost = currentLobby.players.find(x => !x.disconnected) || currentLobby.players[0];
                                currentLobby.host = newHost.id;
                                io.to(code).emit('host-changed', { newHost: newHost.name, newHostId: newHost.id });
                                log.info({ roomCode: code, newHost: newHost.name }, 'Host reassigned');
                            } else {
                                clearLobbyTimers(currentLobby);
                                delete lobbies[code];
                                io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                                return;
                            }
                        }

                        if (currentLobby.players.length === 0) {
                            clearLobbyTimers(currentLobby);
                            delete lobbies[code];
                            io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                        } else {
                            io.to(code).emit('players-update', currentLobby.players);
                        }
                    } catch (err) {
                        log.error({ err }, 'Error in disconnect cleanup timeout');
                    }
                }, RECONNECT_TIMEOUT);

            } else {
                // Not in game — remove immediately
                lobby.players = lobby.players.filter(p => p.id !== socket.id);

                if (lobby.host === socket.id || lobby.players.length === 0) {
                    if (lobby.players.length > 0) {
                        lobby.host = lobby.players[0].id;
                        io.to(code).emit('host-changed', { newHost: lobby.players[0].name, newHostId: lobby.players[0].id });
                        io.to(code).emit('players-update', lobby.players);
                        log.info({ roomCode: code, newHost: lobby.players[0].name }, 'Host reassigned after disconnect');
                    } else {
                        clearLobbyTimers(lobby);
                        delete lobbies[code];
                        io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                    }
                } else {
                    io.to(code).emit('players-update', lobby.players);
                }
            }
        }
    });
});

// ── Game flow functions ─────────────────────────────────────

/**
 * Start a new round in the given lobby.
 * @param {string} roomCode
 */
function startRound(roomCode) {
    const lobby = getLobby(roomCode);
    if (!lobby) return;

    lobby.currentRound++;
    lobby.stories = {};
    lobby.guesses = {};
    const { settings } = lobby;

    // Assign emojis to each player
    for (const p of lobby.players) {
        lobby.emojis[p.id] = getRandomEmojis(settings.emojiCount, settings.emojiPacks);
    }

    const writingStartTime = Date.now();
    lobby.writingStartTime = writingStartTime;

    // Writing timer
    clearLobbyTimers(lobby);
    lobby.writingTimeout = setTimeout(() => {
        if (lobby && lobby.started && Object.keys(lobby.stories).length < lobby.players.length) {
            log.debug({ roomCode }, 'Writing timer expired, moving to guessing phase');
            startGuessingPhase(roomCode);
        }
    }, settings.timerDuration * 1000);

    // Send each player their emojis
    for (const p of lobby.players) {
        io.to(p.id).emit('round-started', {
            emojis: lobby.emojis[p.id],
            writingStartTime,
            currentRound: lobby.currentRound,
            totalRounds: settings.rounds,
            settings,
        });
    }

    // Notify spectators
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

    log.info({ roomCode, round: lobby.currentRound, totalRounds: settings.rounds }, 'Round started');
}

/**
 * Start the guessing phase — create derangement assignments.
 * @param {string} roomCode
 */
function startGuessingPhase(roomCode) {
    const lobby = getLobby(roomCode);
    if (!lobby) return;

    const activePlayers = lobby.players.filter(p => !p.disconnected);
    const playerIds = activePlayers.map(p => p.id);

    if (playerIds.length < 2) {
        log.warn({ roomCode }, 'Not enough active players for guessing phase');
        io.to(roomCode).emit('lobby-error', { message: 'Nicht genug aktive Spieler.' });
        return;
    }

    // Derangement (no player reads own story)
    const assignments = {};
    let deranged = false;
    let attempts = 0;
    while (!deranged && attempts < 1000) {
        attempts++;
        const shuffled = [...playerIds].sort(() => 0.5 - Math.random());
        deranged = true;
        for (let i = 0; i < playerIds.length; i++) {
            if (playerIds[i] === shuffled[i]) { deranged = false; break; }
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
                if (!combos.some(arr => arr.join() === combo.join())) combos.push(combo);
            }
            combos.sort(() => 0.5 - Math.random());
            emojiOptions = combos;
        }

        io.to(id).emit('guess-phase', {
            story,
            emojiOptions,
            correctEmojis,
            players: lobby.players.filter(p => p.id !== id && !p.disconnected).map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
            authorId,
            gameMode: settings.gameMode,
        });
    }

    for (const s of lobby.spectators) {
        io.to(s.id).emit('spectator-guess-phase');
    }

    log.debug({ roomCode }, 'Guessing phase started');
}

/**
 * Process round results and emit to all players.
 * @param {string} roomCode
 */
function processResults(roomCode) {
    const lobby = getLobby(roomCode);
    if (!lobby) return;

    const { results, leaderboardDetails, teamScores } = processRoundResults(lobby);

    lobby.resultsState = { currentChatIdx: 0, currentMsgStep: 0 };
    lobby.leaderboardDetails = leaderboardDetails;

    io.to(roomCode).emit('results-phase', {
        results,
        leaderboard: lobby.leaderboard,
        players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
        resultsState: lobby.resultsState,
        teams: lobby.teams,
        teamScores,
        currentRound: lobby.currentRound,
        totalRounds: lobby.settings.rounds,
        gameMode: lobby.settings.gameMode,
    });

    log.info({ roomCode, round: lobby.currentRound }, 'Results processed');
}

/**
 * Determine the current game phase for a lobby.
 * @param {Lobby} lobby
 * @returns {string}
 */
function getGamePhase(lobby) {
    if (!lobby.started) return 'lobby';
    if (lobby.resultsState) return 'results';
    if (Object.keys(lobby.guesses || {}).length > 0) return 'guessing';
    return 'writing';
}

/**
 * Replace an old socket ID with a new one across all lobby state maps.
 * @param {Lobby} lobby
 * @param {string} oldId
 * @param {string} newId
 */
function replaceSocketIdInLobby(lobby, oldId, newId) {
    const maps = ['emojis', 'stories', 'guesses', 'leaderboard', 'totalScores'];
    for (const key of maps) {
        if (lobby[key] && lobby[key][oldId] !== undefined) {
            lobby[key][newId] = lobby[key][oldId];
            delete lobby[key][oldId];
        }
    }

    // Teams
    if (lobby.teams) {
        for (const team of ['A', 'B']) {
            const idx = lobby.teams[team].indexOf(oldId);
            if (idx !== -1) lobby.teams[team][idx] = newId;
        }
    }

    // Assignments
    if (lobby.assignments) {
        if (lobby.assignments[oldId]) {
            lobby.assignments[newId] = lobby.assignments[oldId];
            delete lobby.assignments[oldId];
        }
        for (const key in lobby.assignments) {
            if (lobby.assignments[key] === oldId) lobby.assignments[key] = newId;
        }
    }
}

// ── Graceful Shutdown ───────────────────────────────────────

/**
 * Gracefully shut down the server.
 * @param {string} signal - Signal or reason for shutdown.
 */
function gracefulShutdown(signal) {
    log.info({ signal }, 'Shutdown signal received, closing gracefully…');

    io.emit('server-shutdown', { message: 'Server is restarting. Please reconnect shortly.' });

    io.close(() => {
        log.info('Socket.io closed');
    });

    server.close(() => {
        log.info('HTTP server closed');

        for (const code in lobbies) {
            clearLobbyTimers(lobbies[code]);
        }

        log.info('Shutdown complete');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        log.error('Forced exit after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    log.error({ reason }, 'Unhandled rejection');
});

// ── Start server ────────────────────────────────────────────

server.listen(PORT, () => {
    log.info({ port: PORT, env: NODE_ENV, maxLobbies: MAX_LOBBIES }, 'IconTale server running');
});
