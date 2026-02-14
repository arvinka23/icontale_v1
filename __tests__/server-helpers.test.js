import { describe, it, expect, vi } from 'vitest';

// We can't import server.js directly (it starts a listener),
// so we test the logic patterns used in server.js.

describe('server helper patterns', () => {

    describe('generateRoomCode (crypto-based)', () => {
        it('generates a 6-character uppercase alphanumeric code', async () => {
            const crypto = await import('crypto');
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

            function generateRoomCode() {
                const bytes = crypto.randomBytes(6);
                let code = '';
                for (let i = 0; i < 6; i++) {
                    code += chars[bytes[i] % chars.length];
                }
                return code;
            }

            const code = generateRoomCode();
            expect(code).toMatch(/^[A-Z0-9]{6}$/);
            expect(code).toHaveLength(6);
        });

        it('generates unique codes', async () => {
            const crypto = await import('crypto');
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

            function generateRoomCode() {
                const bytes = crypto.randomBytes(6);
                let code = '';
                for (let i = 0; i < 6; i++) {
                    code += chars[bytes[i] % chars.length];
                }
                return code;
            }

            const codes = new Set();
            for (let i = 0; i < 100; i++) {
                codes.add(generateRoomCode());
            }
            // With 36^6 = 2.18 billion possibilities, 100 codes should all be unique
            expect(codes.size).toBe(100);
        });
    });

    describe('derangement algorithm', () => {
        function createDerangement(playerIds) {
            let assignments = {};
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
            return { assignments, deranged, attempts };
        }

        it('creates valid derangement for 3 players', () => {
            const ids = ['a', 'b', 'c'];
            const { assignments, deranged } = createDerangement(ids);

            expect(deranged).toBe(true);
            // No player is assigned to themselves
            for (const id of ids) {
                expect(assignments[id]).not.toBe(id);
            }
            // All players are assigned
            expect(Object.keys(assignments)).toHaveLength(3);
            // All players appear as values
            const values = Object.values(assignments);
            for (const id of ids) {
                expect(values).toContain(id);
            }
        });

        it('creates valid derangement for 20 players', () => {
            const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
            const { assignments, deranged } = createDerangement(ids);

            expect(deranged).toBe(true);
            for (const id of ids) {
                expect(assignments[id]).not.toBe(id);
            }
        });

        it('creates valid derangement for 2 players', () => {
            const ids = ['a', 'b'];
            const { assignments, deranged } = createDerangement(ids);

            expect(deranged).toBe(true);
            expect(assignments.a).toBe('b');
            expect(assignments.b).toBe('a');
        });

        it('handles repeated runs without failure', () => {
            const ids = ['a', 'b', 'c', 'd', 'e'];
            for (let i = 0; i < 50; i++) {
                const { deranged } = createDerangement(ids);
                expect(deranged).toBe(true);
            }
        });
    });

    describe('replaceSocketIdInLobby pattern', () => {
        function replaceSocketIdInLobby(lobby, oldId, newId) {
            const maps = ['emojis', 'stories', 'guesses', 'leaderboard', 'totalScores'];
            for (const key of maps) {
                if (lobby[key] && lobby[key][oldId] !== undefined) {
                    lobby[key][newId] = lobby[key][oldId];
                    delete lobby[key][oldId];
                }
            }
            if (lobby.teams) {
                for (const team of ['A', 'B']) {
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

        it('replaces IDs in all state maps', () => {
            const lobby = {
                emojis:      { old123: ['😀'] },
                stories:     { old123: 'Test story' },
                guesses:     { old123: { guess: {} } },
                leaderboard: { old123: 5 },
                totalScores: { old123: 10 },
                teams:       { A: ['old123', 'p2'], B: ['p3'] },
                assignments: { old123: 'p2', p3: 'old123' },
            };

            replaceSocketIdInLobby(lobby, 'old123', 'new456');

            expect(lobby.emojis.new456).toEqual(['😀']);
            expect(lobby.emojis.old123).toBeUndefined();
            expect(lobby.stories.new456).toBe('Test story');
            expect(lobby.leaderboard.new456).toBe(5);
            expect(lobby.totalScores.new456).toBe(10);
            expect(lobby.teams.A).toContain('new456');
            expect(lobby.teams.A).not.toContain('old123');
            expect(lobby.assignments.new456).toBe('p2');
            expect(lobby.assignments.p3).toBe('new456');
        });

        it('handles lobby without teams', () => {
            const lobby = {
                emojis: { old: ['😀'] },
                stories: {},
                guesses: {},
                leaderboard: {},
                totalScores: {},
                teams: null,
                assignments: {},
            };

            // Should not throw
            replaceSocketIdInLobby(lobby, 'old', 'new');
            expect(lobby.emojis.new).toEqual(['😀']);
        });
    });
});
