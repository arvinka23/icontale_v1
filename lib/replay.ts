// ═══════════════════════════════════════════════════════════════
//  Replay System — Record and retrieve game replays
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto';
import type { Lobby, Replay, ReplayEvent, ReplayEventType, Player, GameSettings } from './types';
import * as store from './store';
import log from './logger';

/**
 * Create a new replay event and append it to the lobby's replay log.
 */
export function recordEvent(lobby: Lobby, type: ReplayEventType, data: unknown): void {
    if (!lobby.replayLog) lobby.replayLog = [];

    const event: ReplayEvent = {
        timestamp: Date.now(),
        type,
        data,
    };

    lobby.replayLog.push(event);
}

/**
 * Finalize a game's replay and save it to Redis.
 * Returns the replay ID.
 */
export async function finalizeReplay(lobby: Lobby, roomCode: string): Promise<string> {
    const replayId = crypto.randomBytes(8).toString('hex');

    const replay: Replay = {
        id: replayId,
        roomCode,
        players: lobby.players.map((p: Player) => ({
            id: p.id,
            name: p.name,
            emoji: p.emoji,
        })),
        settings: { ...lobby.settings },
        events: lobby.replayLog || [],
        createdAt: Date.now(),
    };

    await store.saveReplay(replay);
    log.info({ replayId, roomCode, events: replay.events.length }, 'Replay saved');

    return replayId;
}

/**
 * Retrieve a replay by ID.
 */
export async function getReplay(id: string): Promise<Replay | null> {
    return store.getReplay(id);
}
