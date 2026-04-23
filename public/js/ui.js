// ═══════════════════════════════════════════════════════════════
//  UI Module — All rendering and interaction logic
// ═══════════════════════════════════════════════════════════════

import { EMOJIS, EMOJI_NAMES, MODE_DESCRIPTIONS } from './constants.js';
import { state, Phase, setPhase, forcePhase, resetGameState } from './state.js';
import { dom, hideAllSections, formatTime, typeText } from './dom.js';
import { playClick, playSuccess, playTick } from './sounds.js';

// ── Emoji Selection ─────────────────────────────────────────

function getRandomEmoji() {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

export function setUserEmoji(emoji) {
    dom.userEmoji.textContent = emoji;
    localStorage.setItem('icontale_user_emoji', emoji);
}

export function loadUserEmoji() {
    const saved = localStorage.getItem('icontale_user_emoji');
    setUserEmoji(saved || getRandomEmoji());
}

export function randomizeEmoji() {
    let e;
    do { e = getRandomEmoji(); } while (e === dom.userEmoji.textContent);
    setUserEmoji(e);
    playClick();
}

// ── Tab Switching ───────────────────────────────────────────

export function setTab(tab) {
    if (tab === 'create') {
        dom.tabCreate.classList.add('active');
        dom.tabJoin.classList.remove('active');
        dom.roomCodeGroup.classList.add('hidden');
        dom.spectatorBtn.classList.add('hidden');
        dom.menuActionBtn.innerHTML = '<span class="btn-icon">🚀</span> Lobby erstellen';
        dom.tabCreate.setAttribute('aria-selected', 'true');
        dom.tabJoin.setAttribute('aria-selected', 'false');
    } else {
        dom.tabCreate.classList.remove('active');
        dom.tabJoin.classList.add('active');
        dom.roomCodeGroup.classList.remove('hidden');
        dom.spectatorBtn.classList.remove('hidden');
        dom.menuActionBtn.innerHTML = '<span class="btn-icon">🎯</span> Lobby beitreten';
        dom.tabCreate.setAttribute('aria-selected', 'false');
        dom.tabJoin.setAttribute('aria-selected', 'true');
    }
}

// ── Settings UI ─────────────────────────────────────────────

export function initSettingsUI(emitFn) {
    setupSettingGroup('mode-options', val => {
        dom.modeDesc.textContent = MODE_DESCRIPTIONS[val] || '';
        if (val === 'speed') {
            setSettingActive('timer-options', '60');
            setSettingActive('wordlimit-options', '100');
            dom.timerGroup.classList.add('setting-locked');
            dom.wordlimitGroup.classList.add('setting-locked');
        } else {
            dom.timerGroup.classList.remove('setting-locked');
            dom.wordlimitGroup.classList.remove('setting-locked');
        }
        emitFn();
    });
    setupSettingGroup('timer-options', () => emitFn());
    setupSettingGroup('wordlimit-options', () => emitFn());
    setupSettingGroup('emojicount-options', () => emitFn());
    setupSettingGroup('rounds-options', () => emitFn());

    // Emoji packs
    const pc = dom.packOptions;
    if (pc) {
        pc.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const allCb = pc.querySelector('input[value="all"]');
                if (cb.value === 'all' && cb.checked) {
                    pc.querySelectorAll('input:not([value="all"])').forEach(c => c.checked = false);
                } else if (cb.value !== 'all' && cb.checked) {
                    allCb.checked = false;
                }
                const checked = [...pc.querySelectorAll('input:checked')].map(c => c.value);
                if (checked.length === 0) allCb.checked = true;
                emitFn();
            });
        });
    }
}

function setupSettingGroup(containerId, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.setting-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (container.closest('.setting-locked')) return;
            container.querySelectorAll('.setting-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-checked', 'true');
            playClick();
            if (onChangeCallback) onChangeCallback(btn.dataset.value);
        });
    });
}

export function setSettingActive(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.setting-btn').forEach(b => {
        const match = b.dataset.value === String(value);
        b.classList.toggle('active', match);
        b.setAttribute('aria-checked', String(match));
    });
}

export function getActiveValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    const active = container.querySelector('.setting-btn.active');
    return active ? active.dataset.value : null;
}

export function getSelectedPacks() {
    if (!dom.packOptions) return ['all'];
    const checked = [...dom.packOptions.querySelectorAll('input:checked')].map(c => c.value);
    return checked.length > 0 ? checked : ['all'];
}

