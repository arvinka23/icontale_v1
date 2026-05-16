// Shared context passed to every socket handler module.

import type { Server } from 'socket.io';
import type { Lobby, GameSettings, DisconnectedSession } from '../types';
import type { GameFlowDeps } from '../game-flow';

export interface HandlerMetrics {
    lobbyEvents: { inc: (labels: { type: string }) => void };
    storiesSubmitted: { inc: () => void };
    guessesSubmitted: { inc: () => void };
}

export interface HandlerContext {
    io: Server;
    lobbies: Record<string, Lobby>;
    disconnectedSessions: Map<string, DisconnectedSession>;
    deps: GameFlowDeps;
    getLobby: (code: string) => Lobby | null;
    clearLobbyTimers: (lobby: Lobby) => void;
    defaultSettings: GameSettings;
    maxLobbies: number;
    maxPlayersPerLobby: number;
    reconnectTimeout: number;
    metrics: HandlerMetrics;
}
