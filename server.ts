// ═══════════════════════════════════════════════════════════════
//  IconTale — Server
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

// Sentry must initialise before any instrumentation hooks can be
// registered (HTTP request capture, express middleware). Keep this
// at the very top of the file.
import * as sentry from './lib/sentry';
sentry.initSentry({ version: process.env.npm_package_version });

import crypto from 'crypto';
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server, Socket } from 'socket.io';

import log from './lib/logger';
import * as san from './lib/sanitize';
import * as filter from './lib/wordfilter';
import { calculateTeamScores } from './lib/scoring';
import * as store from './lib/store';
import * as rateLimiter from './lib/socket-rate-limit';
import { issueToken, verifyToken } from './lib/socket-auth';
import { updateStatsAndCheck, ACHIEVEMENTS } from './lib/achievements';
import { recordEvent, finalizeReplay, getReplay } from './lib/replay';
import { getRandomEmojis } from './lib/emoji-packs';
import {
    registerCounter,
    registerGauge,
    registerSnapshotGauge,
    renderMetrics,
} from './lib/metrics';
import {
    startRound,
    startGuessingPhase,
    processGameResults,
    getGamePhase,
    replaceSocketIdInLobby,
    type GameFlowDeps,
} from './lib/game-flow';

import type {
    Lobby,
    GameSettings,
    DisconnectedSession,
    Guess,
} from './lib/types';

// ── Environment validation ──────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const allowWildcardOrigin = process.env.ALLOW_WILDCARD_ORIGIN === 'true';
const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    : [];
const ALLOWED_ORIGINS =
    configuredOrigins.length > 0
        ? configuredOrigins
        : NODE_ENV === 'production' && !allowWildcardOrigin
          ? []
          : ['*'];

if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    log.fatal({ port: process.env.PORT }, 'Invalid PORT — must be 1-65535');
    process.exit(1);
}

if (NODE_ENV === 'production' && ALLOWED_ORIGINS.length === 0) {
    log.fatal(
        'ALLOWED_ORIGINS must be set in production (comma-separated absolute origins).'
    );
    process.exit(1);
}

if (
    NODE_ENV === 'production' &&
    ALLOWED_ORIGINS.includes('*') &&
    !allowWildcardOrigin
) {
    log.fatal(
        'Wildcard ALLOWED_ORIGINS is blocked in production. Set explicit origins or ALLOW_WILDCARD_ORIGIN=true.'
    );
    process.exit(1);
}

log.info({ NODE_ENV, PORT, origins: ALLOWED_ORIGINS }, 'Environment validated');

// ── Express setup ───────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// Trust the first proxy hop so req.ip, req.protocol and the
// X-Forwarded-* headers reflect reality behind Render/Railway/
// Heroku/Fly load balancers. Without this the HTTPS redirect
// below and the express-rate-limit per-IP bucket both degrade:
//   - Any client could spoof 'x-forwarded-proto: https' to
//     bypass the redirect.
//   - Every request would appear to come from the proxy's IP,
//     so one abusive client could exhaust the rate-limit for
//     everyone else.
// '1' matches exactly one hop, which is correct for the usual
// managed-PaaS deploys. Set TRUST_PROXY=loopback|uniquelocal|
// ...or a number in the env to customise.
const trustProxy = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

// HTTPS redirect in production
if (NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
            return next();
        }
        return res.redirect(301, `https://${req.hostname}${req.url}`);
    });
}

// CORS configuration
app.use(
    cors({
        origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
    })
);

// Security headers.
//
// CSP notes:
//   - No inline <script> is used in the app anymore (SW registration was
//     extracted into /js/sw-register.js), so we do NOT include
//     'unsafe-inline' in script-src. This mitigates most reflected XSS
//     attack vectors at the browser level.
//   - style-src still allows 'unsafe-inline' because the design system
//     relies on inline style attributes (timer bar width, leaderboard
//     tooltips, etc.). Removing this is tracked in the improvement plan.
//   - Fonts are self-hosted, so no third-party font hosts are whitelisted.
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                fontSrc: ["'self'"],
                connectSrc: ["'self'", 'ws:', 'wss:'],
                imgSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    })
);

// Rate limiting — general HTTP
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 min
        max: 200, // per IP
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        ipv6Subnet: 56,
        message: { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
    })
);