export function gatherSettings() {
    return {
        gameMode:      getActiveValue('mode-options') || 'classic',
        timerDuration: parseInt(getActiveValue('timer-options')) || 180,
        wordLimit:     parseInt(getActiveValue('wordlimit-options')) || 500,
        emojiCount:    parseInt(getActiveValue('emojicount-options')) || 3,
        rounds:        parseInt(getActiveValue('rounds-options')) || 1,
        emojiPacks:    getSelectedPacks(),
    };
}

function renderSettingsDisplay(settings) {
    const modeNames = { classic: '🎭 Klassisch', speed: '⚡ Speed', blind: '🙈 Blind', team: '👥 Team' };
    dom.settingsDisplay.innerHTML = `
        <div class="settings-summary">
            <span class="setting-chip">${modeNames[settings.gameMode] || settings.gameMode}</span>
            <span class="setting-chip">⏱️ ${Math.floor(settings.timerDuration / 60)} Min</span>
            <span class="setting-chip">📝 Max ${settings.wordLimit} Wörter</span>
            <span class="setting-chip">🎲 ${settings.emojiCount} Emojis</span>
            <span class="setting-chip">🔄 ${settings.rounds} Runde${settings.rounds > 1 ? 'n' : ''}</span>
        </div>
    `;
    dom.settingsDisplay.classList.remove('hidden');
}

// ── Lobby UI ────────────────────────────────────────────────

export function showLobby(roomCode, players, settings) {
    setPhase(Phase.LOBBY) || forcePhase(Phase.LOBBY);

    hideAllSections();
    dom.lobby.classList.remove('hidden');
    dom.roomCode.textContent = roomCode;
    state.settings = settings || {};

    if (state.isHost) {
        dom.settingsPanel.classList.remove('hidden');
        dom.settingsDisplay.classList.add('hidden');
        dom.startGame.classList.remove('hidden');
        setSettingActive('mode-options', settings.gameMode);
        setSettingActive('timer-options', String(settings.timerDuration));
        setSettingActive('wordlimit-options', String(settings.wordLimit));
        setSettingActive('emojicount-options', String(settings.emojiCount));
        setSettingActive('rounds-options', String(settings.rounds));
        dom.modeDesc.textContent = MODE_DESCRIPTIONS[settings.gameMode] || '';
    } else {
        dom.settingsPanel.classList.add('hidden');
        dom.startGame.classList.add('hidden');
        renderSettingsDisplay(settings);
    }

    updatePlayersList(players);
    dom.startGame.disabled = players.length < 3;
}

export function updatePlayersList(players) {
    dom.playersGrid.innerHTML = '';
    players.slice(0, 20).forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'lobby-player';
        div.setAttribute('role', 'listitem');
        if (idx === 0) {
            const adm = document.createElement('div');
            adm.className = 'adm-label';
            adm.textContent = 'HOST';
            div.appendChild(adm);
        }
        const emoji = document.createElement('span');
        emoji.className = 'circle';
        emoji.textContent = p.emoji || '😀';
        div.appendChild(emoji);
        const nick = document.createElement('div');
        nick.className = 'player-nick';
        nick.textContent = p.name;
        div.appendChild(nick);
        dom.playersGrid.appendChild(div);
    });

    if (state.isHost) {
        dom.startGame.disabled = players.length < 3;
        dom.startHint.textContent = players.length < 3
            ? `Noch ${3 - players.length} Spieler nötig`
            : `${players.length} Spieler bereit!`;
    }
}

export function updateSettingsDisplay(settings) {
    state.settings = settings;
    if (!state.isHost) renderSettingsDisplay(settings);
}

export function updateSpectatorCount(count) {
    dom.spectatorCount.classList.toggle('hidden', count === 0);
    dom.spectatorNum.textContent = count;
}

// ── Writing Phase ───────────────────────────────────────────

