// Socket handlers: reconnect-session, disconnect

import type { Socket } from 'socket.io';
import type { DisconnectedSession } from '../types';
import log from '../logger';
import * as store from '../store';
import * as rateLimiter from '../socket-rate-limit';
import { replaceSocketIdInLobby, getGamePhase } from '../game-flow';
import type { HandlerContext } from './context';

export function registerSessionHandlers(socket: Socket, ctx: HandlerContext): void {
    const { io, lobbies, disconnectedSessions, getLobby, clearLobbyTimers, reconnectTimeout } = ctx;

    socket.on('reconnect-session', async (payload: { sessionToken?: string; roomCode?: string }) => {
        try {
            const { sessionToken } = payload ?? {};
            if (!sessionToken || typeof sessionToken !== 'string') return;

            let session = disconnectedSessions.get(sessionToken);
            if (!session) {
                session = (await store.getSession(sessionToken)) ?? undefined;
            }
            if (!session) {
                return socket.emit('reconnect-failed', { reason: 'Session expired or not found.' });
            }

            const lobby = getLobby(session.roomCode);
            if (!lobby) {
                disconnectedSessions.delete(sessionToken);
                return socket.emit('reconnect-failed', { reason: 'Lobby no longer exists.' });
            }

            const existingIdx = lobby.players.findIndex((p) => p.id === session.oldSocketId);
            if (existingIdx !== -1) {
                lobby.players[existingIdx]!.id = socket.id;
                lobby.players[existingIdx]!.disconnected = false;
                delete lobby.players[existingIdx]!.disconnectedAt;
            } else {
                lobby.players.push({ id: socket.id, name: session.playerName, emoji: session.playerEmoji });
            }

            const oldId = session.oldSocketId;
            const newId = socket.id;
            replaceSocketIdInLobby(lobby, oldId, newId);

            if (lobby.host === oldId) lobby.host = newId;

            socket.join(session.roomCode);
            disconnectedSessions.delete(sessionToken);
            lobby.lastActivity = Date.now();

            store.deleteSession(sessionToken)
                .catch((err) => log.error({ err }, 'Failed to delete session from store'));
            store.saveLobby(session.roomCode, lobby)
                .catch((err) => log.error({ err }, 'Redis save failed'));

            log.info({ socketId: newId, roomCode: session.roomCode, player: session.playerName }, 'Player reconnected');

            socket.emit('reconnect-success', {
                roomCode: session.roomCode,
                players: lobby.players,
                settings: lobby.settings,
                started: lobby.started,
                currentRound: lobby.currentRound,
                totalRounds: lobby.settings.rounds,
                isHost: lobby.host === newId,
                gamePhase: session.gamePhase || 'lobby',
            });

            const reconPlayer = lobby.players.find((p) => p.id === socket.id);
            if (reconPlayer) (reconPlayer as unknown as Record<string, unknown>)._reconnected = true;

            io.to(session.roomCode).emit('players-update', lobby.players);
            io.to(session.roomCode).emit('player-reconnected', { name: session.playerName });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in reconnect-session');
        }
    });

    socket.on('disconnect', (reason: string) => {
        log.info({ socketId: socket.id, reason }, 'Client disconnected');
        rateLimiter.forgetSocket(socket.id);

        for (const code in lobbies) {
            const lobby = lobbies[code]!;

            lobby.spectators = lobby.spectators.filter((s) => s.id !== socket.id);

            const playerIdx = lobby.players.findIndex((p) => p.id === socket.id);
            if (playerIdx === -1) continue;

            const player = lobby.players[playerIdx]!;

            if (lobby.started) {
                const sessionToken = `${code}:${socket.id}:${Date.now()}`;
                const sessionData: DisconnectedSession = {
                    roomCode: code,
                    oldSocketId: socket.id,
                    playerName: player.name,
                    playerEmoji: player.emoji,
                    disconnectedAt: Date.now(),
                    gamePhase: getGamePhase(lobby),
                };
                disconnectedSessions.set(sessionToken, sessionData);

                store.saveSession(sessionToken, sessionData)
                    .catch((err) => log.error({ err }, 'Failed to persist session'));

                io.to(code).emit('player-disconnected', { name: player.name, reconnectTimeout });

                log.info({ roomCode: code, player: player.name }, 'Player disconnected mid-game, session saved');

                lobby.players[playerIdx]!.disconnected = true;
                lobby.players[playerIdx]!.disconnectedAt = Date.now();

                setTimeout(() => {
                    try {
                        const currentLobby = getLobby(code);
                        if (!currentLobby) return;

                        const p = currentLobby.players.find((x) => x.id === socket.id && x.disconnected);
                        if (!p) return;

                        log.info({ roomCode: code, player: p.name }, 'Reconnect timeout expired, removing player');
                        currentLobby.players = currentLobby.players.filter((x) => x.id !== socket.id);
                        delete currentLobby.emojis?.[socket.id];
                        delete currentLobby.stories?.[socket.id];

                        if (currentLobby.host === socket.id) {
                            if (currentLobby.players.length > 0) {
                                const newHost =
                                    currentLobby.players.find((x) => !x.disconnected) ?? currentLobby.players[0]!;
                                currentLobby.host = newHost.id;
                                io.to(code).emit('host-changed', { newHost: newHost.name, newHostId: newHost.id });
                                log.info({ roomCode: code, newHost: newHost.name }, 'Host reassigned');
                            } else {
                                clearLobbyTimers(currentLobby);
                                delete lobbies[code];
                                io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                                return;
                            }
                        }

                        if (currentLobby.players.length === 0) {
                            clearLobbyTimers(currentLobby);
                            delete lobbies[code];
                            io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                        } else {
                            store.saveLobby(code, currentLobby).catch((err) => log.error({ err }, 'Redis save failed'));
                            io.to(code).emit('players-update', currentLobby.players);
                        }
                    } catch (err) {
                        log.error({ err }, 'Error in disconnect cleanup timeout');
                    }
                }, reconnectTimeout);
            } else {
                lobby.players = lobby.players.filter((p) => p.id !== socket.id);

                if (lobby.host === socket.id || lobby.players.length === 0) {
                    if (lobby.players.length > 0) {
                        lobby.host = lobby.players[0]!.id;
                        io.to(code).emit('host-changed', {
                            newHost: lobby.players[0]!.name,
                            newHostId: lobby.players[0]!.id,
                        });
                        io.to(code).emit('players-update', lobby.players);
                        store.saveLobby(code, lobby).catch((err) => log.error({ err }, 'Redis save failed'));
                        log.info({ roomCode: code, newHost: lobby.players[0]!.name }, 'Host reassigned after disconnect');
                    } else {
                        clearLobbyTimers(lobby);
                        delete lobbies[code];
                        io.to(code).emit('lobby-closed', { reason: 'All players left.' });
                    }
                } else {
                    store.saveLobby(code, lobby).catch((err) => log.error({ err }, 'Redis save failed'));
                    io.to(code).emit('players-update', lobby.players);
                }
            }
        }
    });
}
