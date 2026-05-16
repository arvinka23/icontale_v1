// Socket handlers: start-game, results-continue, leaderboard-phase, next-round, new-game

import type { Socket } from 'socket.io';
import log from '../logger';
import * as store from '../store';
import { calculateTeamScores } from '../scoring';
import { recordEvent, finalizeReplay } from '../replay';
import { updateStatsAndCheck } from '../achievements';
import { startRound } from '../game-flow';
import type { HandlerContext } from './context';

export function registerGameHandlers(socket: Socket, ctx: HandlerContext): void {
    const { io, getLobby, clearLobbyTimers, deps } = ctx;

    socket.on('start-game', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || lobby.host !== socket.id || lobby.started) return;

            if (lobby.players.length < 3) {
                return socket.emit('lobby-error', { code: 'error.notEnoughPlayers' });
            }

            lobby.started = true;
            lobby.lastActivity = Date.now();

            if (lobby.settings.gameMode === 'team') {
                const shuffled = [...lobby.players].sort(() => 0.5 - Math.random());
                const mid = Math.ceil(shuffled.length / 2);
                lobby.teams = {
                    A: shuffled.slice(0, mid).map((p) => p.id),
                    B: shuffled.slice(mid).map((p) => p.id),
                };
                io.to(roomCode ?? '').emit('teams-assigned', {
                    teams: lobby.teams,
                    players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                });
            }

            store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            log.info({ roomCode, players: lobby.players.length, mode: lobby.settings.gameMode }, 'Game started');
            startRound(roomCode ?? '', deps);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in start-game');
        }
    });

    socket.on('results-continue', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || !lobby.resultsState || lobby.host !== socket.id) return;

            let { currentChatIdx, currentMsgStep } = lobby.resultsState;
            currentMsgStep++;
            const totalSteps = lobby.settings.gameMode === 'blind' ? 3 : 4;

            if (currentMsgStep >= totalSteps) {
                if (currentChatIdx < lobby.players.length - 1) {
                    currentChatIdx++;
                    currentMsgStep = 0;
                } else {
                    currentMsgStep = totalSteps - 1;
                }
            }

            lobby.resultsState = { currentChatIdx, currentMsgStep };
            store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));
            io.to(roomCode ?? '').emit('results-progress', lobby.resultsState);
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in results-continue');
        }
    });

    socket.on('leaderboard-phase', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby) return;

            const teamScores = calculateTeamScores(lobby);
            recordEvent(lobby, 'leaderboard', { leaderboard: lobby.leaderboard });

            io.to(roomCode ?? '').emit('leaderboard-phase', {
                leaderboard: lobby.leaderboard,
                leaderboardDetails: lobby.leaderboardDetails,
                players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                teams: lobby.teams,
                teamScores,
                currentRound: lobby.currentRound,
                totalRounds: lobby.settings.rounds,
                totalScores: lobby.totalScores,
            });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in leaderboard-phase');
        }
    });

    socket.on('next-round', async (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || lobby.host !== socket.id) return;

            for (const [pid, score] of Object.entries(lobby.leaderboard ?? {})) {
                lobby.totalScores[pid] = (lobby.totalScores[pid] || 0) + score;
            }

            if (lobby.currentRound < lobby.settings.rounds) {
                lobby.roundHistory.push({ round: lobby.currentRound, leaderboard: { ...lobby.leaderboard } });
                lobby.emojis = {};
                lobby.stories = {};
                lobby.guesses = {};
                lobby.leaderboard = {};
                lobby.leaderboardDetails = {};
                lobby.resultsState = null;

                store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));
                startRound(roomCode ?? '', deps);
            } else {
                const replayId = await finalizeReplay(lobby, roomCode ?? '');

                io.to(roomCode ?? '').emit('game-over', {
                    totalScores: lobby.totalScores,
                    roundHistory: lobby.roundHistory,
                    players: lobby.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
                    teams: lobby.teams,
                    replayId,
                });

                const winnerId = Object.entries(lobby.totalScores)
                    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0];

                for (const p of lobby.players) {
                    const isWinner = p.id === winnerId;
                    const extra: string[] = [];
                    if (lobby.teams && isWinner) extra.push('team-captain');
                    if ((p as unknown as Record<string, unknown>)._reconnected && isWinner) extra.push('comeback');

                    try {
                        const newAchs = await updateStatsAndCheck(p.id, (s) => {
                            s.gamesPlayed++;
                            if (isWinner) s.gamesWon++;
                            s.modesPlayed.add(lobby.settings.gameMode);
                            if (lobby.settings.rounds >= 5) s.bestOf5Completed = true;
                            if ((p as unknown as Record<string, unknown>)._reconnected && isWinner) {
                                s.reconnectedAndWon = true;
                            }
                        }, extra);
                        if (newAchs.length > 0) {
                            io.to(p.id).emit('achievement-unlocked', { achievements: newAchs });
                        }
                    } catch (achErr) {
                        log.error({ err: achErr, playerId: p.id }, 'Achievement check failed at game-over');
                    }
                }
            }
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in next-round');
        }
    });

    socket.on('new-game', (payload: { roomCode?: string }) => {
        try {
            const { roomCode } = payload ?? {};
            const lobby = getLobby(roomCode ?? '');
            if (!lobby || lobby.host !== socket.id) return;

            clearLobbyTimers(lobby);
            lobby.started = false;
            lobby.currentRound = 0;
            lobby.totalScores = {};
            lobby.roundHistory = [];
            lobby.emojis = {};
            lobby.stories = {};
            lobby.guesses = {};
            lobby.leaderboard = {};
            lobby.leaderboardDetails = {};
            lobby.resultsState = null;
            lobby.assignments = {};
            lobby.teams = null;
            lobby.lastActivity = Date.now();

            store.saveLobby(roomCode ?? '', lobby).catch((err) => log.error({ err }, 'Redis save failed'));

            log.info({ roomCode }, 'New game (back to lobby)');
            io.to(roomCode ?? '').emit('back-to-lobby', { players: lobby.players, settings: lobby.settings });
        } catch (err) {
            log.error({ err, socketId: socket.id }, 'Error in new-game');
        }
    });
}