export function showWritingPhase(emojis, writingStartTime, settings, round, totalRounds) {
    setPhase(Phase.WRITING) || forcePhase(Phase.WRITING);
    state.storySubmitted = false;

    hideAllSections();
    dom.writingSection.classList.remove('hidden');

    // Round indicator
    if (totalRounds > 1) {
        dom.roundIndicator.classList.remove('hidden');
        dom.roundCurrent.textContent = round;
        dom.roundTotal.textContent = totalRounds;
    } else {
        dom.roundIndicator.classList.add('hidden');
    }

    dom.wordLimit.textContent = settings.wordLimit;
    dom.writingSection.classList.toggle('speed-mode', settings.gameMode === 'speed');

    // Render emojis
    dom.writingEmojis.innerHTML = '';
    emojis.forEach(e => {
        const span = document.createElement('span');
        span.className = 'writing-emoji';
        span.textContent = e;
        const tip = document.createElement('span');
        tip.className = 'emoji-tooltip';
        tip.textContent = EMOJI_NAMES[e] || '';
        span.appendChild(tip);
        dom.writingEmojis.appendChild(span);
    });

    // Reset textarea
    dom.writingStory.value = '';
    dom.writingStory.disabled = false;
    dom.writingFinishBtn.innerHTML = '<span class="btn-icon">✅</span> Abschicken';
    dom.writingFinishBtn.disabled = false;
    dom.writingSection.classList.remove('writing-finished');
    dom.wordCount.textContent = '0';

    // Progress
    dom.writingProgress.classList.remove('hidden');
    dom.storiesSubmitted.textContent = '0';
    dom.storiesTotal.textContent = '0';

    // Timer
    const timerDuration = settings.timerDuration || 180;
    const start = writingStartTime || Date.now();
    state.writingTimeLeft = Math.max(0, timerDuration - Math.floor((Date.now() - start) / 1000));
    state.writingMilestonesAnnounced = new Set();
    updateWritingTimer(timerDuration);

    if (state.writingTimer) clearInterval(state.writingTimer);
    state.writingTimer = setInterval(() => {
        const prev = state.writingTimeLeft;
        state.writingTimeLeft = Math.max(0, timerDuration - Math.floor((Date.now() - start) / 1000));
        updateWritingTimer(timerDuration);
        announceTimerMilestones(prev, state.writingTimeLeft);

        if (state.writingTimeLeft <= 10 && state.writingTimeLeft > 0) playTick();

        if (state.writingTimeLeft <= 0) {
            clearInterval(state.writingTimer);
            state.writingTimer = null;
            dom.writingStory.disabled = true;
            dom.writingSection.classList.add('writing-finished');
        }
    }, 1000);
}

function updateWritingTimer(total) {
    dom.writingTimerTime.textContent = formatTime(state.writingTimeLeft);
    const pct = Math.max(0, state.writingTimeLeft / total);
    dom.writingTimerBar.style.height = `${pct * 100}%`;
    dom.writingTimerTime.classList.toggle('timer-urgent', state.writingTimeLeft <= 30);

    const bar = dom.writingTimerBar?.parentElement;
    if (bar && bar.getAttribute('role') === 'progressbar') {
        bar.setAttribute('aria-valuenow', Math.round(pct * 100));
    }
}

// Milestones at which we announce the remaining time to assistive tech.
// Chosen so that sighted users see the countdown every second while
// screen readers only hear informative breakpoints and the final cue.
const TIMER_MILESTONES = [60, 30, 10, 5];

function announceTimerMilestones(prev, now) {
    if (!dom.writingTimerAnnounce) return;
    const announced = state.writingMilestonesAnnounced ?? new Set();

    for (const m of TIMER_MILESTONES) {
        if (prev > m && now <= m && !announced.has(m)) {
            announced.add(m);
            dom.writingTimerAnnounce.textContent = `Noch ${m} Sekunden zum Schreiben.`;
            state.writingMilestonesAnnounced = announced;
            return;
        }
    }

    if (prev > 0 && now === 0 && !announced.has(0)) {
        announced.add(0);
        dom.writingTimerAnnounce.textContent = 'Zeit abgelaufen.';
        state.writingMilestonesAnnounced = announced;
    }
}

// ── Guess Phase ─────────────────────────────────────────────

