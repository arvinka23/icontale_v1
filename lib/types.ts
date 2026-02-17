// ═══════════════════════════════════════════════════════════════
//  Shared Type Definitions
// ═══════════════════════════════════════════════════════════════

// ── Game Settings ───────────────────────────────────────────

export type GameMode = 'classic' | 'speed' | 'blind' | 'team';

export interface GameSettings {
    gameMode: GameMode;
    timerDuration: number;
    wordLimit: number;
    emojiCount: number;
    rounds: number;
    emojiPacks: string[];
}

// ── Player & Lobby ──────────────────────────────────────────

export interface Player {
    id: string;
    name: string;
    emoji: string;
    disconnected?: boolean;
    disconnectedAt?: number;
}

export interface Spectator {
    id: string;
}

export interface ResultsState {
    currentChatIdx: number;
    currentMsgStep: number;
}

export interface Teams {
    A: string[];
    B: string[];
}

export interface Lobby {
    host: string;
    players: Player[];
    spectators: Spectator[];
    settings: GameSettings;
    started: boolean;
    currentRound: number;
    totalScores: Record<string, number>;
    roundHistory: RoundHistoryEntry[];
    emojis: Record<string, string[]>;
    stories: Record<string, string>;
    guesses: Record<string, { guess: Guess }>;
    assignments: Record<string, string>;
    teams: Teams | null;
    resultsState: ResultsState | null;
    leaderboard: Record<string, number>;
    leaderboardDetails: Record<string, LeaderboardDetail>;
    writingTimeout: ReturnType<typeof setTimeout> | null;
    writingStartTime: number | null;
    lastActivity: number;
    replayLog: ReplayEvent[];
}

// ── Guess & Results ─────────────────────────────────────────

export interface Guess {
    emojiCombo?: string[];
    playerId: string;
}

export interface PointDetail {
    reason: string;
    value: number;
}

export interface LeaderboardDetail {
    personal: PointDetail[];
    earned: PointDetail[];
}

export interface ResultEntry {
    author: string;
    authorId: string;
    emojis: string[];
    story: string;
    emojiGuessers: string[];
    authorGuessers: string[];
    guesses: { playerId: string; guess: Guess }[];
}

export interface RoundHistoryEntry {
    round: number;
    leaderboard: Record<string, number>;
}

// ── Validation ──────────────────────────────────────────────

export interface ValidationResult<T = string> {
    valid: boolean;
    value: T;
    error?: string;
}

// ── Disconnected Session ────────────────────────────────────

export interface DisconnectedSession {
    roomCode: string;
    oldSocketId: string;
    playerName: string;
    playerEmoji: string;
    disconnectedAt: number;
    gamePhase: string;
}

// ── Rate Limit ──────────────────────────────────────────────

export interface RateLimitEntry {
    start: number;
    count: number;
}

// ── Achievements ────────────────────────────────────────────

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
}

export interface AchievementContext {
    playerId: string;
    lobby: Lobby;
    roundResults?: ResultEntry[];
    playerStats: PlayerStats;
}

export interface PlayerStats {
    gamesPlayed: number;
    gamesWon: number;
    modesPlayed: Set<GameMode>;
    roundsWonConsecutive: number;
    timesNeverGuessed: number;
    correctAuthorGuesses: number;
    spectatedGames: number;
    reconnectedAndWon: boolean;
    bestOf5Completed: boolean;
    fastestStoryTime?: number;
    longestStoryWords?: number;
    shortestStoryWords?: number;
}

// ── Replay ──────────────────────────────────────────────────

export type ReplayEventType =
    | 'round-start'
    | 'story-submit'
    | 'guess-submit'
    | 'results'
    | 'leaderboard'
    | 'game-over';

export interface ReplayEvent {
    timestamp: number;
    type: ReplayEventType;
    data: unknown;
}

export interface Replay {
    id: string;
    roomCode: string;
    players: Pick<Player, 'id' | 'name' | 'emoji'>[];
    settings: GameSettings;
    events: ReplayEvent[];
    createdAt: number;
}

// ── Point Constants ─────────────────────────────────────────

export interface PointConfig {
    NOBODY_GUESSED_EMOJI?: number;
    NOBODY_GUESSED_AUTHOR: number;
    AUTHOR_EMOJI_GUESSED?: number;
    AUTHOR_ID_GUESSED: number;
    GUESSER_EMOJI_CORRECT?: number;
    GUESSER_AUTHOR_CORRECT: number;
}

// ── Socket Event Payloads ───────────────────────────────────

export interface CreateLobbyPayload {
    username: string;
    emoji: string;
    settings?: Partial<GameSettings>;
}

export interface JoinLobbyPayload {
    username: string;
    roomCode: string;
    emoji: string;
}

export interface SubmitStoryPayload {
    roomCode: string;
    story: string;
}

export interface SubmitGuessPayload {
    roomCode: string;
    guess: Guess;
}

export interface RoomCodePayload {
    roomCode: string;
}

export interface UpdateSettingsPayload {
    roomCode: string;
    settings: Partial<GameSettings>;
}

export interface ReconnectSessionPayload {
    sessionToken: string;
    roomCode: string;
}
