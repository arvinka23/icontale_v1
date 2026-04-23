import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { createTestServer } from './test-server.js';

describe('Integration Tests', () => {
    let testServer;
    let baseUrl;
    let port;

    beforeAll(async () => {
        testServer = await createTestServer();
        port = testServer.port;
        baseUrl = `http://localhost:${port}`;
    });

    afterAll(async () => {
        await testServer.close();
    });

    describe('HTTP Tests', () => {
        it('GET /health returns 200 with status ok', async () => {
            const res = await fetch(`${baseUrl}/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('ok');
            expect(data.lobbies).toBeDefined();
        });

        it('GET /nonexistent returns 404', async () => {
            const res = await fetch(`${baseUrl}/nonexistent`);
            expect(res.status).toBe(404);
        });

        it('GET /metrics returns Prometheus text with registered metrics', async () => {
            const res = await fetch(`${baseUrl}/metrics`);
            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toMatch(/text\/plain/);
            const body = await res.text();
            expect(body).toContain('# HELP icontale_test_events_total');
            expect(body).toContain('# TYPE icontale_test_events_total counter');
            expect(body).toContain('icontale_test_events_total 1');
        });
    });

    describe('Socket Tests: Lobby Management', () => {
        it('create-lobby with valid data emits lobby-created', async () => {
            const client = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => client.on('connect', resolve));

            const created = new Promise((resolve) => {
                client.on('lobby-created', resolve);
            });

            client.emit('create-lobby', { username: 'Alice', emoji: '😀' });
            const data = await created;
            expect(data.roomCode).toBeDefined();
            expect(data.roomCode).toMatch(/^[A-Z0-9]{6}$/);
            expect(data.players).toHaveLength(1);
            expect(data.players[0].name).toBe('Alice');
            expect(data.settings).toBeDefined();

            client.disconnect();
        });

        it('create-lobby with empty username emits lobby-error', async () => {
            const client = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => client.on('connect', resolve));

            const err = new Promise((resolve) => {
                client.on('lobby-error', resolve);
            });

            client.emit('create-lobby', { username: '', emoji: '😀' });
            const data = await err;
            expect(data.message).toBeDefined();
            expect(data.message).toContain('Benutzername');

            client.disconnect();
        });

        it('create-lobby with offensive username emits lobby-error', async () => {
            const client = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => client.on('connect', resolve));

            const err = new Promise((resolve) => {
                client.on('lobby-error', resolve);
            });

            client.emit('create-lobby', { username: 'h1tl3r', emoji: '😀' });
            const data = await err;
            expect(data.message).toBeDefined();

            client.disconnect();
        });

        it('join-lobby with valid code emits lobby-joined', async () => {
            const host = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => host.on('connect', resolve));

            const created = new Promise((resolve) => host.on('lobby-created', resolve));
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await created;

            const joiner = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => joiner.on('connect', resolve));

            const joined = new Promise((resolve) => joiner.on('lobby-joined', resolve));
            joiner.emit('join-lobby', { username: 'Bob', roomCode, emoji: '😎' });
            const data = await joined;
            expect(data.roomCode).toBe(roomCode);
            expect(data.players).toHaveLength(2);

            host.disconnect();
            joiner.disconnect();
        });

        it('join-lobby with invalid code emits lobby-error', async () => {
            const client = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => client.on('connect', resolve));

            const err = new Promise((resolve) => client.on('lobby-error', resolve));
            client.emit('join-lobby', { username: 'Bob', roomCode: 'INVALID', emoji: '😎' });
            const data = await err;
            expect(data.message).toBeDefined();

            client.disconnect();
        });

        it('join-lobby with non-existent lobby emits lobby-error', async () => {
            const client = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => client.on('connect', resolve));

            const err = new Promise((resolve) => client.on('lobby-error', resolve));
            client.emit('join-lobby', { username: 'Bob', roomCode: 'ABCD12', emoji: '😎' });
            const data = await err;
            expect(data.message).toBeDefined();
            expect(data.message).toContain('gefunden');

            client.disconnect();
        });

        it('join-lobby with duplicate name emits lobby-error', async () => {
            const host = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => host.on('connect', resolve));

            const created = new Promise((resolve) => host.on('lobby-created', resolve));
            host.emit('create-lobby', { username: 'Alice', emoji: '😀' });
            const { roomCode } = await created;

            const joiner = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => joiner.on('connect', resolve));

            const err = new Promise((resolve) => joiner.on('lobby-error', resolve));
            joiner.emit('join-lobby', { username: 'Alice', roomCode, emoji: '😎' });
            const data = await err;
            expect(data.message).toBeDefined();
            expect(data.message).toContain('bereits vergeben');

            host.disconnect();
            joiner.disconnect();
        });
    });

    describe('Socket Tests: Game Flow', () => {
        it('start-game with fewer than 3 players emits lobby-error', async () => {
            const host = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => host.on('connect', resolve));

            const created = new Promise((resolve) => host.on('lobby-created', resolve));
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await created;

            const err = new Promise((resolve) => host.on('lobby-error', resolve));
            host.emit('start-game', { roomCode });
            const data = await err;
            expect(data.message).toContain('3 Spieler');

            host.disconnect();
        });

        it('Full game flow: 3 players create/join, start, write stories, submit guesses → results-phase emitted', { timeout: 15000 }, async () => {
            const host = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => host.on('connect', resolve));

            const created = new Promise((resolve) => host.on('lobby-created', resolve));
            host.emit('create-lobby', { username: 'Host', emoji: '😀' });
            const { roomCode } = await created;

            const p2 = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => p2.on('connect', resolve));
            const joined2 = new Promise((resolve) => p2.on('lobby-joined', resolve));
            p2.emit('join-lobby', { username: 'Player2', roomCode, emoji: '😎' });
            await joined2;

            const p3 = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => p3.on('connect', resolve));
            const joined3 = new Promise((resolve) => p3.on('lobby-joined', resolve));
            p3.emit('join-lobby', { username: 'Player3', roomCode, emoji: '🤔' });
            await joined3;

            const roundStarted = new Promise((resolve) => host.on('round-started', resolve));
            const p2Round = new Promise((resolve) => p2.on('round-started', resolve));
            const p3Round = new Promise((resolve) => p3.on('round-started', resolve));
            host.emit('start-game', { roomCode });
            const roundData = await roundStarted;
            expect(roundData.emojis).toBeDefined();
            expect(roundData.emojis.length).toBeGreaterThan(0);
            await p2Round;
            await p3Round;

            const guessPhaseHost = new Promise((resolve) => host.on('guess-phase', resolve));
            const guessPhaseP2 = new Promise((resolve) => p2.on('guess-phase', resolve));
            const guessPhaseP3 = new Promise((resolve) => p3.on('guess-phase', resolve));

            host.emit('submit-story', { roomCode, story: 'A short story from host.' });
            p2.emit('submit-story', { roomCode, story: 'Another story from player two.' });
            p3.emit('submit-story', { roomCode, story: 'Third story here.' });

            const hostGuessData = await guessPhaseHost;
            const p2GuessData = await guessPhaseP2;
            const p3GuessData = await guessPhaseP3;

            const resultsPhase = new Promise((resolve) => {
                host.on('results-phase', resolve);
            });

            host.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: hostGuessData.correctEmojis, playerId: hostGuessData.authorId },
            });
            p2.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: p2GuessData.correctEmojis, playerId: p2GuessData.authorId },
            });
            p3.emit('submit-guess', {
                roomCode,
                guess: { emojiCombo: p3GuessData.correctEmojis, playerId: p3GuessData.authorId },
            });

            const results = await resultsPhase;
            expect(results.results).toBeDefined();
            expect(results.leaderboard).toBeDefined();
            expect(Object.keys(results.leaderboard).length).toBeGreaterThan(0);

            host.disconnect();
            p2.disconnect();
            p3.disconnect();
        });
    });

    describe('Socket Tests: Security', () => {
        it('Rate limiting: rapidly sending events should trigger rate limit', async () => {
            const rateLimitedServer = await createTestServer({ rateLimitMax: 5 });
            const client = ioClient(`http://localhost:${rateLimitedServer.port}`, {
                autoConnect: true,
            });
            await new Promise((resolve) => client.on('connect', resolve));

            const lobbyCreatedCount = { value: 0 };
            client.on('lobby-created', () => {
                lobbyCreatedCount.value++;
            });

            for (let i = 0; i < 10; i++) {
                client.emit('create-lobby', { username: `User${i}`, emoji: '😀' });
            }

            await new Promise((r) => setTimeout(r, 200));
            expect(lobbyCreatedCount.value).toBeLessThanOrEqual(5);

            client.disconnect();
            await rateLimitedServer.close();
        });

        it('Invalid payload types should not crash server', async () => {
            const client = ioClient(baseUrl, { autoConnect: true });
            await new Promise((resolve) => client.on('connect', resolve));

            client.emit('create-lobby', null);
            client.emit('create-lobby', 123);
            client.emit('create-lobby', { username: 999, emoji: null });
            client.emit('join-lobby', { roomCode: 123 });
            client.emit('submit-story', { roomCode: 'ABC123', story: 456 });
            client.emit('submit-guess', { roomCode: 'ABC123', guess: 'not an object' });

            await new Promise((r) => setTimeout(r, 100));
            expect(client.connected).toBe(true);

            client.disconnect();
        });
    });
});