export function showGuessPhase(data, socket) {
    setPhase(Phase.GUESSING) || forcePhase(Phase.GUESSING);
    state.guessSubmitted = false;
    state.selectedEmojiCombo = null;
    state.selectedPlayerId = null;

    hideAllSections();
    dom.guessSection.classList.remove('hidden');

    // Story
    dom.guessStory.textContent = data.story;

    // Blind mode: hide emoji group
    if (data.gameMode === 'blind') {
        dom.emojiGuessGroup.classList.add('hidden');
    } else {
        dom.emojiGuessGroup.classList.remove('hidden');
        dom.emojiOptions.innerHTML = '';
        data.emojiOptions.forEach(combo => {
            const btn = document.createElement('button');
            btn.textContent = combo.join(' ');
            btn.className = 'guess-emoji-btn';
            btn.onclick = () => {
                if (state.guessSubmitted) return;
                dom.emojiOptions.querySelectorAll('.guess-emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                state.selectedEmojiCombo = combo;
                playClick();
                updateGuessButton();
            };
            dom.emojiOptions.appendChild(btn);
        });
    }

    // Players
    dom.playerOptions.innerHTML = '';
    data.players.forEach(player => {
        const btn = document.createElement('button');
        btn.innerHTML = `<span class="guess-player-emoji-inline">${player.emoji || '😀'}</span> <span>${player.name}</span>`;
        btn.className = 'guess-player-btn';
        btn.onclick = () => {
            if (state.guessSubmitted) return;
            dom.playerOptions.querySelectorAll('.guess-player-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.selectedPlayerId = player.id;
            playClick();
            updateGuessButton();
        };
        dom.playerOptions.appendChild(btn);
    });

    dom.submitGuess.disabled = true;
    dom.submitGuess.innerHTML = '<span class="btn-icon">🎯</span> Tipp abgeben';

    dom.submitGuess.onclick = () => {
        if (!state.guessSubmitted) {
            const isBlind = data.gameMode === 'blind';
            if (!isBlind && !state.selectedEmojiCombo) return;
            if (!state.selectedPlayerId) return;

            socket.emit('submit-guess', {
                roomCode: state.roomCode,
                guess: {
                    emojiCombo: state.selectedEmojiCombo,
                    playerId: state.selectedPlayerId,
                },
            });

            state.guessSubmitted = true;
            dom.submitGuess.innerHTML = '<span class="btn-icon">✏️</span> Bearbeiten';
            setGuessInputsDisabled(true);
            playSuccess();
        } else {
            state.guessSubmitted = false;
            dom.submitGuess.innerHTML = '<span class="btn-icon">🎯</span> Tipp abgeben';
            setGuessInputsDisabled(false);
            updateGuessButton();
        }
    };
}

function updateGuessButton() {
    const isBlind = dom.emojiGuessGroup.classList.contains('hidden');
    dom.submitGuess.disabled = isBlind
        ? !state.selectedPlayerId
        : !(state.selectedEmojiCombo && state.selectedPlayerId);
}

function setGuessInputsDisabled(disabled) {
    dom.emojiOptions.querySelectorAll('.guess-emoji-btn').forEach(b => {
        b.disabled = disabled;
        b.classList.toggle('inactive', disabled);
    });
    dom.playerOptions.querySelectorAll('.guess-player-btn').forEach(b => {
        b.disabled = disabled;
        b.classList.toggle('inactive', disabled);
    });
}

// ── Results Phase ───────────────────────────────────────────

export function showResultsPhase(data) {
    setPhase(Phase.RESULTS) || forcePhase(Phase.RESULTS);

    hideAllSections();
    dom.resultsSection.classList.remove('hidden');
    dom.leaderboardContainer.classList.add('hidden');
    dom.postRoundActions.classList.add('hidden');

    state.resultsPlayers = data.players;
    state.resultsData = data.results;
    state.currentChatIdx = data.resultsState?.currentChatIdx || 0;
    state.currentMsgStep = data.resultsState?.currentMsgStep || 0;

    // Round indicator
    if (data.totalRounds > 1) {
        dom.resultsRoundInd.classList.remove('hidden');
        dom.resultsRoundCur.textContent = data.currentRound;
        dom.resultsRoundTot.textContent = data.totalRounds;
    } else {
        dom.resultsRoundInd.classList.add('hidden');
    }

    // Team scores
    renderTeamScores(dom.teamScores, data.teamScores);

    renderResultsSidebar();
    renderResultsChat();

    dom.resultsContinueBtn.classList.toggle('hidden', !state.isHost);
    dom.resultsContinueBtn.disabled = false;
}

export function advanceResults(idx, step) {
    state.currentChatIdx = idx;
    state.currentMsgStep = step;
    renderResultsSidebar();
    renderResultsChat();
}

function renderResultsSidebar() {
    dom.resultsSidebar.innerHTML = '';
    state.resultsPlayers.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.className = 'results-player-btn' + (idx === state.currentChatIdx ? ' selected' : '');
        btn.onclick = () => {
            if (!state.isHost) return;
            state.currentChatIdx = idx;
            state.currentMsgStep = 0;
            renderResultsSidebar();
            renderResultsChat();
        };
        const emoji = document.createElement('div');
        emoji.className = 'results-player-emoji';
        emoji.textContent = p.emoji || '😀';
        btn.appendChild(emoji);
        const nick = document.createElement('div');
        nick.className = 'results-player-nick';
        nick.textContent = p.name;
        btn.appendChild(nick);
        dom.resultsSidebar.appendChild(btn);
    });
}

