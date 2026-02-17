// ═══════════════════════════════════════════════════════════════
//  Store — Persistent lobby & session storage
//  Uses Redis when REDIS_URL is set, otherwise falls back to
//  in-memory maps (for local development).
// ═══════════════════════════════════════════════════════════════

import log from './logger';
import type { Lobby, DisconnectedSession, Replay, PlayerStats } from './types';

const REDIS_URL = process.env.REDIS_URL;
const USE_REDIS = !!REDIS_URL;

// ── TTLs (milliseconds for in-memory, seconds for Redis) ────

const LOBBY_TTL_S = 30 * 60;           // 30 min
const SESSION_TTL_S = 2 * 60;          // 2 min
const REPLAY_TTL_S = 24 * 60 * 60;     // 24 hours
const STATS_TTL_S = 30 * 24 * 60 * 60; // 30 days

// ══════════════════════════════════════════════════════════════
//  In-Memory Fallback Store
// ══════════════════════════════════════════════════════════════

interface MemEntry<T> {
    value: T;
    expiresAt: number;
}

class MemoryStore {
    private data = new Map<string, MemEntry<string>>();
    private sets = new Map<string, Set<string>>();

    get(key: string): string | null {
        const entry = this.data.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.data.delete(key);
            return null;
        }
        return entry.value;
    }

    setex(key: string, ttlSeconds: number, value: string): void {
        this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }

    del(key: string): void {
        this.data.delete(key);
    }

    expire(key: string, ttlSeconds: number): void {
        const entry = this.data.get(key);
        if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }

    exists(key: string): boolean {
        const entry = this.data.get(key);
        if (!entry) return false;
        if (Date.now() > entry.expiresAt) {
            this.data.delete(key);
            return false;
        }
        return true;
    }

    sadd(key: string, member: string): number {
        if (!this.sets.has(key)) this.sets.set(key, new Set());
        const s = this.sets.get(key)!;
        if (s.has(member)) return 0;
        s.add(member);
        return 1;
    }

    srem(key: string, member: string): void {
        this.sets.get(key)?.delete(member);
    }

    smembers(key: string): string[] {
        return Array.from(this.sets.get(key) || []);
    }

    scard(key: string): number {
        return this.sets.get(key)?.size || 0;
    }

    pipeline() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const ops: Array<() => void> = [];
        const builder = {
            setex(key: string, ttl: number, val: string) { ops.push(() => self.setex(key, ttl, val)); return builder; },
            sadd(key: string, val: string) { ops.push(() => self.sadd(key, val)); return builder; },
            del(key: string) { ops.push(() => self.del(key)); return builder; },
            srem(key: string, val: string) { ops.push(() => self.srem(key, val)); return builder; },
            async exec() { ops.forEach((fn) => fn()); return []; },
        };
        return builder;
    }

    async quit(): Promise<void> {
        this.data.clear();
        this.sets.clear();
    }
}

// ══════════════════════════════════════════════════════════════
//  Initialize Store (Redis or Memory)
// ══════════════════════════════════════════════════════════════

// We define a common interface-like approach using duck typing.
// Both Redis and MemoryStore share the methods we use.

let memStore: MemoryStore | null = null;

// eslint-disable-next-line @typescript-eslint/no-require-imports
type RedisType = import('ioredis').default;
let redisInstance: RedisType | null = null;

function initStore(): void {
    if (USE_REDIS) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Redis = require('ioredis') as new (url: string) => RedisType;
        redisInstance = new Redis(REDIS_URL!);
        redisInstance.on('connect', () => log.info('Redis connected'));
        redisInstance.on('error', (err: Error) => log.error({ err }, 'Redis error'));
        log.info('Using Redis store');
    } else {
        memStore = new MemoryStore();
        log.warn('REDIS_URL not set — using in-memory store (data will be lost on restart)');
    }
}

initStore();

// Helper to get the active backend
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function store(): any {
    return redisInstance || memStore!;
}

// ── Key prefixes ────────────────────────────────────────────

const KEY = {
    lobby: (code: string) => `lobby:${code}`,
    session: (token: string) => `session:${token}`,
    replay: (id: string) => `replay:${id}`,
    stats: (playerId: string) => `stats:${playerId}`,
    achievements: (playerId: string) => `achievements:${playerId}`,
    lobbyIndex: 'lobby:index',
};

// ── Serialization helpers ───────────────────────────────────

function serializeLobby(lobby: Lobby): string {
    const { writingTimeout, ...rest } = lobby;
    return JSON.stringify(rest);
}

