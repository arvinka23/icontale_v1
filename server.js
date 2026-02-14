const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Emoji Packs ──────────────────────────────────────────────
const EMOJI_PACKS = {
    faces:   ['😀','😂','😍','😎','🤔','😱','🥳','😡','😭','😴','👻','🤖'],
    animals: ['🐶','🐱','🦄','🐉','🐟','🐬','🐋','🦈','🐊','🐢','🐍','🦎','🦖','🐅','🐆','🦓','🦍','🐘','🦛','🦏','🐪','🦒','🦘','🦥','🦦','🦨','🦡','🐁','🐇','🐿️','🦔'],
    food:    ['🍕','🍔','🍟','🍎','🍌','🍉','🍰','🍩','🍪','🍫','🍿','🍦','🍭','🍺','🍻','🥤','☕','🍵','🧃','🥪','🥗','🍲','🍜','🍣','🍙','🥠','🦐','🦞','🦀'],
    sports:  ['⚽','🏀','🏈','🎲','🎸','🎮','🎤','🎧','🏆','🥇','🥈','🥉','🎯','🎳','🕹️'],
    nature:  ['🌈','🔥','⭐','🌊','🌸','🌍','🌙','☀️','🌪️','🌋','❄️','🌵','🌺','🍀','🌻','🌴'],
    objects: ['📚','🧩','🖌️','🎨','🧸','🎁','🎂','🚗','✈️','🚀','💎','🔮','📱','💡','🔑','🎭']
};

function getAllEmojis(packs) {
    if (!packs || packs.length === 0 || packs.includes('all')) {
        return Object.values(EMOJI_PACKS).flat();
    }
    return packs.filter(p => EMOJI_PACKS[p]).flatMap(p => EMOJI_PACKS[p]);
}

// ── Default Settings ─────────────────────────────────────────
const DEFAULT_SETTINGS = {
    gameMode:      'classic',   // classic | speed | blind | team
    timerDuration: 180,         // seconds
    wordLimit:     500,
    emojiCount:    3,
    rounds:        1,           // 1 | 3 | 5
    emojiPacks:    ['all']
};

const MODE_DESCRIPTIONS = {
    classic: 'Write stories, guess emojis + author.',
    speed:   '60 s timer, max 100 words — be fast!',
    blind:   'No emoji options when guessing — only guess the author.',
    team:    'Players split into two teams. Team scores count!'
};

// ── Helpers ──────────────────────────────────────────────────
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function getRandomEmojis(count, packs) {
    const pool = getAllEmojis(packs);
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, pool.length));
}

function getPlayerName(lobby, pid) {
    const p = lobby.players.find(x => x.id === pid);
    return p ? p.name : 'Unknown';
}

// ── In-memory lobbies ────────────────────────────────────────
const lobbies = {};

// Clean up abandoned lobbies every 5 min
setInterval(() => {
    const now = Date.now();
    for (const code in lobbies) {
        const lobby = lobbies[code];
        if (lobby.players.length === 0 || (now - lobby.lastActivity > 30 * 60 * 1000)) {
            if (lobby.writingTimeout) clearTimeout(lobby.writingTimeout);
            delete lobbies[code];
            io.to(code).emit('lobby-closed');
        }
    }
}, 5 * 60 * 1000);

