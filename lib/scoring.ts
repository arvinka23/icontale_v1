// ═══════════════════════════════════════════════════════════════
//  Scoring Module — all point calculations in one place
// ═══════════════════════════════════════════════════════════════

import type {
    Lobby, Player, Guess, ResultEntry, LeaderboardDetail,
    PointDetail, PointConfig,
} from './types';

function getPlayerName(lobby: Lobby, pid: string): string {
    const p = lobby.players.find((x) => x.id === pid);
    return p ? p.name : 'Unknown';
}

function arraysEqual(a: unknown, b: unknown): boolean {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

// ── Point Constants ─────────────────────────────────────────

export const POINTS: Record<'classic' | 'blind', PointConfig> = {
    classic: {
        NOBODY_GUESSED_EMOJI: 1,
        NOBODY_GUESSED_AUTHOR: 1,
        AUTHOR_EMOJI_GUESSED: 2,
        AUTHOR_ID_GUESSED: 2,
        GUESSER_EMOJI_CORRECT: 0.5,
        GUESSER_AUTHOR_CORRECT: 0.5,
    },
    blind: {
        NOBODY_GUESSED_AUTHOR: 2,
        AUTHOR_ID_GUESSED: 3,
        GUESSER_AUTHOR_CORRECT: 1,
    },
};

function addPoints(lobby: Lobby, pid: string, amount: number): void {
    lobby.leaderboard[pid] = (lobby.leaderboard[pid] || 0) + amount;
}

// ── Process Results ─────────────────────────────────────────

export interface ProcessedResults {
    results: ResultEntry[];
    leaderboardDetails: Record<string, LeaderboardDetail>;
    teamScores: { A: number; B: number } | null;
}

export function processRoundResults(lobby: Lobby): ProcessedResults {
    const { settings, assignments } = lobby;
    const isBlind = settings.gameMode === 'blind';
    const pts = isBlind ? POINTS.blind : POINTS.classic;

    if (!lobby.leaderboard) lobby.leaderboard = {};
    const results: ResultEntry[] = [];
    const leaderboardDetails: Record<string, LeaderboardDetail> = {};

    // ── Per-author scoring ──────────────────────────────────
    for (const author of lobby.players) {
        const story = lobby.stories[author.id] || '';
        const emojis = lobby.emojis[author.id];

        const allGuesses = Object.entries(lobby.guesses).filter(([, g]) => g.guess);

        const guessersForStory = Object.entries(assignments)
            .filter(([, assignedAuthor]) => assignedAuthor === author.id)
            .map(([guesserId]) => guesserId);

        let emojiGuessers: string[] = [];
        let authorGuessers: string[] = [];

        if (!isBlind) {
            emojiGuessers = allGuesses
                .filter(([pid]) => guessersForStory.includes(pid))
                .filter(([, g]) => arraysEqual(g.guess.emojiCombo, emojis))
                .map(([pid]) => pid);

            authorGuessers = allGuesses
                .filter(([pid]) => guessersForStory.includes(pid))
                .filter(([, g]) => arraysEqual(g.guess.emojiCombo, emojis) && g.guess.playerId === author.id)
                .map(([pid]) => pid);
        } else {
            authorGuessers = allGuesses
                .filter(([pid]) => guessersForStory.includes(pid))
                .filter(([, g]) => g.guess.playerId === author.id)
                .map(([pid]) => pid);
        }

        results.push({
            author: author.name,
            authorId: author.id,
            emojis,
            story,
            emojiGuessers: emojiGuessers.map((pid) => getPlayerName(lobby, pid)),
            authorGuessers: authorGuessers.map((pid) => getPlayerName(lobby, pid)),
            guesses: allGuesses.map(([pid, g]) => ({ playerId: pid, guess: g.guess })),
        });

        leaderboardDetails[author.id] = { personal: [], earned: [] };

        if (!isBlind) {
            if (emojiGuessers.length === 0) {
                addPoints(lobby, author.id, pts.NOBODY_GUESSED_EMOJI!);
                leaderboardDetails[author.id].personal.push({
                    reason: `Niemand hat dein Emoji erraten (+${pts.NOBODY_GUESSED_EMOJI})`,
                    value: pts.NOBODY_GUESSED_EMOJI!,
                });
            }
            if (authorGuessers.length === 0) {
                addPoints(lobby, author.id, pts.NOBODY_GUESSED_AUTHOR);
                leaderboardDetails[author.id].personal.push({
                    reason: `Niemand hat dich als Autor erraten (+${pts.NOBODY_GUESSED_AUTHOR})`,
                    value: pts.NOBODY_GUESSED_AUTHOR,
                });
            }
            if (emojiGuessers.length > 0) {
                const p = emojiGuessers.length * pts.AUTHOR_EMOJI_GUESSED!;
                addPoints(lobby, author.id, p);
                leaderboardDetails[author.id].personal.push({
                    reason: `Emoji erraten von ${emojiGuessers.length} (+${p})`,
                    value: p,
                });
            }
            if (authorGuessers.length > 0) {
                const p = authorGuessers.length * pts.AUTHOR_ID_GUESSED;
                addPoints(lobby, author.id, p);
                leaderboardDetails[author.id].personal.push({
                    reason: `Als Autor erraten von ${authorGuessers.length} (+${p})`,
                    value: p,
                });
            }
        } else {
            if (authorGuessers.length === 0) {
                addPoints(lobby, author.id, pts.NOBODY_GUESSED_AUTHOR);
                leaderboardDetails[author.id].personal.push({
                    reason: `Niemand hat dich erraten (+${pts.NOBODY_GUESSED_AUTHOR})`,
                    value: pts.NOBODY_GUESSED_AUTHOR,
                });
            }
            if (authorGuessers.length > 0) {
                const p = authorGuessers.length * pts.AUTHOR_ID_GUESSED;
                addPoints(lobby, author.id, p);
                leaderboardDetails[author.id].personal.push({
                    reason: `Erraten von ${authorGuessers.length} (+${p})`,
                    value: p,
                });
            }
        }
    }

    // ── Guesser perspective scoring ─────────────────────────
    for (const player of lobby.players) {
        const entry = lobby.guesses[player.id];
        if (!entry || !entry.guess) continue;

        const guess = entry.guess;
        const assignedAuthorId = assignments[player.id];
        if (!assignedAuthorId) continue;

        const correctEmojis = lobby.emojis[assignedAuthorId];
        if (!leaderboardDetails[player.id]) {
            leaderboardDetails[player.id] = { personal: [], earned: [] };
        }
        const details: PointDetail[] = [];

        if (!isBlind) {
            if (guess.emojiCombo && arraysEqual(guess.emojiCombo, correctEmojis)) {
                addPoints(lobby, player.id, pts.GUESSER_EMOJI_CORRECT!);
                details.push({ reason: `Emoji richtig erraten (+${pts.GUESSER_EMOJI_CORRECT})`, value: pts.GUESSER_EMOJI_CORRECT! });
            }
            if (
                guess.emojiCombo &&
                arraysEqual(guess.emojiCombo, correctEmojis) &&
                guess.playerId === assignedAuthorId
            ) {
                addPoints(lobby, player.id, pts.GUESSER_AUTHOR_CORRECT);
                details.push({ reason: `Autor richtig erraten (+${pts.GUESSER_AUTHOR_CORRECT})`, value: pts.GUESSER_AUTHOR_CORRECT });
            }
        } else {
            if (guess.playerId === assignedAuthorId) {
                addPoints(lobby, player.id, pts.GUESSER_AUTHOR_CORRECT);
                details.push({ reason: `Autor richtig erraten (+${pts.GUESSER_AUTHOR_CORRECT})`, value: pts.GUESSER_AUTHOR_CORRECT });
            }
        }

        leaderboardDetails[player.id].earned = details;
    }

    const teamScores = calculateTeamScores(lobby);

    return { results, leaderboardDetails, teamScores };
}

export function calculateTeamScores(lobby: Lobby): { A: number; B: number } | null {
    if (!lobby.teams) return null;

    const teamScores = { A: 0, B: 0 };
    for (const pid of lobby.teams.A) teamScores.A += (lobby.leaderboard?.[pid] || 0);
    for (const pid of lobby.teams.B) teamScores.B += (lobby.leaderboard?.[pid] || 0);
    return teamScores;
}

export { getPlayerName, arraysEqual };