function deserializeLobby(raw: string): Lobby {
    const parsed = JSON.parse(raw);
    parsed.writingTimeout = null;
    return parsed as Lobby;
}

// ── Lobby CRUD ──────────────────────────────────────────────

export async function saveLobby(code: string, lobby: Lobby): Promise<void> {
    const s = store();
    const pipeline = s.pipeline();
    pipeline.setex(KEY.lobby(code), LOBBY_TTL_S, serializeLobby(lobby));
    pipeline.sadd(KEY.lobbyIndex, code);
    await pipeline.exec();
}

export async function getLobby(code: string): Promise<Lobby | null> {
    const raw = await store().get(KEY.lobby(code));
    if (!raw) return null;
    return deserializeLobby(raw);
}

export async function deleteLobby(code: string): Promise<void> {
    const s = store();
    const pipeline = s.pipeline();
    pipeline.del(KEY.lobby(code));
    pipeline.srem(KEY.lobbyIndex, code);
    await pipeline.exec();
}

export async function getAllLobbyCodes(): Promise<string[]> {
    return store().smembers(KEY.lobbyIndex);
}

export async function getLobbyCount(): Promise<number> {
    return store().scard(KEY.lobbyIndex);
}

export async function refreshLobbyTTL(code: string): Promise<void> {
    await store().expire(KEY.lobby(code), LOBBY_TTL_S);
}

// ── Session CRUD ────────────────────────────────────────────

export async function saveSession(token: string, session: DisconnectedSession): Promise<void> {
    await store().setex(KEY.session(token), SESSION_TTL_S, JSON.stringify(session));
}

export async function getSession(token: string): Promise<DisconnectedSession | null> {
    const raw = await store().get(KEY.session(token));
    if (!raw) return null;
    return JSON.parse(raw) as DisconnectedSession;
}

export async function deleteSession(token: string): Promise<void> {
    await store().del(KEY.session(token));
}

// ── Replay CRUD ─────────────────────────────────────────────

export async function saveReplay(replay: Replay): Promise<void> {
    await store().setex(KEY.replay(replay.id), REPLAY_TTL_S, JSON.stringify(replay));
}

export async function getReplay(id: string): Promise<Replay | null> {
    const raw = await store().get(KEY.replay(id));
    if (!raw) return null;
    return JSON.parse(raw) as Replay;
}

// ── Player Stats (for achievements) ─────────────────────────

export async function getPlayerStats(playerId: string): Promise<PlayerStats> {
    const raw = await store().get(KEY.stats(playerId));
    if (!raw) {
        return {
            gamesPlayed: 0,
            gamesWon: 0,
            modesPlayed: new Set(),
            roundsWonConsecutive: 0,
            timesNeverGuessed: 0,
            correctAuthorGuesses: 0,
            spectatedGames: 0,
            reconnectedAndWon: false,
            bestOf5Completed: false,
        };
    }
    const parsed = JSON.parse(raw);
    parsed.modesPlayed = new Set(parsed.modesPlayed || []);
    return parsed as PlayerStats;
}

export async function savePlayerStats(playerId: string, stats: PlayerStats): Promise<void> {
    const serializable = {
        ...stats,
        modesPlayed: Array.from(stats.modesPlayed),
    };
    await store().setex(KEY.stats(playerId), STATS_TTL_S, JSON.stringify(serializable));
}

// ── Achievement Storage ─────────────────────────────────────

export async function getUnlockedAchievements(playerId: string): Promise<string[]> {
    return store().smembers(KEY.achievements(playerId));
}

export async function unlockAchievement(playerId: string, achievementId: string): Promise<boolean> {
    const added = await store().sadd(KEY.achievements(playerId), achievementId);
    await store().expire(KEY.achievements(playerId), STATS_TTL_S);
    return added === 1;
}

// ── Cleanup ─────────────────────────────────────────────────

export async function cleanupExpiredLobbies(): Promise<number> {
    const codes = await getAllLobbyCodes();
    let cleaned = 0;
    for (const code of codes) {
        const exists = await store().exists(KEY.lobby(code));
        if (!exists) {
            await store().srem(KEY.lobbyIndex, code);
            cleaned++;
        }
    }
    return cleaned;
}

// ── Connection ──────────────────────────────────────────────

export async function disconnect(): Promise<void> {
    if (redisInstance) {
        await redisInstance.quit();
    } else if (memStore) {
        await memStore.quit();
    }
}

export { memStore as redis, redisInstance };