function renderResultsChat() {
    // Clean up previous typeText timers
    for (const t of state.typeTextTimers) clearInterval(t);
    state.typeTextTimers = [];

    dom.resultsChat.innerHTML = '';
    if (!state.resultsData || !state.resultsData[state.currentChatIdx]) return;
    const res = state.resultsData[state.currentChatIdx];

    // Find guesser for this author
    let guessEntry = null;
    if (res.guesses && Array.isArray(res.guesses)) {
        guessEntry = res.guesses.find(g => g.guess && g.guess.playerId === res.authorId) || res.guesses[0];
    }

    let guesserPlayer = null, authorPlayer = null, guessText = '—';
    if (guessEntry && guessEntry.guess) {
        guesserPlayer = state.resultsPlayers.find(p => p.id === guessEntry.playerId);
        authorPlayer = state.resultsPlayers.find(p => p.id === guessEntry.guess.playerId);
        const guessEmojis = (guessEntry.guess.emojiCombo || []).join(' ');
        if (guesserPlayer && authorPlayer) {
            guessText = guessEmojis ? `${guessEmojis} — ${authorPlayer.name}` : authorPlayer.name;
        }
    }

    const steps = [
        { side: 'left', avatar: '🤖', text: res.emojis.join(' '), typing: true },
        { side: 'right', avatar: state.resultsPlayers[state.currentChatIdx]?.emoji || '😀', text: res.story, typing: true },
        { side: 'left', avatar: guesserPlayer?.emoji || '😀', text: guessText, typing: true },
    ];

    for (let i = 0; i <= state.currentMsgStep && i < steps.length; i++) {
        renderResultsMsg(steps[i], i === state.currentMsgStep);
    }
}

function renderResultsMsg(msg, isTyping) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'results-msg ' + msg.side;
    const avatar = document.createElement('div');
    avatar.className = 'results-msg-avatar';
    avatar.textContent = msg.avatar;
    msgDiv.appendChild(avatar);
    const bubble = document.createElement('div');
    bubble.className = 'results-msg-bubble';
    msgDiv.appendChild(bubble);
    dom.resultsChat.appendChild(msgDiv);
    if (isTyping && msg.typing) {
        typeText(msg.text, bubble, 18);
    } else {
        bubble.textContent = msg.text;
    }
}

// ── Leaderboard ─────────────────────────────────────────────

export function showLeaderboard(data) {
    setPhase(Phase.LEADERBOARD) || forcePhase(Phase.LEADERBOARD);

    dom.leaderboardContainer.classList.remove('hidden');
    dom.postRoundActions.classList.remove('hidden');

    renderLeaderboardTable(dom.leaderboardTable, data.leaderboard, data.leaderboardDetails, data.players);

    if (state.isHost) {
        dom.nextRoundBtn.classList.toggle('hidden', data.currentRound >= data.totalRounds);
        dom.newGameBtn.classList.toggle('hidden', data.currentRound < data.totalRounds);
    } else {
        dom.nextRoundBtn.classList.add('hidden');
        dom.newGameBtn.classList.add('hidden');
    }

    renderTeamScores(dom.teamScores, data.teamScores);
    playSuccess();
}