// ── Socket.io ────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('connected:', socket.id);

    // ── Create lobby ─────────────────────────────────────────
    socket.on('create-lobby', ({ username, emoji, settings }) => {
        const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
        if (merged.gameMode === 'speed') {
            merged.timerDuration = 60;
            merged.wordLimit = 100;
        }

        const roomCode = generateRoomCode();
        lobbies[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: username, emoji }],
            spectators: [],
            settings: merged,
            started: false,
            currentRound: 0,
            totalScores: {},
            roundHistory: [],
            emojis: {},
            stories: {},
            guesses: {},
            teams: null,
            lastActivity: Date.now()
        };

        socket.join(roomCode);
        socket.emit('lobby-created', { roomCode, players: lobbies[roomCode].players, settings: merged });
        io.to(roomCode).emit('players-update', lobbies[roomCode].players);
    });

    // ── Join lobby ───────────────────────────────────────────
    socket.on('join-lobby', ({ username, roomCode, emoji }) => {
        const lobby = lobbies[roomCode];
        if (!lobby)            return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });
        if (lobby.started)     return socket.emit('lobby-error', { message: 'Spiel bereits gestartet.' });
        if (lobby.players.length >= 20) return socket.emit('lobby-error', { message: 'Lobby ist voll (max 20).' });

        lobby.players.push({ id: socket.id, name: username, emoji });
        lobby.lastActivity = Date.now();
        socket.join(roomCode);
        socket.emit('lobby-joined', { roomCode, players: lobby.players, settings: lobby.settings });
        io.to(roomCode).emit('players-update', lobby.players);
    });

    // ── Join as spectator ────────────────────────────────────
    socket.on('join-spectator', ({ roomCode }) => {
        const lobby = lobbies[roomCode];
        if (!lobby) return socket.emit('lobby-error', { message: 'Lobby nicht gefunden.' });

        lobby.spectators.push({ id: socket.id });
        socket.join(roomCode);
        socket.emit('spectator-joined', {
            roomCode,
            players: lobby.players,
            spectators: lobby.spectators,
            settings: lobby.settings,
            started: lobby.started,
            currentRound: lobby.currentRound,
            totalRounds: lobby.settings.rounds
        });
        io.to(roomCode).emit('spectators-update', lobby.spectators);
    });

    // ── Update settings (host only) ─────────────────────────
    socket.on('update-settings', ({ roomCode, settings }) => {
        const lobby = lobbies[roomCode];
        if (!lobby || lobby.host !== socket.id || lobby.started) return;

        lobby.settings = { ...lobby.settings, ...settings };
        if (lobby.settings.gameMode === 'speed') {
            lobby.settings.timerDuration = 60;
            lobby.settings.wordLimit = 100;
        }
        lobby.lastActivity = Date.now();
        io.to(roomCode).emit('settings-update', lobby.settings);
    });

    // ── Start game ───────────────────────────────────────────
    socket.on('start-game', ({ roomCode }) => {
        const lobby = lobbies[roomCode];
        if (!lobby || lobby.host !== socket.id) return;
        if (lobby.started) return;
        if (lobby.players.length < 3) {
            return socket.emit('lobby-error', { message: 'Mindestens 3 Spieler nötig.' });
        }

        lobby.started = true;
        lobby.lastActivity = Date.now();

        // Team mode: auto-assign
        if (lobby.settings.gameMode === 'team') {
            const shuffled = [...lobby.players].sort(() => 0.5 - Math.random());
            const mid = Math.ceil(shuffled.length / 2);
            lobby.teams = {
                A: shuffled.slice(0, mid).map(p => p.id),
                B: shuffled.slice(mid).map(p => p.id)
            };
            io.to(roomCode).emit('teams-assigned', {
                teams: lobby.teams,
                players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji }))
            });
        }

        startRound(roomCode);
    });

    // ── Submit story ─────────────────────────────────────────
    socket.on('submit-story', ({ roomCode, story }) => {
        const lobby = lobbies[roomCode];
        if (!lobby || !lobby.started) return;

        const words = story.trim().split(/\s+/).filter(Boolean).length;
        if (words > lobby.settings.wordLimit) {
            return socket.emit('story-error', { message: `Max ${lobby.settings.wordLimit} Wörter erlaubt.` });
        }

        lobby.stories[socket.id] = story;
        lobby.lastActivity = Date.now();

        io.to(roomCode).emit('writing-progress', {
            submitted: Object.keys(lobby.stories).length,
            total: lobby.players.length
        });

        if (Object.keys(lobby.stories).length === lobby.players.length) {
            if (lobby.writingTimeout) clearTimeout(lobby.writingTimeout);
            startGuessingPhase(roomCode);
        }
    });

    // ── Submit guess ─────────────────────────────────────────
    socket.on('submit-guess', ({ roomCode, guess }) => {
        const lobby = lobbies[roomCode];
        if (!lobby) return;
        if (!lobby.guesses) lobby.guesses = {};

        lobby.guesses[socket.id] = { guess };
        lobby.lastActivity = Date.now();

        io.to(roomCode).emit('guessing-progress', {
            submitted: Object.keys(lobby.guesses).length,
            total: lobby.players.length
        });

        if (Object.keys(lobby.guesses).length === lobby.players.length) {
            processResults(roomCode);
        }
    });

    // ── Results continue (host) ──────────────────────────────
    socket.on('results-continue', ({ roomCode }) => {
        const lobby = lobbies[roomCode];
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
        io.to(roomCode).emit('results-progress', lobby.resultsState);
    });

    // ── Leaderboard phase (host) ─────────────────────────────
    socket.on('leaderboard-phase', ({ roomCode }) => {
        const lobby = lobbies[roomCode];
        if (!lobby) return;

        let teamScores = null;
        if (lobby.teams) {
            teamScores = { A: 0, B: 0 };
            for (const pid of lobby.teams.A) teamScores.A += (lobby.leaderboard?.[pid] || 0);
            for (const pid of lobby.teams.B) teamScores.B += (lobby.leaderboard?.[pid] || 0);
        }

        io.to(roomCode).emit('leaderboard-phase', {
            leaderboard: lobby.leaderboard,
            leaderboardDetails: lobby.leaderboardDetails,
            players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
            teams: lobby.teams,
            teamScores,
            currentRound: lobby.currentRound,
            totalRounds: lobby.settings.rounds,
            totalScores: lobby.totalScores
        });
    });

    // ── Next round (host, multi-round) ───────────────────────
    socket.on('next-round', ({ roomCode }) => {
        const lobby = lobbies[roomCode];
        if (!lobby || lobby.host !== socket.id) return;

        // Accumulate scores
        for (const [pid, score] of Object.entries(lobby.leaderboard || {})) {
            lobby.totalScores[pid] = (lobby.totalScores[pid] || 0) + score;
        }

        if (lobby.currentRound < lobby.settings.rounds) {
            lobby.roundHistory.push({
                round: lobby.currentRound,
                leaderboard: { ...lobby.leaderboard }
            });

            // Reset round state
            lobby.emojis = {};
            lobby.stories = {};
            lobby.guesses = {};
            lobby.leaderboard = {};
            lobby.leaderboardDetails = {};
            lobby.resultsState = null;

            startRound(roomCode);
        } else {
            // Final game over
            io.to(roomCode).emit('game-over', {
                totalScores: lobby.totalScores,
                roundHistory: lobby.roundHistory,
                players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
                teams: lobby.teams
            });
        }
    });

    // ── New game (back to lobby) ─────────────────────────────
    socket.on('new-game', ({ roomCode }) => {
        const lobby = lobbies[roomCode];
        if (!lobby || lobby.host !== socket.id) return;

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
        lobby.teams = null;
        lobby.lastActivity = Date.now();

        io.to(roomCode).emit('back-to-lobby', {
            players: lobby.players,
            settings: lobby.settings
        });
    });

    // ── Disconnect ───────────────────────────────────────────
    socket.on('disconnect', () => {
        for (const code in lobbies) {
            const lobby = lobbies[code];
            lobby.spectators = lobby.spectators.filter(s => s.id !== socket.id);

            const wasPlayer = lobby.players.some(p => p.id === socket.id);
            lobby.players = lobby.players.filter(p => p.id !== socket.id);
            delete lobby.emojis?.[socket.id];
            delete lobby.stories?.[socket.id];

            if (lobby.host === socket.id || lobby.players.length === 0) {
                if (lobby.writingTimeout) clearTimeout(lobby.writingTimeout);
                delete lobbies[code];
                io.to(code).emit('lobby-closed');
            } else if (wasPlayer) {
                io.to(code).emit('players-update', lobby.players);
            }
        }
        console.log('disconnected:', socket.id);
    });
});

