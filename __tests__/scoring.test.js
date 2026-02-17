import { describe, it, expect } from 'vitest';

const { processRoundResults, calculateTeamScores, POINTS } = await import('../lib/scoring.ts');

describe('scoring', () => {

    function makeLobby(overrides = {}) {
        return {
            players: [
                { id: 'p1', name: 'Alice', emoji: '😀' },
                { id: 'p2', name: 'Bob', emoji: '🐶' },
                { id: 'p3', name: 'Charlie', emoji: '🎮' },
            ],
            settings: { gameMode: 'classic', ...overrides.settings },
            emojis: {
                p1: ['😀', '🐶'],
                p2: ['🎮', '🔥'],
                p3: ['⭐', '🌈'],
                ...overrides.emojis,
            },
            stories: {
                p1: 'Story by Alice',
                p2: 'Story by Bob',
                p3: 'Story by Charlie',
                ...overrides.stories,
            },
            assignments: {
                p1: 'p2', // p1 reads p2's story
                p2: 'p3', // p2 reads p3's story
                p3: 'p1', // p3 reads p1's story
                ...overrides.assignments,
            },
            guesses: overrides.guesses || {},
            leaderboard: {},
            teams: overrides.teams || null,
            ...overrides,
        };
    }

    describe('processRoundResults', () => {
        it('returns results for all players', () => {
            const lobby = makeLobby({
                guesses: {
                    p1: { guess: { emojiCombo: ['🎮', '🔥'], playerId: 'p2' } },
                    p2: { guess: { emojiCombo: ['⭐', '🌈'], playerId: 'p3' } },
                    p3: { guess: { emojiCombo: ['😀', '🐶'], playerId: 'p1' } },
                },
            });

            const { results } = processRoundResults(lobby);
            expect(results).toHaveLength(3);
            expect(results[0].author).toBe('Alice');
        });

        it('awards points for correct guesses', () => {
            const lobby = makeLobby({
                guesses: {
                    p1: { guess: { emojiCombo: ['🎮', '🔥'], playerId: 'p2' } },
                    p2: { guess: { emojiCombo: ['⭐', '🌈'], playerId: 'p3' } },
                    p3: { guess: { emojiCombo: ['😀', '🐶'], playerId: 'p1' } },
                },
            });

            processRoundResults(lobby);
            // All guessed correctly — each guesser gets emoji + author points
            expect(lobby.leaderboard.p1).toBeGreaterThan(0);
            expect(lobby.leaderboard.p2).toBeGreaterThan(0);
            expect(lobby.leaderboard.p3).toBeGreaterThan(0);
        });

        it('awards deception points when nobody guesses correctly', () => {
            const lobby = makeLobby({
                guesses: {
                    p1: { guess: { emojiCombo: ['wrong'], playerId: 'p3' } },
                    p2: { guess: { emojiCombo: ['wrong'], playerId: 'p1' } },
                    p3: { guess: { emojiCombo: ['wrong'], playerId: 'p2' } },
                },
            });

            processRoundResults(lobby);
            // Each author gets "nobody guessed" bonus
            expect(lobby.leaderboard.p1).toBe(POINTS.classic.NOBODY_GUESSED_EMOJI + POINTS.classic.NOBODY_GUESSED_AUTHOR);
        });
    });

    describe('calculateTeamScores', () => {
        it('returns null when no teams', () => {
            const lobby = makeLobby();
            lobby.leaderboard = { p1: 5, p2: 3, p3: 2 };
            expect(calculateTeamScores(lobby)).toBeNull();
        });

        it('sums team scores', () => {
            const lobby = makeLobby({
                teams: { A: ['p1', 'p2'], B: ['p3'] },
            });
            lobby.leaderboard = { p1: 5, p2: 3, p3: 7 };

            const scores = calculateTeamScores(lobby);
            expect(scores.A).toBe(8);
            expect(scores.B).toBe(7);
        });
    });

    describe('blind mode', () => {
        it('only awards author-based points', () => {
            const lobby = makeLobby({
                settings: { gameMode: 'blind' },
                guesses: {
                    p1: { guess: { playerId: 'p2' } },
                    p2: { guess: { playerId: 'p3' } },
                    p3: { guess: { playerId: 'p1' } },
                },
            });

            const { results } = processRoundResults(lobby);
            expect(results).toHaveLength(3);
            // All guessed the author correctly
            expect(lobby.leaderboard.p1).toBeGreaterThan(0);
        });
    });
});
