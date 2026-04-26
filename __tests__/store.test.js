import { describe, it, expect, vi } from 'vitest';

// Mock logger to prevent side effects
vi.mock('../lib/logger.ts', () => ({
    default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}));

// Do NOT set REDIS_URL — this tests the in-memory fallback store
delete process.env.REDIS_URL;

const {
    saveLobby,
    getLobby,
    deleteLobby,
    getAllLobbyCodes,
    getLobbyCount,
    refreshLobbyTTL,
    saveSession,
    getSession,
    deleteSession,
    saveReplay,
    getReplay,
    getPlayerStats,
    savePlayerStats,
    getUnlockedAchievements,
    unlockAchievement,
    cleanupExpiredLobbies,
    disconnect,
    redis: memStore,
} = await import('../lib/store.ts');

// Helper to create a minimal lobby-like object
function makeLobby(overrides = {}) {
    return {
        host: 's1',
        players: [{ id: 's1', name: 'Alice', emoji: '😀' }],
        spectators: [],
        settings: { gameMode: 'classic', timerDuration: 180, wordLimit: 500, emojiCount: 3, rounds: 1, emojiPacks: ['all'] },
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
        ...overrides,
    };
}

describe('store (in-memory fallback)', () => {
    it('memStore is defined', () => {
        expect(memStore).toBeDefined();
    });

    describe('saveLobby / getLobby', () => {
        it('saves and retrieves a lobby', async () => {
            const lobby = makeLobby();
            await saveLobby('TEST01', lobby);
            const retrieved = await getLobby('TEST01');
            expect(retrieved).not.toBeNull();
            expect(retrieved.host).toBe('s1');
            expect(retrieved.players[0].name).toBe('Alice');
        });

        it('returns null for non-existent lobby', async () => {
            const result = await getLobby('NOEXIST');
            expect(result).toBeNull();
        });

        it('writingTimeout is null after deserialization', async () => {
            const lobby = makeLobby({ writingTimeout: setTimeout(() => {}, 1000) });
            await saveLobby('TEST02', lobby);
            const retrieved = await getLobby('TEST02');
            expect(retrieved.writingTimeout).toBeNull();
            clearTimeout(lobby.writingTimeout);
        });
    });

    describe('deleteLobby', () => {
        it('removes a lobby', async () => {
            const lobby = makeLobby();
            await saveLobby('DEL001', lobby);
            expect(await getLobby('DEL001')).not.toBeNull();
            await deleteLobby('DEL001');
            expect(await getLobby('DEL001')).toBeNull();
        });
    });

    describe('getAllLobbyCodes / getLobbyCount', () => {
        it('tracks lobby codes', async () => {
            await saveLobby('IDX001', makeLobby());
            await saveLobby('IDX002', makeLobby());
            const codes = await getAllLobbyCodes();
            expect(codes).toContain('IDX001');
            expect(codes).toContain('IDX002');
            const count = await getLobbyCount();
            expect(count).toBeGreaterThanOrEqual(2);
        });
    });

    describe('refreshLobbyTTL', () => {
        it('does not throw', async () => {
            await saveLobby('TTL001', makeLobby());
            await expect(refreshLobbyTTL('TTL001')).resolves.not.toThrow();
        });
    });

    describe('saveSession / getSession / deleteSession', () => {
        it('saves and retrieves a session', async () => {
            const session = {
                roomCode: 'ABC123',
                oldSocketId: 's1',
                playerName: 'Alice',
                playerEmoji: '😀',
                disconnectedAt: Date.now(),
                gamePhase: 'writing',
            };
            await saveSession('token123', session);
            const retrieved = await getSession('token123');
            expect(retrieved).not.toBeNull();
            expect(retrieved.roomCode).toBe('ABC123');
            expect(retrieved.playerName).toBe('Alice');
        });

        it('returns null for non-existent session', async () => {
            expect(await getSession('nonexistent')).toBeNull();
        });

        it('deletes a session', async () => {
            await saveSession('deltoken', { roomCode: 'X', oldSocketId: 's', playerName: 'A', playerEmoji: '😀', disconnectedAt: 0, gamePhase: 'lobby' });
            await deleteSession('deltoken');
            expect(await getSession('deltoken')).toBeNull();
        });
    });

    describe('saveReplay / getReplay', () => {
        it('saves and retrieves a replay', async () => {
            const replay = {
                id: 'r123',
                roomCode: 'ABC123',
                players: [{ id: 's1', name: 'Alice', emoji: '😀' }],
                settings: { gameMode: 'classic', timerDuration: 180, wordLimit: 500, emojiCount: 3, rounds: 1, emojiPacks: ['all'] },
                events: [{ timestamp: Date.now(), type: 'round-start', data: { round: 1 } }],
                createdAt: Date.now(),
            };
            await saveReplay(replay);
            const retrieved = await getReplay('r123');
            expect(retrieved).not.toBeNull();
            expect(retrieved.roomCode).toBe('ABC123');
            expect(retrieved.events).toHaveLength(1);
        });

        it('returns null for non-existent replay', async () => {
            expect(await getReplay('noexist')).toBeNull();
        });
    });

    describe('getPlayerStats / savePlayerStats', () => {
        it('returns default stats when none exist', async () => {
            const stats = await getPlayerStats('newplayer');
            expect(stats.gamesPlayed).toBe(0);
            expect(stats.gamesWon).toBe(0);
            expect(stats.modesPlayed).toBeInstanceOf(Set);
            expect(stats.modesPlayed.size).toBe(0);
        });

        it('saves and retrieves stats with Set serialization', async () => {
            const stats = {
                gamesPlayed: 5,
                gamesWon: 2,
                modesPlayed: new Set(['classic', 'speed']),
                roundsWonConsecutive: 3,
                timesNeverGuessed: 1,
                correctAuthorGuesses: 4,
                spectatedGames: 0,
                reconnectedAndWon: false,
                bestOf5Completed: true,
            };
            await savePlayerStats('player1', stats);
            const retrieved = await getPlayerStats('player1');
            expect(retrieved.gamesPlayed).toBe(5);
            expect(retrieved.modesPlayed).toBeInstanceOf(Set);
            expect(retrieved.modesPlayed.has('classic')).toBe(true);
            expect(retrieved.modesPlayed.has('speed')).toBe(true);
            expect(retrieved.bestOf5Completed).toBe(true);
        });
    });

    describe('unlockAchievement / getUnlockedAchievements', () => {
        it('returns true for new achievement', async () => {
            const result = await unlockAchievement('achplayer', 'first-game');
            expect(result).toBe(true);
        });

        it('returns false for already unlocked achievement', async () => {
            await unlockAchievement('achplayer2', 'detective');
            const result = await unlockAchievement('achplayer2', 'detective');
            expect(result).toBe(false);
        });

        it('lists unlocked achievements', async () => {
            await unlockAchievement('achplayer3', 'first-game');
            await unlockAchievement('achplayer3', 'detective');
            const unlocked = await getUnlockedAchievements('achplayer3');
            expect(unlocked).toContain('first-game');
            expect(unlocked).toContain('detective');
            expect(unlocked).toHaveLength(2);
        });
    });

    describe('cleanupExpiredLobbies', () => {
        it('returns 0 when no stale entries', async () => {
            await saveLobby('CLEAN1', makeLobby());
            const cleaned = await cleanupExpiredLobbies();
            expect(cleaned).toBe(0);
        });
    });

    describe('disconnect', () => {
        it('does not throw', async () => {
            await expect(disconnect()).resolves.not.toThrow();
        });
    });
});