// ── Game flow functions ──────────────────────────────────────

function startRound(roomCode) {
    const lobby = lobbies[roomCode];
    if (!lobby) return;

    lobby.currentRound++;
    lobby.stories = {};
    lobby.guesses = {};
    const { settings } = lobby;

    // Assign emojis
    lobby.players.forEach(p => {
        lobby.emojis[p.id] = getRandomEmojis(settings.emojiCount, settings.emojiPacks);
    });

    const writingStartTime = Date.now();
    lobby.writingStartTime = writingStartTime;

    // Timer
    if (lobby.writingTimeout) clearTimeout(lobby.writingTimeout);
    lobby.writingTimeout = setTimeout(() => {
        if (lobby && lobby.started && Object.keys(lobby.stories).length < lobby.players.length) {
            startGuessingPhase(roomCode);
        }
    }, settings.timerDuration * 1000);

    // Send each player their emojis
    lobby.players.forEach(p => {
        io.to(p.id).emit('round-started', {
            emojis: lobby.emojis[p.id],
            writingStartTime,
            currentRound: lobby.currentRound,
            totalRounds: settings.rounds,
            settings
        });
    });

    // Notify spectators
    lobby.spectators.forEach(s => {
        io.to(s.id).emit('spectator-round-started', {
            currentRound: lobby.currentRound,
            totalRounds: settings.rounds,
            settings
        });
    });

    io.to(roomCode).emit('game-started', {
        currentRound: lobby.currentRound,
        totalRounds: settings.rounds,
        gameMode: settings.gameMode
    });
}