// Content-Language tracks the app's negotiated locale based on the
// Accept-Language request header. We only advertise languages the
// UI actually ships (de / en); unknown values fall back to the
// default. Client-side code is still responsible for switching the
// <html lang> attribute at runtime (see public/js/i18n.js), this
// header just makes the initial HTML tell crawlers the truth.
const SUPPORTED_LOCALES = ['de', 'en'];
const DEFAULT_LOCALE = 'de';

function negotiateLocale(acceptLanguage?: string): string {
    if (!acceptLanguage) return DEFAULT_LOCALE;
    const candidates = acceptLanguage
        .split(',')
        .map((part) => part.split(';')[0]!.trim().toLowerCase())
        .filter(Boolean);

    for (const candidate of candidates) {
        const short = candidate.slice(0, 2);
        if (SUPPORTED_LOCALES.includes(short)) return short;
    }
    return DEFAULT_LOCALE;
}

app.use((req, res, next) => {
    const locale = negotiateLocale(req.headers['accept-language']);
    res.setHeader('Content-Language', locale);
    res.setHeader('Vary', 'Accept-Language');
    next();
});

app.use(
    compression({
        threshold: 1024,
    })
);
app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));

// ── Metrics ─────────────────────────────────────────────────
//
// All counters live alongside the code that increments them, but
// the gauges are defined once here so the /metrics endpoint always
// exposes them even before the first event occurs.

const metricSocketEvents = registerCounter(
    'icontale_socket_events_total',
    'Accepted Socket.io events by name',
    ['event']
);
const metricLobbyEvents = registerCounter(
    'icontale_lobby_events_total',
    'Lobby lifecycle events',
    ['type']
);
const metricStoriesSubmitted = registerCounter(
    'icontale_stories_submitted_total',
    'Stories successfully submitted by players'
);
const metricGuessesSubmitted = registerCounter(
    'icontale_guesses_submitted_total',
    'Guesses successfully submitted by players'
);
const metricConnectedSockets = registerGauge(
    'icontale_connected_sockets',
    'Sockets currently connected to this node'
);

// Snapshot gauges read from authoritative storage (Redis) at scrape
// time so restarts cannot leave stale values behind.
registerSnapshotGauge(
    'icontale_lobbies_active',
    'Active lobbies known to the store',
    () => store.getLobbyCount()
);
registerSnapshotGauge(
    'icontale_process_uptime_seconds',
    'Process uptime in seconds',
    () => process.uptime()
);
registerSnapshotGauge(
    'icontale_heap_bytes',
    'V8 heapUsed in bytes',
    () => process.memoryUsage().heapUsed
);

// Health check.
//
// Returns a small JSON blob covering the liveness (process alive),
// readiness (Redis reachable) and capacity (lobby count, heap) of
// this node. Failures never throw — a /health that crashes is worse
// than one returning degraded info. The response code reflects the
// worst component:
//    200 ok         everything healthy.
//    503 degraded   Redis or store layer is unreachable.
app.get('/health', async (_req, res) => {
    const started = Date.now();
    const mem = process.memoryUsage();
    const status: {
        status: 'ok' | 'degraded';
        uptime: number;
        timestamp: string;
        version: string;
        node: string;
        lobbies: number | null;
        redis: 'ok' | 'error' | 'unknown';
        heap: { used: number; total: number };
        checkMs: number;
    } = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? 'unknown',
        node: process.version,
        lobbies: null,
        redis: 'unknown',
        heap: { used: mem.heapUsed, total: mem.heapTotal },
        checkMs: 0,
    };

    try {
        const count = await store.getLobbyCount();
        status.lobbies = count;
        status.redis = 'ok';
    } catch (err) {
        log.warn({ err }, 'health: store probe failed');
        status.redis = 'error';
        status.status = 'degraded';
    }

    status.checkMs = Date.now() - started;
    res.status(status.status === 'ok' ? 200 : 503).json(status);
});

// Prometheus scrape endpoint. Intentionally NOT behind auth because
// most scrape setups run inside the cluster; if you expose this
// publicly, restrict it at the reverse proxy.
app.get('/metrics', async (_req, res) => {
    try {
        const body = await renderMetrics();
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(body);
    } catch (err) {
        log.error({ err }, 'Failed to render metrics');
        res.status(500).send('# metrics unavailable\n');
    }
});

// Replay route
app.get('/replay/:id', async (req, res) => {
    const replay = await getReplay(req.params.id);
    if (!replay) return res.status(404).json({ error: 'Replay not found' });
    res.json(replay);
});

