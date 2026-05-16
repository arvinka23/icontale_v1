// Socket handlers: submit-story, submit-guess, achievements-list

import type { Socket } from 'socket.io';
import type { Guess } from '../types';
import log from '../logger';
import * as san from '../sanitize';
import * as filter from '../wordfilter';
import * as store from '../store';
import { updateStatsAndCheck, ACHIEVEMENTS } from '../achievements';
import { recordEvent } from '../replay';
import { startGuessingPhase, processGameResults } from '../game-flow';
import type { HandlerContext } from './context';

export function registerPlayerHandlers(socket: Socket, ctx: HandlerContext): void {
    const { io, getLobby, clearLobbyTimers, deps, metrics } = ctx;

    socket.on('submit-story', (payload: { roomCode?: string; story?: string }) => {
        try {
            const { roomCode, story } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || !lobby.started) return;

            const result = san.validateStory(story, lobby.settings.wordLimit);
            if (!result.valid) return socket.emit('story-error', { message: result.error });

            const storyCheck = filter.checkStory(result.value);
            if (!storyCheck.clean) return socket.emit('story-error', { message: storyCheck.reason });

            lobby.stories[socket.id] = result.value;
            lobby.lastActivity = Date.now();
            metrics.storiesSubmitted.inc();

            const wordCount = result.value.split(/\s+/).filter(Boolean).length;
            const elapsed = lobby.writingStartTime
                ? (Date.now() - lobby.writingStartTime) / 1000
                : Infinity;

            updateStatsAndCheck(socket.id, (s) => {
                if (elapsed < 30) s.fastestStoryTime = Math.min(s.fastestStoryTime ?? Infinity, elapsed);
                s.longestStoryWords = Math.max(s.longestStoryWords ?? 0, wordCount);
                s.shortestStoryWords = Math.min(s.shortestStoryWords ?? Infinity, wordCount);
            }).then((achs) => {
                if (achs.length) io.to(socket.id).emit('achievement-unlocked', { achievements: achs });
            }).catch((achErr) => log.error({ err: achErr }, 'Achievement check failed'));

            recordEvent(lobby, 'story-submit', { playerId: socket.id });
            store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            io.to(roomCode ?? '').emit('writing-progress', {
                submitted: Object.keys(lobby.stories).length,
                total: lobby.players.length,
            });

            if (Object.keys(lobby.stories).length === lobby.players.length) {
                clearLobbyTimers(lobby);
                startGuessingPhase(roomCode ?? '', deps);
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in submit-story');
        }
    });

    socket.on('submit-guess', (payload: { roomCode?: string; guess?: Guess }) => {
        try {
            const { roomCode, guess } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby) return;
            if (!lobby.guesses) lobby.guesses = {};
            if (!guess || typeof guess !== 'object') return;

            lobby.guesses[socket.id] = { guess };
            lobby.lastActivity = Date.now();
            metrics.guessesSubmitted.inc();

            recordEvent(lobby, 'guess-submit', { playerId: socket.id });
            store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            io.to(roomCode ?? '').emit('guessing-progress', {
                submitted: Object.keys(lobby.guesses).length,
                total: lobby.players.length,
            });

            if (Object.keys(lobby.guesses).length === lobby.players.length) {
                processGameResults(roomCode ?? '', deps);
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in submit-guess');
        }
    });

    socket.on('achievements-list', async () => {
        try {
            const unlocked = await store.getUnlockedAchievements(socket.id);
            socket.emit('achievements-list', { achievements: ACHIEVEMENTS, unlocked });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in achievements-list');
            socket.emit('achievements-list', { achievements: ACHIEVEMENTS, unlocked: [] });
        }
    });
}