function startGuessingPhase(roomCode) {
    const lobby = lobbies[roomCode];
    if (!lobby) return;

    const playerIds = lobby.players.map(p => p.id);

    // Derangement (no player reads own story)
    let assignments = {};
    let deranged = false;
    let attempts = 0;
    while (!deranged && attempts < 1000) {
        attempts++;
        const shuffled = [...playerIds].sort(() => 0.5 - Math.random());
        deranged = true;
        for (let i = 0; i < playerIds.length; i++) {
            if (playerIds[i] === shuffled[i]) { deranged = false; break; }
        }
        if (deranged) {
            for (let i = 0; i < playerIds.length; i++) {
                assignments[playerIds[i]] = shuffled[i];
            }
        }
    }

    lobby.assignments = assignments;
    const { settings } = lobby;

    playerIds.forEach(id => {
        const authorId = assignments[id];
        const story = lobby.stories[authorId] || '';
        const correctEmojis = lobby.emojis[authorId];

        let emojiOptions = null;
        if (settings.gameMode !== 'blind') {
            const combos = [correctEmojis];
            while (combos.length < 6) {
                const combo = getRandomEmojis(settings.emojiCount, settings.emojiPacks);
                if (!combos.some(arr => arr.join() === combo.join())) combos.push(combo);
            }
            combos.sort(() => 0.5 - Math.random());
            emojiOptions = combos;
        }

        io.to(id).emit('guess-phase', {
            story,
            emojiOptions,
            correctEmojis,
            players: lobby.players.filter(p => p.id !== id).map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
            authorId,
            gameMode: settings.gameMode
        });
    });

    lobby.spectators.forEach(s => {
        io.to(s.id).emit('spectator-guess-phase');
    });
}