// Short-lived handshake token for Socket.io connections.
// The HTTP layer already went through rate-limit + CORS + CSRF,
// so issuing a token here is safe; the Socket.io middleware then
// verifies that any connection holds a valid token before accepting
// events. The TTL is intentionally short (2 min) so a leaked token
// is useless almost immediately.
app.get('/api/socket-token', (_req, res) => {
    res.json({ token: issueToken() });
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
//
// Two checks run for every incoming connection:
//   1. Origin allow-list (unchanged).
//   2. Short-lived handshake token obtained from GET /api/socket-token.
//      When ENFORCE_SOCKET_AUTH is truthy, missing/invalid tokens are
//      rejected outright. Otherwise the token is only logged — this
//      lets operators observe rollout coverage before flipping the
//      enforcement flag.
const ENFORCE_SOCKET_AUTH =
    process.env.ENFORCE_SOCKET_AUTH === '1' ||
    process.env.ENFORCE_SOCKET_AUTH === 'true';

io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    const originOk =
        ALLOWED_ORIGINS.includes('*') ||
        !origin ||
        ALLOWED_ORIGINS.includes(origin);

    if (!originOk) {
        log.warn({ origin, socketId: socket.id }, 'Rejected socket connection from disallowed origin');
        return next(new Error('Origin not allowed'));
    }

    const token = socket.handshake.auth?.token;
    const result = verifyToken(token);
    if (!result.valid) {
        log.warn(
            { socketId: socket.id, origin, reason: result.reason, enforced: ENFORCE_SOCKET_AUTH },
            'Socket handshake token invalid'
        );
        if (ENFORCE_SOCKET_AUTH) {
            return next(new Error('Invalid handshake token'));
        }
    }

    next();
});

// ── Socket rate limiting ────────────────────────────────────
// Per-event quotas (plus a global backstop) live in
// ./lib/socket-rate-limit.ts. Buckets are swept periodically to
// bound memory growth even when sockets churn.

setInterval(() => {
    const removed = rateLimiter.sweep();
    if (removed > 0) log.debug({ removed }, 'Rate-limit bucket sweep');
}, 60_000);

// ── Default Settings ────────────────────────────────────────

const DEFAULT_SETTINGS: GameSettings = {
    gameMode: 'classic',
    timerDuration: 180,
    wordLimit: 500,
    emojiCount: 3,
    rounds: 1,
    emojiPacks: ['all'],
};

// ── Server Limits ───────────────────────────────────────────

const MAX_LOBBIES = parseInt(process.env.MAX_LOBBIES ?? '', 10) || 100;
const MAX_PLAYERS_PER_LOBBY = 20;

// ── Helpers ─────────────────────────────────────────────────

function generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i]! % chars.length];
    }
    return code;
}

function getLobby(code: string): Lobby | null {
    return lobbies[code] ?? null;
}

// ── In-memory lobbies ───────────────────────────────────────

const lobbies: Record<string, Lobby> = {};

const disconnectedSessions = new Map<string, DisconnectedSession>();
const RECONNECT_TIMEOUT = 2 * 60 * 1000; // 2 min

// Clean up abandoned lobbies every 5 min
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const code in lobbies) {
        const lobby = lobbies[code]!;
        if (
            lobby.players.length === 0 ||
            now - lobby.lastActivity > 30 * 60 * 1000
        ) {
            clearLobbyTimers(lobby);
            delete lobbies[code];
            io.to(code).emit('lobby-closed', { reason: 'Inactivity timeout.' });
            metricLobbyEvents.inc({ type: 'closed_inactive' });
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
            store.deleteSession(key)
                .catch((err) => log.error({ err }, 'Failed to delete expired session'));
        }
    }
}, 60_000);

function clearLobbyTimers(lobby: Lobby): void {
    if (lobby.writingTimeout) {
        clearTimeout(lobby.writingTimeout);
        lobby.writingTimeout = null;
    }
}

// ── Game-flow dependency bundle ─────────────────────────────

const deps: GameFlowDeps = {
    getLobby,
    io,
    saveLobby: (code, lobby) => store.saveLobby(code, lobby),
    clearLobbyTimers,
    getRandomEmojis,
};

// ── Socket.io Connection ────────────────────────────────────