function renderLeaderboardTable(table, leaderboard, details, players) {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>#</th><th>Spieler</th><th>Punkte</th></tr>';
    table.appendChild(thead);

    const sorted = [...players].sort((a, b) => (leaderboard[b.id] || 0) - (leaderboard[a.id] || 0));
    const tbody = document.createElement('tbody');
    const medals = ['🥇', '🥈', '🥉'];

    sorted.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${medals[idx] || idx + 1}</td>
            <td><span class="lb-emoji">${p.emoji || '😀'}</span> ${p.name}</td>
            <td class="leaderboard-points">${(leaderboard[p.id] || 0).toFixed(1)}</td>
        `;

        if (details && details[p.id]) {
            const tdPoints = tr.querySelector('.leaderboard-points');
            const tooltip = document.createElement('span');
            tooltip.className = 'leaderboard-tooltip';
            const tips = [
                ...(details[p.id].personal || []).map(t => t.reason),
                ...(details[p.id].earned || []).map(t => t.reason),
            ];
            tooltip.innerHTML = tips.length ? tips.map(t => `<div>${t}</div>`).join('') : 'Keine Punkte';
            tdPoints.appendChild(tooltip);
            tdPoints.style.cursor = 'pointer';
            tdPoints.onmouseenter = () => { tooltip.style.display = 'block'; };
            tdPoints.onmouseleave = () => { tooltip.style.display = 'none'; };
        }

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

// ── Game Over ───────────────────────────────────────────────

export function showGameOver(data) {
    setPhase(Phase.GAMEOVER) || forcePhase(Phase.GAMEOVER);

    hideAllSections();
    dom.gameoverSection.classList.remove('hidden');

    renderLeaderboardTable(dom.gameoverTable, data.totalScores, null, data.players);

    if (data.teams) {
        const teamScores = { A: 0, B: 0 };
        for (const pid of data.teams.A) teamScores.A += (data.totalScores[pid] || 0);
        for (const pid of data.teams.B) teamScores.B += (data.totalScores[pid] || 0);

        dom.gameoverTeamScores.classList.remove('hidden');
        dom.gameoverTeamScores.innerHTML = `
            <div class="team-score-card team-a ${teamScores.A > teamScores.B ? 'winning' : ''}">
                <span class="team-label">Team A</span>
                <span class="team-points">${teamScores.A.toFixed(1)}</span>
            </div>
            <div class="team-score-card team-b ${teamScores.B > teamScores.A ? 'winning' : ''}">
                <span class="team-label">Team B</span>
                <span class="team-points">${teamScores.B.toFixed(1)}</span>
            </div>
        `;
    }

    dom.gameoverNewGameBtn.classList.toggle('hidden', !state.isHost);

    // Show/hide replay button based on whether a replayId was provided
    const replayBtn = document.getElementById('replay-btn');
    if (replayBtn) {
        replayBtn.classList.toggle('hidden', !data.replayId);
    }

    playSuccess();
}

// ── Spectator Mode ──────────────────────────────────────────

export function showSpectatorView(info) {
    if (state.phase !== Phase.SPECTATING) {
        setPhase(Phase.SPECTATING) || forcePhase(Phase.SPECTATING);
    }
    hideAllSections();
    dom.spectatorSection.classList.remove('hidden');
    dom.spectatorInfo.innerHTML = `<p>${info || 'Du schaust dem Spiel zu.'}</p>`;
}

// ── Tutorial ────────────────────────────────────────────────

let tutorialTrap = null;

export function showTutorial() {
    dom.tutorialModal.classList.remove('hidden');
    // Late import avoids a circular dependency at module init time.
    import('./focus-trap.js').then(({ activateFocusTrap }) => {
        tutorialTrap = activateFocusTrap(dom.tutorialModal, { onEscape: hideTutorial });
    });
}

export function hideTutorial() {
    dom.tutorialModal.classList.add('hidden');
    localStorage.setItem('icontale_tutorial_seen', 'true');
    if (tutorialTrap) {
        tutorialTrap.release();
        tutorialTrap = null;
    }
}

// ── Team Scores (shared renderer) ───────────────────────────

function renderTeamScores(container, teamScores) {
    if (teamScores) {
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="team-score-card team-a ${teamScores.A > teamScores.B ? 'winning' : ''}">
                <span class="team-label">Team A</span>
                <span class="team-points">${teamScores.A.toFixed(1)}</span>
            </div>
            <div class="team-score-card team-b ${teamScores.B > teamScores.A ? 'winning' : ''}">
                <span class="team-label">Team B</span>
                <span class="team-points">${teamScores.B.toFixed(1)}</span>
            </div>
        `;
    } else {
        container.classList.add('hidden');
    }
}

// ── Teams Display ───────────────────────────────────────────

export function showTeams(teams, players) {
    if (!dom.teamDisplay) return;
    const teamA = teams.A.map(id => players.find(p => p.id === id)).filter(Boolean);
    const teamB = teams.B.map(id => players.find(p => p.id === id)).filter(Boolean);
    dom.teamDisplay.classList.remove('hidden');
    dom.teamDisplay.innerHTML = `
        <div class="team-column team-a">
            <h4>Team A</h4>
            ${teamA.map(p => `<span class="team-member">${p.emoji} ${p.name}</span>`).join('')}
        </div>
        <div class="team-column team-b">
            <h4>Team B</h4>
            ${teamB.map(p => `<span class="team-member">${p.emoji} ${p.name}</span>`).join('')}
        </div>
    `;
}
