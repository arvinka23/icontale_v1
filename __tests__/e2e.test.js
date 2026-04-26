import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { createTestServer } from './test-server.js';

function connectClient(baseUrl) {
    const client = ioClient(baseUrl, { autoConnect: true });
    return new Promise((resolve) => {
        client.on('connect', () => resolve(client));
    });
}

function waitForEvent(socket, event, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
        socket.once(event, (data) => {
            clearTimeout(t);
            resolve(data);
        });
    });
}

describe('E2E Game Flow Tests', () => {
    let testServer;
    let baseUrl;

    beforeAll(async () => {
        testServer = await createTestServer();
        baseUrl = `http://localhost:${testServer.port}`;
    });

    afterAll(async () => {
        await testServer.close();
    });

    beforeEach(() => {
        // Each test gets a fresh server state via new lobbies
    });

    describe('Full Classic Game Flow', () => {
        it('3 players complete full game: create lobby → join → start → write stories → guess → results → leaderboard', { timeout: 15000 }, async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'Alice', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'Bob', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            const hostRound = waitForEvent(host, 'round-started');
            const p2Round = waitForEvent(p2, 'round-started');
            const p3Round = waitForEvent(p3, 'round-started');
            host.emit('start-game', { roomCode });
            await hostRound;
            await p2Round;
            await p3Round;

            host.emit('submit-story', { roomCode, story: 'Host story here.' });
            p2.emit('submit-story', { roomCode, story: 'Alice story here.' });
            p3.emit('submit-story', { roomCode, story: 'Bob story here.' });

            const hostGuess = await waitForEvent(host, 'guess-phase');
            const p2Guess = await waitForEvent(p2, 'guess-phase');
            const p3Guess = await waitForEvent(p3, 'guess-phase');

            host.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: hostGuess.correctEmojis, playerId: hostGuess.authorId },
            });
            p2.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: p2Guess.correctEmojis, playerId: p2Guess.authorId },
            });
            p3.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: p3Guess.correctEmojis, playerId: p3Guess.authorId },
            });

            const results = await waitForEvent(host, 'results-phase');
            expect(results.results).toBeDefined();
            expect(results.leaderboard).toBeDefined();
            const totalPoints = Object.values(results.leaderboard).reduce((a, b) => a + b, 0);
            expect(totalPoints).toBeGreaterThan(0);

            const leaderboard = waitForEvent(host, 'leaderboard-phase');
            host.emit('leaderboard-phase', { roomCode });
            const lb = await leaderboard;
            expect(lb.leaderboard).toBeDefined();
            expect(lb.players).toHaveLength(3);

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });

        it('Verify all players receive correct events at each phase', async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            const p2Joined = await waitForEvent(p2, 'lobby-joined');
            expect(p2Joined.players).toHaveLength(2);

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            host.emit('start-game', { roomCode });
            const [h, a, b] = await Promise.all([
                waitForEvent(host, 'round-started'),
                waitForEvent(p2, 'round-started'),
                waitForEvent(p3, 'round-started'),
            ]);
            expect(h.emojis).toBeDefined();
            expect(a.emojis).toBeDefined();
            expect(b.emojis).toBeDefined();

            host.emit('submit-story', { roomCode, story: 'One.' });
            p2.emit('submit-story', { roomCode, story: 'Two.' });
            p3.emit('submit-story', { roomCode, story: 'Three.' });

            const [g1, g2, g3] = await Promise.all([
                waitForEvent(host, 'guess-phase'),
                waitForEvent(p2, 'guess-phase'),
                waitForEvent(p3, 'guess-phase'),
            ]);
            expect(g1.story).toBeDefined();
            expect(g2.story).toBeDefined();
            expect(g3.story).toBeDefined();

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });

        it('Verify scoring is non-zero after guessing', { timeout: 15000 }, async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'H', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'A', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'B', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            const hostRound = waitForEvent(host, 'round-started');
            const p2Round = waitForEvent(p2, 'round-started');
            const p3Round = waitForEvent(p3, 'round-started');
            host.emit('start-game', { roomCode });
            await hostRound;
            await p2Round;
            await p3Round;

            host.emit('submit-story', { roomCode, story: 'Story one.' });
            p2.emit('submit-story', { roomCode, story: 'Story two.' });
            p3.emit('submit-story', { roomCode, story: 'Story three.' });

            const [g1, g2, g3] = await Promise.all([
                waitForEvent(host, 'guess-phase'),
                waitForEvent(p2, 'guess-phase'),
                waitForEvent(p3, 'guess-phase'),
            ]);

            host.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: g1.correctEmojis, playerId: g1.authorId },
            });
            p2.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: g2.correctEmojis, playerId: g2.authorId },
            });
            p3.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: g3.correctEmojis, playerId: g3.authorId },
            });

            const results = await waitForEvent(host, 'results-phase');
            const scores = Object.values(results.leaderboard);
            expect(scores.some((s) => s > 0)).toBe(true);

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });
    });

    describe('Full Speed Mode', () => {
        it('Speed mode with 3 players, verify timer settings (60s, 100 words)', async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', {
                username: 'Host',
                emoji: '😀',
                settings: { gameMode: 'speed' },
            });
            const { roomCode, settings } = await createdPromise;
            expect(settings.gameMode).toBe('speed');
            expect(settings.timerDuration).toBe(60);
            expect(settings.wordLimit).toBe(100);

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            host.emit('start-game', { roomCode });
            const roundData = await waitForEvent(host, 'round-started');
            expect(roundData.settings.timerDuration).toBe(60);
            expect(roundData.settings.wordLimit).toBe(100);

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });
    });

    describe('Full Blind Mode', () => {
        it('Blind mode with no emoji options in guess-phase', { timeout: 15000 }, async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', {
                username: 'Host',
                emoji: '😀',
                settings: { gameMode: 'blind' },
            });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            const hostRound = waitForEvent(host, 'round-started');
            const p2Round = waitForEvent(p2, 'round-started');
            const p3Round = waitForEvent(p3, 'round-started');
            host.emit('start-game', { roomCode });
            await hostRound;
            await p2Round;
            await p3Round;

            host.emit('submit-story', { roomCode, story: 'Blind story one.' });
            p2.emit('submit-story', { roomCode, story: 'Blind story two.' });
            p3.emit('submit-story', { roomCode, story: 'Blind story three.' });

            const guessData = await waitForEvent(host, 'guess-phase');
            expect(guessData.emojiOptions).toBeNull();
            expect(guessData.story).toBeDefined();
            expect(guessData.players).toBeDefined();

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });
    });

    describe('Team Mode', () => {
        it('4 players, verify teams-assigned event with 2 players per team', async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', {
                username: 'Host',
                emoji: '😀',
                settings: { gameMode: 'team' },
            });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            const p4 = await connectClient(baseUrl);
            p4.emit('join-lobby', { username: 'P4', roomCode, emoji: '🥳' });
            await waitForEvent(p4, 'lobby-joined');

            const teamsAssigned = waitForEvent(host, 'teams-assigned');
            host.emit('start-game', { roomCode });
            const data = await teamsAssigned;
            expect(data.teams).toBeDefined();
            expect(data.teams.A).toBeDefined();
            expect(data.teams.B).toBeDefined();
            expect(data.teams.A.length + data.teams.B.length).toBe(4);
            expect(Math.abs(data.teams.A.length - data.teams.B.length)).toBeLessThanOrEqual(1);

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
            p4.disconnect();
        });
    });

    describe('Spectator Flow', () => {
        it('Player joins as spectator, receives spectator-joined, sees round updates', async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const spec = await connectClient(baseUrl);
            spec.emit('join-spectator', { roomCode });
            const specJoined = await waitForEvent(spec, 'spectator-joined');
            expect(specJoined.roomCode).toBe(roomCode);
            expect(specJoined.players).toHaveLength(2);
            expect(specJoined.spectators).toBeDefined();

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            host.emit('start-game', { roomCode });
            const specRound = await waitForEvent(spec, 'spectator-round-started');
            expect(specRound.currentRound).toBe(1);
            expect(specRound.totalRounds).toBeDefined();

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
            spec.disconnect();
        });
    });

    describe('Multi-Round Game', () => {
        it('Best of 3: complete 3 rounds, verify round numbering and total scores accumulation', { timeout: 30000 }, async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', {
                username: 'Host',
                emoji: '😀',
                settings: { rounds: 3 },
            });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            const hostRound = waitForEvent(host, 'round-started');
            const p2Round = waitForEvent(p2, 'round-started');
            const p3Round = waitForEvent(p3, 'round-started');
            host.emit('start-game', { roomCode });
            let roundData = await hostRound;
            expect(roundData.currentRound).toBe(1);
            expect(roundData.totalRounds).toBe(3);
            await p2Round;
            await p3Round;

            const playRound = async () => {
                host.emit('submit-story', { roomCode, story: 'Round story h.' });
                p2.emit('submit-story', { roomCode, story: 'Round story p2.' });
                p3.emit('submit-story', { roomCode, story: 'Round story p3.' });

                const [g1, g2, g3] = await Promise.all([
                    waitForEvent(host, 'guess-phase'),
                    waitForEvent(p2, 'guess-phase'),
                    waitForEvent(p3, 'guess-phase'),
                ]);

                host.emit('submit-guess', {
                    roomCode,
                    guess: { emojiCombo: g1.correctEmojis, playerId: g1.authorId },
                });
                p2.emit('submit-guess', {
                    roomCode,
                    guess: { emojiCombo: g2.correctEmojis, playerId: g2.authorId },
                });
                p3.emit('submit-guess', {
                    roomCode,
                    guess: { emojiCombo: g3.correctEmojis, playerId: g3.authorId },
                });

                await waitForEvent(host, 'results-phase');
            };

            await playRound();
            host.emit('leaderboard-phase', { roomCode });
            await waitForEvent(host, 'leaderboard-phase');
            host.emit('next-round', { roomCode });

            roundData = await waitForEvent(host, 'round-started');
            expect(roundData.currentRound).toBe(2);

            await playRound();
            host.emit('leaderboard-phase', { roomCode });
            await waitForEvent(host, 'leaderboard-phase');
            host.emit('next-round', { roomCode });

            roundData = await waitForEvent(host, 'round-started');
            expect(roundData.currentRound).toBe(3);

            await playRound();
            const gameOver = waitForEvent(host, 'game-over');
            host.emit('leaderboard-phase', { roomCode });
            await waitForEvent(host, 'leaderboard-phase');
            host.emit('next-round', { roomCode });
            const over = await gameOver;
            expect(over.totalScores).toBeDefined();
            expect(over.roundHistory.length).toBeGreaterThanOrEqual(2);

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });
    });

    describe('Edge Cases', () => {
        it('Player disconnects mid-game: other players notified', { timeout: 10000 }, async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            const hostRound = waitForEvent(host, 'round-started');
            const p2Round = waitForEvent(p2, 'round-started');
            const p3Round = waitForEvent(p3, 'round-started');
            const disconnected = waitForEvent(host, 'player-disconnected');
            host.emit('start-game', { roomCode });
            await hostRound;
            await p2Round;
            await p3Round;

            p2.disconnect();
            const data = await disconnected;
            expect(data.name).toBe('P2');

            host.disconnect();
            p3.disconnect();
        });

        it('New game (back to lobby) resets all state', async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const p3 = await connectClient(baseUrl);
            p3.emit('join-lobby', { username: 'P3', roomCode, emoji: '🤔' });
            await waitForEvent(p3, 'lobby-joined');

            host.emit('start-game', { roomCode });
            await waitForEvent(host, 'round-started');

            const backToLobby = waitForEvent(host, 'back-to-lobby');
            host.emit('new-game', { roomCode });
            const data = await backToLobby;
            expect(data.players).toHaveLength(3);
            expect(data.settings).toBeDefined();

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });

        it('Settings update from host propagates to all players', async () => {
            const host = await connectClient(baseUrl);
            const createdPromise = waitForEvent(host, 'lobby-created');
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await createdPromise;

            const p2 = await connectClient(baseUrl);
            p2.emit('join-lobby', { username: 'P2', roomCode, emoji: '😎' });
            await waitForEvent(p2, 'lobby-joined');

            const settingsUpdate = waitForEvent(p2, 'settings-update');
            host.emit('update-settings', {
                roomCode,
                settings: { timerDuration: 120, wordLimit: 250 },
            });
            const data = await settingsUpdate;
            expect(data.timerDuration).toBe(120);
            expect(data.wordLimit).toBe(250);

            host.disconnect();
            p2.disconnect();
        });
    });
});