io.on('connection', (socket: Socket) => {
    log.info({ socketId: socket.id }, 'Client connected');
    metricConnectedSockets.inc();

    socket.use((packet, next) => {
        const event = packet[0];
        if (typeof event !== 'string') return next();

        const args = packet.slice(1);
        const bytes = rateLimiter.estimatePayloadBytes(args);
        if (bytes > rateLimiter.MAX_PAYLOAD_BYTES) {
            log.warn(
                { socketId: socket.id, event, bytes, max: rateLimiter.MAX_PAYLOAD_BYTES },
                'Socket payload too large — dropping'
            );
            return next(new Error('Payload too large'));
        }

        if (!rateLimiter.allowEvent(socket.id, event)) {
            return next(new Error('Rate limited'));
        }
        if (typeof event === 'string') {
            metricSocketEvents.inc({ event });
        }
        next();
    });

    // ── Reconnect ──────────────────────────────────────────

    socket.on('reconnect-session', async (payload: { sessionToken?: string; roomCode?: string }) => {
        try {
            const { sessionToken } = payload ?? {};
            if (!sessionToken || typeof sessionToken !== 'string') return;

            // Try in-memory first, fall back to Redis
            let session = disconnectedSessions.get(sessionToken);
            if (!session) {
                session = (await store.getSession(sessionToken)) ?? undefined;
            }
            if (!session) {
                return socket.emit('reconnect-failed', {
                    reason: 'Session expired or not found.',
                });
            }

            const lobby = getLobby(session.roomCode);
            if (!lobby) {
                disconnectedSessions.delete(sessionToken);
                return socket.emit('reconnect-failed', {
                    reason: 'Lobby no longer exists.',
                });
            }

            const existingIdx = lobby.players.findIndex((p) => p.id === session.oldSocketId);
            if (existingIdx !== -1) {
                lobby.players[existingIdx]!.id = socket.id;
                lobby.players[existingIdx]!.disconnected = false;
                delete lobby.players[existingIdx]!.disconnectedAt;
            } else {
                lobby.players.push({
                    id: socket.id,
                    name: session.playerName,
                    emoji: session.playerEmoji,
                });
            }

            const oldId = session.oldSocketId;
            const newId = socket.id;
            replaceSocketIdInLobby(lobby, oldId, newId);

            if (lobby.host === oldId) lobby.host = newId;

            socket.join(session.roomCode);
            disconnectedSessions.delete(sessionToken);
            lobby.lastActivity = Date.now();

            // Remove session from Redis store
            store.deleteSession(sessionToken)
                .catch((err) => log.error({ err }, 'Failed to delete session from store'));

            store
                .saveLobby(session.roomCode, lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            log.info(
                { socketId: newId, roomCode: session.roomCode, player: session.playerName },
                'Player reconnected'
            );

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

            // Mark reconnected for "comeback" achievement (checked at game-over)
            const reconPlayer = lobby.players.find((p) => p.id === socket.id);
            if (reconPlayer) (reconPlayer as unknown as Record<string, unknown>)._reconnected = true;

            io.to(session.roomCode).emit('players-update', lobby.players);
            io.to(session.roomCode).emit('player-reconnected', {
                name: session.playerName,
            });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in reconnect-session');
        }
    });

    // ── Achievements list ────────────────────────────────────

    socket.on('achievements-list', async () => {
        try {
            const unlocked = await store.getUnlockedAchievements(socket.id);
            socket.emit('achievements-list', {
                achievements: ACHIEVEMENTS,
                unlocked,
            });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in achievements-list');
            socket.emit('achievements-list', {
                achievements: ACHIEVEMENTS,
                unlocked: [],
            });
        }
    });

    // ── Create lobby ───────────────────────────────────────

    socket.on('create-lobby', (payload: { username?: string; emoji?: string; settings?: Partial<GameSettings> }) => {
        try {
            const { username, emoji, settings } = payload ?? {};
            const uResult = san.validateUsername(username);
            if (!uResult.valid) return socket.emit('lobby-error', { message: uResult.error });

            const nameCheck = filter.checkUsername(uResult.value);
            if (!nameCheck.clean)
                return socket.emit('lobby-error', { message: nameCheck.reason });

            if (Object.keys(lobbies).length >= MAX_LOBBIES) {
                return socket.emit('lobby-error', {
                    message: 'Server ist voll. Bitte später erneut versuchen.',
                });
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
                players: [
                    {
                        id: socket.id,
                        name: uResult.value,
                        emoji: eResult.value,
                    },
                ],
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
            store
                .saveLobby(roomCode, lobbies[roomCode]!)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            log.info(
                {
                    roomCode,
                    host: uResult.value,
                    lobbies: Object.keys(lobbies).length,
                },
                'Lobby created'
            );
            socket.emit('lobby-created', {
                roomCode,
                players: lobbies[roomCode]!.players,
                settings: merged,
            });
            metricLobbyEvents.inc({ type: 'created' });
            io.to(roomCode).emit('players-update', lobbies[roomCode]!.players);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in create-lobby');
            socket.emit('lobby-error', { message: 'Interner Fehler beim Erstellen der Lobby.' });
        }
    });

    // ── Join lobby ─────────────────────────────────────────

    socket.on(
        'join-lobby',
        (payload: { username?: string; roomCode?: string; emoji?: string }) => {
            try {
                const { username, roomCode, emoji } = payload ?? {};
                const uResult = san.validateUsername(username);
                if (!uResult.valid)
                    return socket.emit('lobby-error', { message: uResult.error });

                const nameCheck = filter.checkUsername(uResult.value);
                if (!nameCheck.clean)
                    return socket.emit('lobby-error', { message: nameCheck.reason });

                const cResult = san.validateRoomCode(roomCode);
                if (!cResult.valid)
                    return socket.emit('lobby-error', { message: cResult.error });

                const eResult = san.validateEmoji(emoji);
                const lobby = getLobby(cResult.value);

                if (!lobby)
                    return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });
                if (lobby.started)
                    return socket.emit('lobby-error', {
                        message: 'Spiel bereits gestartet.',
                    });
                if (lobby.players.length >= MAX_PLAYERS_PER_LOBBY) {
                    return socket.emit('lobby-error', {
                        message: `Lobby ist voll (max ${MAX_PLAYERS_PER_LOBBY}).`,
                    });
                }

                if (lobby.players.some((p) => p.name === uResult.value)) {
                    return socket.emit('lobby-error', {
                        message: 'Dieser Name ist bereits vergeben.',
                    });
                }

                lobby.players.push({
                    id: socket.id,
                    name: uResult.value,
                    emoji: eResult.value,
                });
                lobby.lastActivity = Date.now();
                socket.join(cResult.value);

                store
                    .saveLobby(cResult.value, lobby)
                    .catch((err) => log.error({ err }, 'Redis save failed'));

                log.info({ roomCode: cResult.value, player: uResult.value }, 'Player joined');
                socket.emit('lobby-joined', {
                    roomCode: cResult.value,
                    players: lobby.players,
                    settings: lobby.settings,
                });
                metricLobbyEvents.inc({ type: 'joined' });
                io.to(cResult.value).emit('players-update', lobby.players);
            } catch (err) {
                log.error({ err, socketId: socket.id }, 'Error in join-lobby');
                socket.emit('lobby-error', { message: 'Interner Fehler beim Beitreten.' });
            }
        }
    );

    // ── Join as spectator ──────────────────────────────────

    socket.on('join-spectator', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const cResult = san.validateRoomCode(roomCode);
            if (!cResult.valid)
                return socket.emit('lobby-error', { message: cResult.error });

            const lobby = getLobby(cResult.value);
            if (!lobby)
                return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });

            lobby.spectators.push({ id: socket.id });
            socket.join(cResult.value);

            store
                .saveLobby(cResult.value, lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

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

            // Achievement: track spectated games
            updateStatsAndCheck(socket.id, (s) => {
                s.spectatedGames = (s.spectatedGames ?? 0) + 1;
            }).then((achs) => {
                if (achs.length) io.to(socket.id).emit('achievement-unlocked', { achievements: achs });
            }).catch((achErr) => log.error({ err: achErr }, 'Achievement check failed'));

        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in join-spectator');
        }
    });

    // ── Update settings (host only) ────────────────────────

    socket.on(
        'update-settings',
        (payload: { roomCode?: string; settings?: Partial<GameSettings> }) => {
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

                store
                    .saveLobby(roomCode ?? '', lobby)
                    .catch((err) => log.error({ err }, 'Redis save failed'));

                log.debug({ roomCode, settings: lobby.settings }, 'Settings updated');
                io.to(roomCode ?? '').emit('settings-update', lobby.settings);
            } catch (err) {
                log.error({ err, socketId: socket.id }, 'Error in update-settings');
            }
        }
    );

    // ── Start game ─────────────────────────────────────────

    socket.on('start-game', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || lobby.host !== socket.id) return;
            if (lobby.started) return;
            if (lobby.players.length < 3) {
                return socket.emit('lobby-error', {
                    message: 'Mindestens 3 Spieler nötig.',
                });
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
                    players: lobby.players.map((p) => ({
                        id: p.id,
                        name: p.name,
                        emoji: p.emoji,
                    })),
                });
            }

            store
                .saveLobby(roomCode ?? '', lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            log.info(
                {
                    roomCode,
                    players: lobby.players.length,
                    mode: lobby.settings.gameMode,
                },
                'Game started'
            );
            startRound(roomCode ?? '', deps);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in start-game');
        }
    });

    // ── Submit story ───────────────────────────────────────

    socket.on('submit-story', (payload: { roomCode?: string; story?: string }) => {
        try {
            const { roomCode, story } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || !lobby.started) return;

            const result = san.validateStory(story, lobby.settings.wordLimit);
            if (!result.valid) {
                return socket.emit('story-error', { message: result.error });
            }

            const storyCheck = filter.checkStory(result.value);
            if (!storyCheck.clean) {
                return socket.emit('story-error', { message: storyCheck.reason });
            }

            lobby.stories[socket.id] = result.value;
            lobby.lastActivity = Date.now();
            metricStoriesSubmitted.inc();

            // Achievement: track story stats (speed-demon, minimalist, novelist)
            const wordCount = result.value.split(/\s+/).filter(Boolean).length;
            const elapsed = lobby.writingStartTime
                ? (Date.now() - lobby.writingStartTime) / 1000
                : Infinity;
            updateStatsAndCheck(socket.id, (s) => {
                if (elapsed < 30) s.fastestStoryTime = Math.min(s.fastestStoryTime ?? Infinity, elapsed);
                s.longestStoryWords = Math.max(s.longestStoryWords ?? 0, wordCount);
                s.shortestStoryWords = Math.min(s.shortestStoryWords ?? Infinity, wordCount);
            }).then((achs) => {
                if (achs.length) io.to(socket.id).emit('achievement-unlocked', { achievements: achs });
            }).catch((achErr) => log.error({ err: achErr }, 'Achievement check failed'));

            // Record replay event
            recordEvent(lobby, 'story-submit', { playerId: socket.id });

            store
                .saveLobby(roomCode ?? '', lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            io.to(roomCode ?? '').emit('writing-progress', {
                submitted: Object.keys(lobby.stories).length,
                total: lobby.players.length,
            });

            if (Object.keys(lobby.stories).length === lobby.players.length) {
                clearLobbyTimers(lobby);
                startGuessingPhase(roomCode ?? '', deps);
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in submit-story');
        }
    });

    // ── Submit guess ───────────────────────────────────────

    socket.on('submit-guess', (payload: { roomCode?: string; guess?: Guess }) => {
        try {
            const { roomCode, guess } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby) return;
            if (!lobby.guesses) lobby.guesses = {};

            if (!guess || typeof guess !== 'object') return;

            lobby.guesses[socket.id] = { guess };
            lobby.lastActivity = Date.now();
            metricGuessesSubmitted.inc();

            // Record replay event for guess
            recordEvent(lobby, 'guess-submit', { playerId: socket.id });

            store
                .saveLobby(roomCode ?? '', lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            io.to(roomCode ?? '').emit('guessing-progress', {
                submitted: Object.keys(lobby.guesses).length,
                total: lobby.players.length,
            });

            if (Object.keys(lobby.guesses).length === lobby.players.length) {
                processGameResults(roomCode ?? '', deps);
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in submit-guess');
        }
    });

    // ── Results continue (host) ────────────────────────────

    socket.on('results-continue', (payload: { roomCode?: string }) => {
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

            store
                .saveLobby(roomCode ?? '', lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            io.to(roomCode ?? '').emit('results-progress', lobby.resultsState);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in results-continue');
        }
    });

    // ── Leaderboard phase (host) ───────────────────────────

    socket.on('leaderboard-phase', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby) return;

            const teamScores = calculateTeamScores(lobby);

            // Record replay event for leaderboard
            recordEvent(lobby, 'leaderboard', { leaderboard: lobby.leaderboard });

            io.to(roomCode ?? '').emit('leaderboard-phase', {
                leaderboard: lobby.leaderboard,
                leaderboardDetails: lobby.leaderboardDetails,
                players: lobby.players.map((p) => ({
                    id: p.id,
                    name: p.name,
                    emoji: p.emoji,
                })),
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

    socket.on('next-round', async (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || lobby.host !== socket.id) return;

            for (const [pid, score] of Object.entries(lobby.leaderboard ?? {})) {
                lobby.totalScores[pid] = (lobby.totalScores[pid] || 0) + score;
            }

            if (lobby.currentRound < lobby.settings.rounds) {
                lobby.roundHistory.push({
                    round: lobby.currentRound,
                    leaderboard: { ...lobby.leaderboard },
                });

                lobby.emojis = {};
                lobby.stories = {};
                lobby.guesses = {};
                lobby.leaderboard = {};
                lobby.leaderboardDetails = {};
                lobby.resultsState = null;

                store
                    .saveLobby(roomCode ?? '', lobby)
                    .catch((err) => log.error({ err }, 'Redis save failed'));

                startRound(roomCode ?? '', deps);
            } else {
                const replayId = await finalizeReplay(lobby, roomCode ?? '');

                io.to(roomCode ?? '').emit('game-over', {
                    totalScores: lobby.totalScores,
                    roundHistory: lobby.roundHistory,
                    players: lobby.players.map((p) => ({
                        id: p.id,
                        name: p.name,
                        emoji: p.emoji,
                    })),
                    teams: lobby.teams,
                    replayId,
                });

                // ── Achievement checks at game-over ──────────
                const winnerId = Object.entries(lobby.totalScores)
                    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0];

                for (const p of lobby.players) {
                    const isWinner = p.id === winnerId;
                    const extra: string[] = [];
                    if (lobby.teams && isWinner) extra.push('team-captain');
                    if ((p as unknown as Record<string, unknown>)._reconnected && isWinner) extra.push('comeback');

                    try {
                        const newAchs = await updateStatsAndCheck(p.id, (s) => {
                            s.gamesPlayed++;
                            if (isWinner) s.gamesWon++;
                            s.modesPlayed.add(lobby.settings.gameMode);
                            if (lobby.settings.rounds >= 5) s.bestOf5Completed = true;
                            if ((p as unknown as Record<string, unknown>)._reconnected && isWinner) {
                                s.reconnectedAndWon = true;
                            }
                        }, extra);
                        if (newAchs.length > 0) {
                            io.to(p.id).emit('achievement-unlocked', { achievements: newAchs });
                        }
                    } catch (achErr) {
                        log.error({ err: achErr, playerId: p.id }, 'Achievement check failed at game-over');
                    }
                }
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in next-round');
        }
    });

    // ── New game (back to lobby) ───────────────────────────

    socket.on('new-game', (payload: { roomCode?: string }) => {
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

            store
                .saveLobby(roomCode ?? '', lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            log.info({ roomCode }, 'New game (back to lobby)');
            io.to(roomCode ?? '').emit('back-to-lobby', {
                players: lobby.players,
                settings: lobby.settings,
            });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in new-game');
        }
    });

    // ── Disconnect ─────────────────────────────────────────

    socket.on('disconnect', (reason: string) => {
        log.info({ socketId: socket.id, reason }, 'Client disconnected');
        rateLimiter.forgetSocket(socket.id);

        for (const code in lobbies) {
            const lobby = lobbies[code]!;

            lobby.spectators = lobby.spectators.filter((s) => s.id !== socket.id);

            const playerIdx = lobby.players.findIndex((p) => p.id === socket.id);
            if (playerIdx === -1) continue;

            const player = lobby.players[playerIdx]!;

            if (lobby.started) {
                const sessionToken = `${code}:${socket.id}:${Date.now()}`;
                const sessionData: DisconnectedSession = {
                    roomCode: code,
                    oldSocketId: socket.id,
                    playerName: player.name,
                    playerEmoji: player.emoji,
                    disconnectedAt: Date.now(),
                    gamePhase: getGamePhase(lobby),
                };
                disconnectedSessions.set(sessionToken, sessionData);

                // Persist session to Redis for cross-restart survival
                store.saveSession(sessionToken, sessionData)
                    .catch((err) => log.error({ err }, 'Failed to persist session'));

                io.to(code).emit('player-disconnected', {
                    name: player.name,
                    reconnectTimeout: RECONNECT_TIMEOUT,
                });

                log.info(
                    { roomCode: code, player: player.name },
                    'Player disconnected mid-game, session saved'
                );

                lobby.players[playerIdx]!.disconnected = true;
                lobby.players[playerIdx]!.disconnectedAt = Date.now();

                setTimeout(() => {
                    try {
                        const currentLobby = getLobby(code);
                        if (!currentLobby) return;

                        const p = currentLobby.players.find(
                            (x) => x.id === socket.id && x.disconnected
                        );
                        if (!p) return;

                        log.info(
                            { roomCode: code, player: p.name },
                            'Reconnect timeout expired, removing player'
                        );
                        currentLobby.players = currentLobby.players.filter(
                            (x) => x.id !== socket.id
                        );
                        delete currentLobby.emojis?.[socket.id];
                        delete currentLobby.stories?.[socket.id];

                        if (currentLobby.host === socket.id) {
                            if (currentLobby.players.length > 0) {
                                const newHost =
                                    currentLobby.players.find((x) => !x.disconnected) ??
                                    currentLobby.players[0]!;
                                currentLobby.host = newHost.id;
                                io.to(code).emit('host-changed', {
                                    newHost: newHost.name,
                                    newHostId: newHost.id,
                                });
                                log.info(
                                    { roomCode: code, newHost: newHost.name },
                                    'Host reassigned'
                                );
                            } else {
                                clearLobbyTimers(currentLobby);
                                delete lobbies[code];
                                io.to(code).emit('lobby-closed', {
                                    reason: 'All players left.',
                                });
                                return;
                            }
                        }

                        if (currentLobby.players.length === 0) {
                            clearLobbyTimers(currentLobby);
                            delete lobbies[code];
                            io.to(code).emit('lobby-closed', {
                                reason: 'All players left.',
                            });
                        } else {
                            store
                                .saveLobby(code, currentLobby)
                                .catch((err) => log.error({ err }, 'Redis save failed'));
                            io.to(code).emit('players-update', currentLobby.players);
                        }
                    } catch (err) {
                        log.error({ err }, 'Error in disconnect cleanup timeout');
                    }
                }, RECONNECT_TIMEOUT);
            } else {
                lobby.players = lobby.players.filter((p) => p.id !== socket.id);

                if (lobby.host === socket.id || lobby.players.length === 0) {
                    if (lobby.players.length > 0) {
                        lobby.host = lobby.players[0]!.id;
                        io.to(code).emit('host-changed', {
                            newHost: lobby.players[0]!.name,
                            newHostId: lobby.players[0]!.id,
                        });
                        io.to(code).emit('players-update', lobby.players);
                        store
                            .saveLobby(code, lobby)
                            .catch((err) => log.error({ err }, 'Redis save failed'));
                        log.info(
                            { roomCode: code, newHost: lobby.players[0]!.name },
                            'Host reassigned after disconnect'
                        );
                    } else {
                        clearLobbyTimers(lobby);
                        delete lobbies[code];
                        io.to(code).emit('lobby-closed', {
                            reason: 'All players left.',
                        });
                    }
                } else {
                    store
                        .saveLobby(code, lobby)
                        .catch((err) => log.error({ err }, 'Redis save failed'));
                    io.to(code).emit('players-update', lobby.players);
                }
            }
        }
    });
});

