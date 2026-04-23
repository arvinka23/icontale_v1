// ═══════════════════════════════════════════════════════════════
//  Client-side ambient types
//
//  Re-exports the handful of types the client needs from the shared
//  server definitions in /lib/types.ts. Keeping this file in the
//  same folder as the JS modules means the TypeScript checker picks
//  them up automatically during `tsc --noEmit` runs (see
//  tsconfig.client.json), and editor tooling resolves imports as if
//  the JS modules were TypeScript.
//
//  No runtime artefacts are produced from this file.
// ═══════════════════════════════════════════════════════════════

export {
    GameMode,
    GameSettings,
    Player,
    Guess,
    ResultEntry,
    LeaderboardDetail,
    Teams,
    Replay,
    ReplayEvent,
    ReplayEventType,
} from '../../lib/types';

/** A subset of the Socket.io client typings we actually use. */
export interface ClientSocket {
    id?: string;
    connected: boolean;
    on(event: string, handler: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    connect(): void;
    disconnect(): void;
    io: {
        on(event: string, handler: (...args: unknown[]) => void): void;
    };
}

/** The central reactive state object shared by public/js modules. */
export interface IconTaleState {
    phase: string;
    roomCode: string | null;
    isHost: boolean;
    isSpectator: boolean;
    settings: Partial<GameSettings> | Record<string, unknown>;
    storySubmitted: boolean;
    guessSubmitted: boolean;
    soundEnabled: boolean;
    selectedEmojiCombo: string[] | null;
    selectedPlayerId: string | null;
    resultsData: ResultEntry[] | null;
    resultsPlayers: Player[];
    currentChatIdx: number;
    currentMsgStep: number;
    lastReplayId: string | null;
    writingTimer: ReturnType<typeof setInterval> | null;
    writingTimeLeft: number;
    writingMilestonesAnnounced: Set<number> | null;
    typeTextTimers: ReturnType<typeof setInterval>[];
    errorTimeout: ReturnType<typeof setTimeout> | null;
}

/** Toast levels used by public/js/toast.js. */
export type ToastLevel = 'info' | 'success' | 'error';

export interface ToastOptions {
    duration?: number;
}