function processResults(roomCode) {
    const lobby = lobbies[roomCode];
    if (!lobby) return;
    if (!lobby.leaderboard) lobby.leaderboard = {};

    const { settings, assignments } = lobby;
    const isBlind = settings.gameMode === 'blind';
    const results = [];
    const leaderboardDetails = {};

    // Per-author scoring
    lobby.players.forEach(author => {
        const story = lobby.stories[author.id] || '';
        const emojis = lobby.emojis[author.id];
        const allGuesses = Object.entries(lobby.guesses).filter(([, g]) => g.guess);

        // Find who was assigned to guess this author's story
        const guessersForThisStory = Object.entries(assignments)
            .filter(([, assignedAuthor]) => assignedAuthor === author.id)
            .map(([guesserId]) => guesserId);

        let emojiGuessers = [];
        let authorGuessers = [];

        if (!isBlind) {
            emojiGuessers = allGuesses
                .filter(([pid]) => guessersForThisStory.includes(pid))
                .filter(([, g]) => JSON.stringify(g.guess.emojiCombo) === JSON.stringify(emojis))
                .map(([pid]) => pid);
            authorGuessers = allGuesses
                .filter(([pid]) => guessersForThisStory.includes(pid))
                .filter(([, g]) => JSON.stringify(g.guess.emojiCombo) === JSON.stringify(emojis) && g.guess.playerId === author.id)
                .map(([pid]) => pid);
        } else {
            authorGuessers = allGuesses
                .filter(([pid]) => guessersForThisStory.includes(pid))
                .filter(([, g]) => g.guess.playerId === author.id)
                .map(([pid]) => pid);
        }

        results.push({
            author: author.name,
            authorId: author.id,
            emojis,
            story,
            emojiGuessers: emojiGuessers.map(pid => getPlayerName(lobby, pid)),
            authorGuessers: authorGuessers.map(pid => getPlayerName(lobby, pid)),
            guesses: allGuesses.map(([pid, g]) => ({ playerId: pid, guess: g.guess }))
        });

        leaderboardDetails[author.id] = { personal: [], earned: [] };

        if (!isBlind) {
            if (emojiGuessers.length === 0) {
                lobby.leaderboard[author.id] = (lobby.leaderboard[author.id] || 0) + 1;
                leaderboardDetails[author.id].personal.push({ reason: 'Niemand hat dein Emoji erraten (+1)', value: 1 });
            }
            if (authorGuessers.length === 0) {
                lobby.leaderboard[author.id] = (lobby.leaderboard[author.id] || 0) + 1;
                leaderboardDetails[author.id].personal.push({ reason: 'Niemand hat dich als Autor erraten (+1)', value: 1 });
            }
            if (emojiGuessers.length > 0) {
                const pts = emojiGuessers.length * 2;
                lobby.leaderboard[author.id] = (lobby.leaderboard[author.id] || 0) + pts;
                leaderboardDetails[author.id].personal.push({ reason: `Emoji erraten von ${emojiGuessers.length} (+${pts})`, value: pts });
            }
            if (authorGuessers.length > 0) {
                const pts = authorGuessers.length * 2;
                lobby.leaderboard[author.id] = (lobby.leaderboard[author.id] || 0) + pts;
                leaderboardDetails[author.id].personal.push({ reason: `Als Autor erraten von ${authorGuessers.length} (+${pts})`, value: pts });
            }
        } else {
            if (authorGuessers.length === 0) {
                lobby.leaderboard[author.id] = (lobby.leaderboard[author.id] || 0) + 2;
                leaderboardDetails[author.id].personal.push({ reason: 'Niemand hat dich erraten (+2)', value: 2 });
            }
            if (authorGuessers.length > 0) {
                const pts = authorGuessers.length * 3;
                lobby.leaderboard[author.id] = (lobby.leaderboard[author.id] || 0) + pts;
                leaderboardDetails[author.id].personal.push({ reason: `Erraten von ${authorGuessers.length} (+${pts})`, value: pts });
            }
        }
    });

    // Points for correct guesses (guesser perspective)
    lobby.players.forEach(player => {
        const entry = lobby.guesses[player.id];
        if (!entry || !entry.guess) return;
        const guess = entry.guess;
        const assignedAuthorId = assignments[player.id];
        if (!assignedAuthorId) return;

        const correctEmojis = lobby.emojis[assignedAuthorId];
        if (!leaderboardDetails[player.id]) leaderboardDetails[player.id] = { personal: [], earned: [] };
        const details = [];

        if (!isBlind) {
            if (guess.emojiCombo && JSON.stringify(guess.emojiCombo) === JSON.stringify(correctEmojis)) {
                lobby.leaderboard[player.id] = (lobby.leaderboard[player.id] || 0) + 0.5;
                details.push({ reason: 'Emoji richtig erraten (+0.5)', value: 0.5 });
            }
            if (guess.emojiCombo && JSON.stringify(guess.emojiCombo) === JSON.stringify(correctEmojis) && guess.playerId === assignedAuthorId) {
                lobby.leaderboard[player.id] = (lobby.leaderboard[player.id] || 0) + 0.5;
                details.push({ reason: 'Autor richtig erraten (+0.5)', value: 0.5 });
            }
        } else {
            if (guess.playerId === assignedAuthorId) {
                lobby.leaderboard[player.id] = (lobby.leaderboard[player.id] || 0) + 1;
                details.push({ reason: 'Autor richtig erraten (+1)', value: 1 });
            }
        }

        leaderboardDetails[player.id].earned = details;
    });

    // Team scores
    let teamScores = null;
    if (lobby.teams) {
        teamScores = { A: 0, B: 0 };
        for (const pid of lobby.teams.A) teamScores.A += (lobby.leaderboard[pid] || 0);
        for (const pid of lobby.teams.B) teamScores.B += (lobby.leaderboard[pid] || 0);
    }

    lobby.resultsState = { currentChatIdx: 0, currentMsgStep: 0 };
    lobby.leaderboardDetails = leaderboardDetails;

    io.to(roomCode).emit('results-phase', {
        results,
        leaderboard: lobby.leaderboard,
        players: lobby.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji })),
        resultsState: lobby.resultsState,
        teams: lobby.teams,
        teamScores,
        currentRound: lobby.currentRound,
        totalRounds: lobby.settings.rounds,
        gameMode: lobby.settings.gameMode
    });
}

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`IconTale server running on port ${PORT}`);
});
