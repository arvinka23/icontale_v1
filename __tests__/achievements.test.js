import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/store.ts', () => ({
    getUnlockedAchievements: vi.fn().mockResolvedValue([]),
    unlockAchievement: vi.fn().mockResolvedValue(true),
    getPlayerStats: vi.fn(),
    savePlayerStats: vi.fn(),
}));

vi.mock('../lib/logger.ts', () => ({
    default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}));

const {
    ACHIEVEMENTS,
    checkAchievements,
    updateStatsAndCheck,
    getAchievementById,
} = await import('../lib/achievements.ts');

const store = await import('../lib/store.ts');

describe('achievements', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        store.getUnlockedAchievements.mockResolvedValue([]);
        store.unlockAchievement.mockResolvedValue(true);
    });

    describe('ACHIEVEMENTS', () => {
        it('has 15 items', () => {
            expect(ACHIEVEMENTS).toHaveLength(15);
        });

        it('each achievement has id, name, description, icon', () => {
            for (const a of ACHIEVEMENTS) {
                expect(a).toHaveProperty('id');
                expect(a).toHaveProperty('name');
                expect(a).toHaveProperty('description');
                expect(a).toHaveProperty('icon');
                expect(typeof a.id).toBe('string');
                expect(typeof a.name).toBe('string');
                expect(typeof a.description).toBe('string');
                expect(typeof a.icon).toBe('string');
            }
        });
    });

    describe('checkAchievements', () => {
        it('with first-game stats returns the achievement', async () => {
            const stats = {
                gamesPlayed: 1,
                gamesWon: 0,
                modesPlayed: new Set(['classic']),
                roundsWonConsecutive: 0,
                timesNeverGuessed: 0,
                correctAuthorGuesses: 0,
                spectatedGames: 0,
                reconnectedAndWon: false,
                bestOf5Completed: false,
            };

            const result = await checkAchievements('player1', stats);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('first-game');
            expect(result[0].name).toBe('Erster Schritt');
        });

        it('skips already unlocked achievements', async () => {
            store.getUnlockedAchievements.mockResolvedValue(['first-game']);
            const stats = {
                gamesPlayed: 1,
                gamesWon: 0,
                modesPlayed: new Set(['classic']),
                roundsWonConsecutive: 0,
                timesNeverGuessed: 0,
                correctAuthorGuesses: 0,
                spectatedGames: 0,
                reconnectedAndWon: false,
                bestOf5Completed: false,
            };

            const result = await checkAchievements('player1', stats);
            expect(result).toHaveLength(0);
        });
    });

    describe('updateStatsAndCheck', () => {
        it('calls getPlayerStats, updater, savePlayerStats, and checkAchievements', async () => {
            const baseStats = {
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
            store.getPlayerStats.mockResolvedValue({ ...baseStats, modesPlayed: new Set() });

            const updater = vi.fn((stats) => {
                stats.gamesPlayed = 1;
            });

            const result = await updateStatsAndCheck('player1', updater);

            expect(store.getPlayerStats).toHaveBeenCalledWith('player1');
            expect(updater).toHaveBeenCalled();
            expect(store.savePlayerStats).toHaveBeenCalledWith('player1', expect.any(Object));
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('first-game');
        });
    });

    describe('getAchievementById', () => {
        it('returns correct achievement for valid id', () => {
            const a = getAchievementById('first-game');
            expect(a).toBeDefined();
            expect(a.id).toBe('first-game');
            expect(a.name).toBe('Erster Schritt');
        });

        it('returns undefined for invalid id', () => {
            const a = getAchievementById('nonexistent');
            expect(a).toBeUndefined();
        });
    });
});
