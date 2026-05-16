// Socket handlers: create-lobby, join-lobby, join-spectator, update-settings

import crypto from 'crypto';
import type { Socket } from 'socket.io';
import type { GameSettings } from '../types';
import log from '../logger';
import * as san from '../sanitize';
import * as filter from '../wordfilter';
import * as store from '../store';
import { updateStatsAndCheck } from '../achievements';
import type { HandlerContext } from './context';

function generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i]! % chars.length];
    }
    return code;
}

export function registerLobbyHandlers(socket: Socket, ctx: HandlerContext): void {
    const { io, lobbies, getLobby, metrics, maxLobbies, maxPlayersPerLobby, defaultSettings } = ctx;

    socket.on('create-lobby', (payload: { username?: string; emoji?: string; settings?: Partial<GameSettings> }) => {
        try {
            const { username, emoji, settings } = payload ?? {};
            const uResult = san.validateUsername(username);
            if (!uResult.valid) return socket.emit('lobby-error', { code: 'error.usernameRequired', message: uResult.error });

            const nameCheck = filter.checkUsername(uResult.value);
            if (!nameCheck.clean) return socket.emit('lobby-error', { message: nameCheck.reason });

            if (Object.keys(lobbies).length >= maxLobbies) {
                return socket.emit('lobby-error', { code: 'error.serverFull' });
            }

            const eResult = san.validateEmoji(emoji);
            const safeSettings = san.validateSettings(settings ?? {});
            const merged = { ...defaultSettings, ...safeSettings };

            if (merged.gameMode === 'speed') {
                merged.timerDuration = 60;
                merged.wordLimit = 100;
            }

            const roomCode = generateRoomCode();
            lobbies[roomCode] = {
                host: socket.id,
                players: [{ id: socket.id, name: uResult.value, emoji: eResult.value }],
                spectators: [],
                settings: merged,
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
            };

            socket.join(roomCode);
            store.saveLobby(roomCode, lobbies[roomCode]!).catch((err) => log.error({ err }, 'Redis save failed'));

            log.info({ roomCode, host: uResult.value, lobbies: Object.keys(lobbies).length }, 'Lobby created');
            socket.emit('lobby-created', { roomCode, players: lobbies[roomCode]!.players, settings: merged });
            metrics.lobbyEvents.inc({ type: 'created' });
            io.to(roomCode).emit('players-update', lobbies[roomCode]!.players);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in create-lobby');
            socket.emit('lobby-error', { code: 'error.createLobbyFailed' });
        }
    });

    socket.on('join-lobby', (payload: { username?: string; roomCode?: string; emoji?: string }) => {
        try {
            const { username, roomCode, emoji } = payload ?? {};
            const uResult = san.validateUsername(username);
            if (!uResult.valid) return socket.emit('lobby-error', { code: 'error.usernameRequired', message: uResult.error });

            const nameCheck = filter.checkUsername(uResult.value);
            if (!nameCheck.clean) return socket.emit('lobby-error', { message: nameCheck.reason });

            const cResult = san.validateRoomCode(roomCode);
            if (!cResult.valid) return socket.emit('lobby-error', { code: 'error.roomCodeInvalid', message: cResult.error });

            const eResult = san.validateEmoji(emoji);
            const lobby = getLobby(cResult.value);

            if (!lobby) return socket.emit('lobby-error', { code: 'error.lobbyNotFound' });
            if (lobby.started) return socket.emit('lobby-error', { code: 'error.gameAlreadyStarted' });
            if (lobby.players.length >= maxPlayersPerLobby) {
                return socket.emit('lobby-error', { code: 'error.lobbyFull', params: { n: maxPlayersPerLobby } });
            }
            if (lobby.players.some((p) => p.name === uResult.value)) {
                return socket.emit('lobby-error', { code: 'error.nameTaken' });
            }

            lobby.players.push({ id: socket.id, name: uResult.value, emoji: eResult.value });
            lobby.lastActivity = Date.now();
            socket.join(cResult.value);

            store.saveLobby(cResult.value, lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            log.info({ roomCode: cResult.value, player: uResult.value }, 'Player joined');
            socket.emit('lobby-joined', { roomCode: cResult.value, players: lobby.players, settings: lobby.settings });
            metrics.lobbyEvents.inc({ type: 'joined' });
            io.to(cResult.value).emit('players-update', lobby.players);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in join-lobby');
            socket.emit('lobby-error', { code: 'error.joinLobbyFailed' });
        }
    });

    socket.on('join-spectator', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const cResult = san.validateRoomCode(roomCode);
            if (!cResult.valid) return socket.emit('lobby-error', { code: 'error.roomCodeInvalid', message: cResult.error });

            const lobby = getLobby(cResult.value);
            if (!lobby) return socket.emit('lobby-error', { code: 'error.lobbyNotFound' });

            lobby.spectators.push({ id: socket.id });
            socket.join(cResult.value);

            store.saveLobby(cResult.value, lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            log.debug({ roomCode: cResult.value }, 'Spectator joined');
            socket.emit('spectator-joined', {
                roomCode: cResult.value,
                players: lobby.players,
                spectators: lobby.spectators,
                settings: lobby.settings,
                started: lobby.started,
                currentRound: lobby.currentRound,
                totalRounds: lobby.settings.rounds,
            });
            io.to(cResult.value).emit('spectators-update', lobby.spectators);

            updateStatsAndCheck(socket.id, (s) => {
                s.spectatedGames = (s.spectatedGames ?? 0) + 1;
            }).then((achs) => {
                if (achs.length) io.to(socket.id).emit('achievement-unlocked', { achievements: achs });
            }).catch((achErr) => log.error({ err: achErr }, 'Achievement check failed'));
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in join-spectator');
        }
    });

    socket.on('update-settings', (payload: { roomCode?: string; settings?: Partial<GameSettings> }) => {
        try {
            const { roomCode, settings } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || lobby.host !== socket.id || lobby.started) return;

            const safeSettings = san.validateSettings(settings ?? {});
            lobby.settings = { ...lobby.settings, ...safeSettings };

            if (lobby.settings.gameMode === 'speed') {
                lobby.settings.timerDuration = 60;
                lobby.settings.wordLimit = 100;
            }

            lobby.lastActivity = Date.now();
            store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            log.debug({ roomCode, settings: lobby.settings }, 'Settings updated');
            io.to(roomCode ?? '').emit('settings-update', lobby.settings);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in update-settings');
        }
    });
}
