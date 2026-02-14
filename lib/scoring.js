// ═══════════════════════════════════════════════════════════════
//  Scoring Module — all point calculations in one place
// ═══════════════════════════════════════════════════════════════

/**
 * Get a player's display name from a lobby.
 * @param {object} lobby
 * @param {string} pid  socket id
 * @returns {string}
 */
function getPlayerName(lobby, pid) {
    const p = lobby.players.find(x => x.id === pid);
    return p ? p.name : 'Unknown';
}

/**
 * Compare two arrays by JSON string (emoji combos).
 * @param {any[]} a
 * @param {any[]} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

// ── Point Constants ─────────────────────────────────────────
const POINTS = {
    classic: {
        NOBODY_GUESSED_EMOJI:  1,   // Author earns if nobody guessed their emoji
        NOBODY_GUESSED_AUTHOR: 1,   // Author earns if nobody guessed them
        AUTHOR_EMOJI_GUESSED:  2,   // Per correct guesser (emoji)
        AUTHOR_ID_GUESSED:     2,   // Per correct guesser (author)
        GUESSER_EMOJI_CORRECT: 0.5, // Guesser earns for correct emoji
        GUESSER_AUTHOR_CORRECT: 0.5,// Guesser earns for correct author (only if emoji also correct)
    },
    blind: {
        NOBODY_GUESSED_AUTHOR: 2,   // Author earns if nobody guessed them
        AUTHOR_ID_GUESSED:     3,   // Per correct guesser
        GUESSER_AUTHOR_CORRECT: 1,  // Guesser earns for correct author
    },
};

/**
 * Process results for a completed round.
 *
 * Mutates `lobby.leaderboard` with the scores and returns a structured
 * results object ready to be emitted to clients.
 *
 * @param {object} lobby  The lobby object (from lobbies map)
 * @returns {{ results: object[], leaderboardDetails: object, teamScores: object|null }}
 */
function processRoundResults(lobby) {
    const { settings, assignments } = lobby;
    const isBlind = settings.gameMode === 'blind';
    const pts = isBlind ? POINTS.blind : POINTS.classic;

    if (!lobby.leaderboard) lobby.leaderboard = {};
    const results = [];
    const leaderboardDetails = {};

    // ── Per-author scoring ──────────────────────────────────
    for (const author of lobby.players) {
        const story  = lobby.stories[author.id] || '';
        const emojis = lobby.emojis[author.id];

        // All guesses submitted
        const allGuesses = Object.entries(lobby.guesses).filter(([, g]) => g.guess);

        // Who was assigned to read this author's story?
        const guessersForStory = Object.entries(assignments)
            .filter(([, assignedAuthor]) => assignedAuthor === author.id)
            .map(([guesserId]) => guesserId);

        let emojiGuessers  = [];
        let authorGuessers = [];

        if (!isBlind) {
            // Correct emoji guessers
            emojiGuessers = allGuesses
                .filter(([pid]) => guessersForStory.includes(pid))
                .filter(([, g]) => arraysEqual(g.guess.emojiCombo, emojis))
                .map(([pid]) => pid);

            // Correct author guessers (must also have correct emoji)
            authorGuessers = allGuesses
                .filter(([pid]) => guessersForStory.includes(pid))
                .filter(([, g]) => arraysEqual(g.guess.emojiCombo, emojis) && g.guess.playerId === author.id)
                .map(([pid]) => pid);
        } else {
            // Blind mode: only author guessing
            authorGuessers = allGuesses
                .filter(([pid]) => guessersForStory.includes(pid))
                .filter(([, g]) => g.guess.playerId === author.id)
                .map(([pid]) => pid);
        }

        results.push({
            author:         author.name,
            authorId:       author.id,
            emojis,
            story,
            emojiGuessers:  emojiGuessers.map(pid => getPlayerName(lobby, pid)),
            authorGuessers: authorGuessers.map(pid => getPlayerName(lobby, pid)),
            guesses:        allGuesses.map(([pid, g]) => ({ playerId: pid, guess: g.guess })),
        });

        // Initialize detail tracking
        leaderboardDetails[author.id] = { personal: [], earned: [] };

        if (!isBlind) {
            if (emojiGuessers.length === 0) {
                addPoints(lobby, author.id, pts.NOBODY_GUESSED_EMOJI);
                leaderboardDetails[author.id].personal.push({
                    reason: `Niemand hat dein Emoji erraten (+${pts.NOBODY_GUESSED_EMOJI})`,
                    value: pts.NOBODY_GUESSED_EMOJI,
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
                const p = emojiGuessers.length * pts.AUTHOR_EMOJI_GUESSED;
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
            // Blind mode author scoring
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
        const details = [];

        if (!isBlind) {
            if (guess.emojiCombo && arraysEqual(guess.emojiCombo, correctEmojis)) {
                addPoints(lobby, player.id, pts.GUESSER_EMOJI_CORRECT);
                details.push({ reason: `Emoji richtig erraten (+${pts.GUESSER_EMOJI_CORRECT})`, value: pts.GUESSER_EMOJI_CORRECT });
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

    // ── Team scores ─────────────────────────────────────────
    const teamScores = calculateTeamScores(lobby);

    return { results, leaderboardDetails, teamScores };
}

/**
 * Calculate team scores from current leaderboard.
 * @param {object} lobby
 * @returns {object|null}
 */
function calculateTeamScores(lobby) {
    if (!lobby.teams) return null;

    const teamScores = { A: 0, B: 0 };
    for (const pid of lobby.teams.A) teamScores.A += (lobby.leaderboard?.[pid] || 0);
    for (const pid of lobby.teams.B) teamScores.B += (lobby.leaderboard?.[pid] || 0);
    return teamScores;
}

/**
 * Add points to a player's leaderboard entry.
 * @param {object} lobby
 * @param {string} pid
 * @param {number} amount
 */
function addPoints(lobby, pid, amount) {
    lobby.leaderboard[pid] = (lobby.leaderboard[pid] || 0) + amount;
}

module.exports = {
    processRoundResults,
    calculateTeamScores,
    getPlayerName,
    POINTS,
};
