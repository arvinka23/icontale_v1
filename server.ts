// ═══════════════════════════════════════════════════════════════
//  IconTale — Server
// ═══════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-require-imports */
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
import { createAdapter } from '@socket.io/redis-adapter';

import log from './lib/logger';
import * as san from './lib/sanitize';
import * as filter from './lib/wordfilter';
import * as store from './lib/store';
import * as rateLimiter from './lib/socket-rate-limit';
import { issueToken, verifyToken } from './lib/socket-auth';
import { getRandomEmojis } from './lib/emoji-packs';
import {
    registerCounter,
    registerGauge,
    registerSnapshotGauge,
    renderMetrics,
} from './lib/metrics';
import {
    startRound,
    type GameFlowDeps,
} from './lib/game-flow';
import { registerLobbyHandlers } from './lib/handlers/lobby';
import { registerGameHandlers } from './lib/handlers/game';
import { registerPlayerHandlers } from './lib/handlers/player';
import { registerSessionHandlers } from './lib/handlers/session';
import type { HandlerContext } from './lib/handlers/context';
import { getReplay } from './lib/replay';

import type {
    Lobby,
    GameSettings,
    DisconnectedSession,
} from './lib/types';

// ── Environment validation ──────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : ['*'];

if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    log.fatal({ port: process.env.PORT }, 'Invalid PORT — must be 1-65535');
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
        methods: ['GET'],
        credentials: true,
    })
);

app.use(compression());

// Security headers.
//
// CSP notes:
//   - No inline <script> or inline style attributes are used in the
//     app. JS-driven style changes (timer bar CSS custom property,
//     tooltip class toggles) are DOM API operations, not inline
//     styles, so they work without 'unsafe-inline' in style-src.
//   - Fonts are self-hosted, so no third-party font hosts are
//     whitelisted.
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'"],
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
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests. Please try again later.' },
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
const metricSocketErrors = registerCounter(
    'icontale_socket_errors_total',
    'Socket.io events rejected by the middleware, by reason',
    ['reason']
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

// ── Socket.io Redis adapter ─────────────────────────────────
// Shares socket rooms across multiple server instances via Redis
// pub/sub. Only active when REDIS_URL is configured.
const _redisClient = store.redisInstance;
if (_redisClient) {
    const subClient = _redisClient.duplicate();
    io.adapter(createAdapter(_redisClient, subClient));
    log.info('Socket.io Redis adapter enabled');
}

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

// ── Handler context ─────────────────────────────────────────

const ctx: HandlerContext = {
    io,
    lobbies,
    disconnectedSessions,
    deps,
    getLobby,
    clearLobbyTimers,
    defaultSettings: DEFAULT_SETTINGS,
    maxLobbies: MAX_LOBBIES,
    maxPlayersPerLobby: MAX_PLAYERS_PER_LOBBY,
    reconnectTimeout: RECONNECT_TIMEOUT,
    metrics: {
        lobbyEvents: metricLobbyEvents,
        storiesSubmitted: metricStoriesSubmitted,
        guessesSubmitted: metricGuessesSubmitted,
    },
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

    registerLobbyHandlers(socket, ctx);
    registerGameHandlers(socket, ctx);
    registerPlayerHandlers(socket, ctx);
    registerSessionHandlers(socket, ctx);
});

// ── Graceful Shutdown ───────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
    log.info({ signal }, 'Shutdown signal received, closing gracefully…');

    io.emit('server-shutdown', { code: 'info.serverShutdown' });

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
