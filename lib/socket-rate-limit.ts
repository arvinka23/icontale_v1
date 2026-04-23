// ═══════════════════════════════════════════════════════════════
//  Per-event Socket.io rate limiting
//
//  The previous global limiter (60 events / 10 s per socket) blocked
//  floods but treated every event equally. A malicious client could
//  still spam expensive events like 'submit-story' or 'update-
//  settings' up to 6 times per second — well within the global cap —
//  and inflate lobby state accordingly.
//
//  This module keeps the global cap as a last-resort backstop and
//  adds per-event quotas so each action can be tuned to realistic
//  human usage patterns. All state is in-memory per node; the cost
//  of horizontal scaling is covered in the improvement plan (moving
//  the buckets to Redis alongside the lobby store).
// ═══════════════════════════════════════════════════════════════

import log from './logger';

export interface Bucket {
    start: number;
    count: number;
}

export interface EventQuota {
    /** Window length in milliseconds. */
    windowMs: number;
    /** Maximum allowed events per window. */
    max: number;
}

/**
 * Per-event quotas. Tuned for the typical human pace of play:
 *   - Long-lived actions (start-game, submit-story) get very small
 *     caps; they only fire once per round per player.
 *   - Status probes (reconnect-session) get a modest cap so repeat
 *     attempts after a flaky network are allowed.
 *   - Interactive tweaks (update-settings) allow a steady stream of
 *     clicks but not runaway scripted spam.
 */
export const EVENT_QUOTAS: Record<string, EventQuota> = {
    // Lobby lifecycle — heavy server work, should be rare.
    'create-lobby':       { windowMs: 60_000, max: 5 },
    'join-lobby':         { windowMs: 60_000, max: 15 },
    'join-spectator':     { windowMs: 60_000, max: 15 },
    'start-game':         { windowMs: 10_000, max: 3 },
    'new-game':           { windowMs: 10_000, max: 3 },
    'next-round':         { windowMs: 10_000, max: 6 },

    // Gameplay submissions — once (or a few edits) per round.
    'submit-story':       { windowMs: 30_000, max: 4 },
    'submit-guess':       { windowMs: 30_000, max: 6 },
    'results-continue':   { windowMs: 10_000, max: 8 },
    'leaderboard-phase':  { windowMs: 10_000, max: 4 },

    // Settings / reconnect — settle-debounce on the client, but be
    // lenient so legitimate sliders don't trip.
    'update-settings':    { windowMs: 10_000, max: 20 },
    'reconnect-session':  { windowMs: 60_000, max: 10 },
};

/** Fallback applied when no specific quota matches. */
export const DEFAULT_QUOTA: EventQuota = { windowMs: 10_000, max: 60 };

/** Global per-socket backstop across all events. */
export const GLOBAL_QUOTA: EventQuota = { windowMs: 10_000, max: 120 };

const globalBuckets = new Map<string, Bucket>();
const eventBuckets = new Map<string, Bucket>();

function check(bucket: Map<string, Bucket>, key: string, quota: EventQuota): boolean {
    const now = Date.now();
    let entry = bucket.get(key);
    if (!entry || now - entry.start > quota.windowMs) {
        entry = { start: now, count: 0 };
        bucket.set(key, entry);
    }
    entry.count++;
    return entry.count <= quota.max;
}

/**
 * Check whether `event` from `socketId` fits inside both the global
 * per-socket quota and the per-event quota. Logs at warn level when
 * either cap is exceeded.
 */
export function allowEvent(socketId: string, event: string): boolean {
    if (!check(globalBuckets, socketId, GLOBAL_QUOTA)) {
        log.warn({ socketId, event, scope: 'global' }, 'Socket rate limited');
        return false;
    }

    const quota = EVENT_QUOTAS[event] ?? DEFAULT_QUOTA;
    const key = `${socketId}:${event}`;
    if (!check(eventBuckets, key, quota)) {
        log.warn({ socketId, event, scope: 'event', quota }, 'Socket rate limited');
        return false;
    }

    return true;
}

/** Remove every bucket belonging to this socket (on disconnect). */
export function forgetSocket(socketId: string): void {
    globalBuckets.delete(socketId);
    const prefix = `${socketId}:`;
    for (const k of eventBuckets.keys()) {
        if (k.startsWith(prefix)) eventBuckets.delete(k);
    }
}

/** Periodic sweep of stale buckets so the maps don't grow unbounded. */
export function sweep(now: number = Date.now()): number {
    let removed = 0;
    const GRACE = 2;

    for (const [id, entry] of globalBuckets) {
        if (now - entry.start > GLOBAL_QUOTA.windowMs * GRACE) {
            globalBuckets.delete(id);
            removed++;
        }
    }

    for (const [key, entry] of eventBuckets) {
        const event = key.slice(key.indexOf(':') + 1);
        const quota = EVENT_QUOTAS[event] ?? DEFAULT_QUOTA;
        if (now - entry.start > quota.windowMs * GRACE) {
            eventBuckets.delete(key);
            removed++;
        }
    }

    return removed;
}

/** Wipe all state. Only used in tests. */
export function __reset(): void {
    globalBuckets.clear();
    eventBuckets.clear();
}
