// ═══════════════════════════════════════════════════════════════
//  Game Flow — Round lifecycle, guessing, results
// ═══════════════════════════════════════════════════════════════

import type { Server } from 'socket.io';
import type { Lobby } from './types';
import { processRoundResults, calculateTeamScores } from './scoring';
import { recordEvent } from './replay';
import log from './logger';

// ── Dependencies injected by the server ─────────────────────

export interface GameFlowDeps {
    getLobby: (code: string) => Lobby | null;
    io: Server;
    saveLobby: (code: string, lobby: Lobby) => Promise<void>;
    clearLobbyTimers: (lobby: Lobby) => void;
    getRandomEmojis: (count: number, packs: string[]) => string[];
}

// ── startRound ──────────────────────────────────────────────

export function startRound(roomCode: string, deps: GameFlowDeps): void {
    const lobby = deps.getLobby(roomCode);
    if (!lobby) return;

    lobby.currentRound++;
    lobby.stories = {};
    lobby.guesses = {};
    const { settings } = lobby;

    for (const p of lobby.players) {
        lobby.emojis[p.id] = deps.getRandomEmojis(settings.emojiCount, settings.emojiPacks);
    }

    recordEvent(lobby, 'round-start', { round: lobby.currentRound });

    const writingStartTime = Date.now();
    lobby.writingStartTime = writingStartTime;

    deps.clearLobbyTimers(lobby);
    lobby.writingTimeout = setTimeout(() => {
        if (
            lobby &&
            lobby.started &&
            Object.keys(lobby.stories).length < lobby.players.length
        ) {
            log.debug({ roomCode }, 'Writing timer expired, moving to guessing phase');
            startGuessingPhase(roomCode, deps);
        }
    }, settings.timerDuration * 1000);

    for (const p of lobby.players) {
        deps.io.to(p.id).emit('round-started', {
            emojis: lobby.emojis[p.id],
            writingStartTime,
            currentRound: lobby.currentRound,
            totalRounds: settings.rounds,
            settings,
        });
    }

    for (const s of lobby.spectators) {
        deps.io.to(s.id).emit('spectator-round-started', {
            currentRound: lobby.currentRound,
            totalRounds: settings.rounds,
            settings,
        });
    }

    deps.io.to(roomCode).emit('game-started', {
        currentRound: lobby.currentRound,
        totalRounds: settings.rounds,
        gameMode: settings.gameMode,
    });

    deps.saveLobby(roomCode, lobby).catch((err) => log.error({ err }, 'Redis save failed'));

    log.info(
        { roomCode, round: lobby.currentRound, totalRounds: settings.rounds },
        'Round started'
    );
}

// ── startGuessingPhase ──────────────────────────────────────

export function startGuessingPhase(roomCode: string, deps: GameFlowDeps): void {
    const lobby = deps.getLobby(roomCode);
    if (!lobby) return;

    const activePlayers = lobby.players.filter((p) => !p.disconnected);
    const playerIds = activePlayers.map((p) => p.id);

    if (playerIds.length < 2) {
        log.warn({ roomCode }, 'Not enough active players for guessing phase');
        deps.io.to(roomCode).emit('lobby-error', {
            message: 'Nicht genug aktive Spieler.',
        });
        return;
    }

    const assignments: Record<string, string> = {};
    let deranged = false;
    let attempts = 0;
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
                assignments[playerIds[i]!] = shuffled[i]!;
            }
        }
    }

    lobby.assignments = assignments;
    const { settings } = lobby;

    for (const id of playerIds) {
        const authorId = assignments[id]!;
        const story = lobby.stories[authorId] || '';
        const correctEmojis = lobby.emojis[authorId];

        let emojiOptions: string[][] | null = null;
        if (settings.gameMode !== 'blind') {
            const combos = [correctEmojis];
            while (combos.length < 6) {
                const combo = deps.getRandomEmojis(settings.emojiCount, settings.emojiPacks);
                if (!combos.some((arr) => arr.join() === combo.join())) combos.push(combo);
            }
            combos.sort(() => 0.5 - Math.random());
            emojiOptions = combos;
        }

        deps.io.to(id).emit('guess-phase', {
            story,
            emojiOptions,
            correctEmojis,
            players: lobby.players
                .filter((p) => p.id !== id && !p.disconnected)
                .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
            authorId,
            gameMode: settings.gameMode,
        });
    }

    for (const s of lobby.spectators) {
        deps.io.to(s.id).emit('spectator-guess-phase');
    }

    deps.saveLobby(roomCode, lobby).catch((err) => log.error({ err }, 'Redis save failed'));

    log.debug({ roomCode }, 'Guessing phase started');
}

// ── processResults ──────────────────────────────────────────

export function processGameResults(roomCode: string, deps: GameFlowDeps): void {
    const lobby = deps.getLobby(roomCode);
    if (!lobby) return;

    const { results, leaderboardDetails, teamScores } = processRoundResults(lobby);

    recordEvent(lobby, 'results', { results });

    lobby.resultsState = { currentChatIdx: 0, currentMsgStep: 0 };
    lobby.leaderboardDetails = leaderboardDetails;

    deps.io.to(roomCode).emit('results-phase', {
        results,
        leaderboard: lobby.leaderboard,
        players: lobby.players.map((p) => ({
            id: p.id,
            name: p.name,
            emoji: p.emoji,
        })),
        resultsState: lobby.resultsState,
        teams: lobby.teams,
        teamScores,
        currentRound: lobby.currentRound,
        totalRounds: lobby.settings.rounds,
        gameMode: lobby.settings.gameMode,
    });

    deps.saveLobby(roomCode, lobby).catch((err) => log.error({ err }, 'Redis save failed'));

    log.info({ roomCode, round: lobby.currentRound }, 'Results processed');
}

// ── getGamePhase ────────────────────────────────────────────

export function getGamePhase(lobby: Lobby): string {
    if (!lobby.started) return 'lobby';
    if (lobby.resultsState) return 'results';
    if (Object.keys(lobby.guesses || {}).length > 0) return 'guessing';
    return 'writing';
}

// ── replaceSocketIdInLobby ──────────────────────────────────

export function replaceSocketIdInLobby(lobby: Lobby, oldId: string, newId: string): void {
    const maps = [
        'emojis',
        'stories',
        'guesses',
        'leaderboard',
        'totalScores',
    ] as const;
    for (const key of maps) {
        const map = lobby[key] as Record<string, unknown> | undefined;
        if (map && map[oldId] !== undefined) {
            map[newId] = map[oldId];
            delete map[oldId];
        }
    }

    if (lobby.teams) {
        for (const team of ['A', 'B'] as const) {
            const idx = lobby.teams[team].indexOf(oldId);
            if (idx !== -1) lobby.teams[team][idx] = newId;
        }
    }

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