// ── Graceful Shutdown ───────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
    log.info({ signal }, 'Shutdown signal received, closing gracefully…');

    io.emit('server-shutdown', {
        message: 'Server startet neu. Bitte in Kürze erneut verbinden.',
    });

    // Save all lobbies to Redis before closing
    const savePromises = Object.entries(lobbies).map(([code, lobby]) =>
        store.saveLobby(code, lobby)
            .catch((err) => log.error({ err, code }, 'Failed to save lobby on shutdown'))
    );
    await Promise.allSettled(savePromises);
    log.info({ count: savePromises.length }, 'Lobbies saved to store before shutdown');

    io.close(() => {
        log.info('Socket.io closed');
    });

    server.close(() => {
        log.info('HTTP server closed');

        for (const code in lobbies) {
            clearLobbyTimers(lobbies[code]!);
        }

        log.info('Shutdown complete');
        process.exit(0);
    });

    setTimeout(() => {
        log.error('Forced exit after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
    log.fatal({ err }, 'Uncaught exception');
    sentry.captureException(err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
    log.error({ reason }, 'Unhandled rejection');
    sentry.captureException(reason);
});

// ── Start server ────────────────────────────────────────────

async function loadLobbiesFromStore(): Promise<void> {
    const codes = await store.getAllLobbyCodes();
    let loaded = 0;
    for (const code of codes) {
        const lobby = await store.getLobby(code);
        if (lobby && lobby.players.length > 0) {
            // Restore non-serializable fields
            lobby.writingTimeout = null;
            lobbies[code] = lobby;
            loaded++;
        }
    }
    if (loaded > 0) log.info({ loaded }, 'Restored lobbies from store');
}

loadLobbiesFromStore()
    .catch((err) => log.warn({ err }, 'Could not restore lobbies from store'))
    .finally(() => {
        server.listen(PORT, () => {
            log.info(
                { port: PORT, env: NODE_ENV, maxLobbies: MAX_LOBBIES },
                'IconTale server running'
            );
        });
    });
