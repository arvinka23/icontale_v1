// ═══════════════════════════════════════════════════════════════
//  IconTale — Client
// ═══════════════════════════════════════════════════════════════

const socket = io();

// ── Constants ────────────────────────────────────────────────
const EMOJIS = [
    '😀','😂','😍','😎','🤔','😱','🥳','😡','😭','😴','👻','🤖',
    '🐶','🐱','🦄','🐉','🍕','🍔','🍟','🍎','🍌','🍉','⚽','🏀',
    '🏈','🚗','✈️','🚀','🌈','🔥','⭐','🎲','🎸','🎮','🎤','🎧',
    '📚','🧩','🖌️','🎨','🏆','🥇','🥈','🥉','🎯','🎳','🕹️','🧸',
    '🎁','🎂','🍰','🍩','🍪','🍫','🍿','🍦','🍭','🐟','🐬','🐋',
    '🦈','🐊','🐢','🐍','🦎','🦖','🐅','🐆','🦓','🦍','🐘','🦛',
    '🦏','🐪','🦒','🦘','🦥','🦦','🐇','🐿️','🦔'
];

const EMOJI_NAMES = {
    '😀':'Lächeln','😂':'Freudentränen','😍':'Verliebt','😎':'Cool',
    '🤔':'Denkend','😱':'Schock','🥳':'Party','😡':'Wütend',
    '😭':'Weinen','😴':'Schlafend','👻':'Geist','🤖':'Roboter',
    '🐶':'Hund','🐱':'Katze','🦄':'Einhorn','🐉':'Drache',
    '🍕':'Pizza','🍔':'Burger','🍟':'Pommes','🍎':'Apfel',
    '🍌':'Banane','🍉':'Wassermelone','⚽':'Fussball','🏀':'Basketball',
    '🏈':'Football','🚗':'Auto','✈️':'Flugzeug','🚀':'Rakete',
    '🌈':'Regenbogen','🔥':'Feuer','⭐':'Stern','🎲':'Würfel',
    '🎸':'Gitarre','🎮':'Controller','🎤':'Mikrofon','🎧':'Kopfhörer',
    '📚':'Bücher','🧩':'Puzzle','🖌️':'Pinsel','🎨':'Palette',
    '🏆':'Pokal','🥇':'Gold','🥈':'Silber','🥉':'Bronze',
    '🎯':'Zielscheibe','🎳':'Bowling','🕹️':'Joystick','🧸':'Teddy',
    '🎁':'Geschenk','🎂':'Kuchen','🍰':'Torte','🍩':'Donut',
    '🍪':'Keks','🍫':'Schokolade','🍿':'Popcorn','🍦':'Eis',
    '🍭':'Lutscher'
};

const MODE_DESCRIPTIONS = {
    classic: 'Schreibe Geschichten und errate Emojis + Autor.',
    speed:   '60 Sekunden, max 100 Wörter — sei schnell!',
    blind:   'Keine Emoji-Auswahl beim Raten — nur den Autor erraten.',
    team:    'Spieler werden in zwei Teams aufgeteilt. Teampunkte zählen!'
};

// ── State ────────────────────────────────────────────────────
let currentRoomCode = null;
let isHost = false;
let isSpectator = false;
let currentSettings = {};
let writingTimer = null;
let writingTimeLeft = 180;
let selectedEmojiCombo = null;
let selectedPlayerId = null;
let guessSubmitted = false;
let resultsData = null;
let resultsPlayers = [];
let currentChatIdx = 0;
let currentMsgStep = 0;

// ── DOM Elements ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
    // Menu
    mainMenu:       $('main-menu'),
    tabCreate:      $('tab-create'),
    tabJoin:        $('tab-join'),
    username:       $('username'),
    roomCodeInput:  $('room-code-input'),
    roomCodeGroup:  $('room-code-group'),
    menuActionBtn:  $('menu-action-btn'),
    spectatorBtn:   $('spectator-btn'),
    userEmoji:      $('user-emoji'),
    changeEmoji:    $('change-emoji'),
    helpBtn:        $('help-btn'),

    // Lobby
    lobby:          $('lobby'),
    roomCode:       $('room-code'),
    playersGrid:    $('players-grid'),
    startGame:      $('start-game'),
    startHint:      $('start-hint'),
    settingsPanel:  $('settings-panel'),
    settingsDisplay:$('settings-display'),
    spectatorCount: $('spectator-count'),
    spectatorNum:   $('spectator-num'),
    teamDisplay:    $('team-display'),

    // Settings
    modeOptions:    $('mode-options'),
    modeDesc:       $('mode-desc'),
    timerGroup:     $('timer-group'),
    timerOptions:   $('timer-options'),
    wordlimitGroup: $('wordlimit-group'),
    wordlimitOpts:  $('wordlimit-options'),
    emojicountOpts: $('emojicount-options'),
    roundsOpts:     $('rounds-options'),
    packOptions:    $('pack-options'),

    // Writing
    writingSection:    $('writing-section'),
    writingTimerTime:  $('writing-timer-time'),
    writingTimerBar:   $('writing-timer-bar'),
    writingEmojis:     $('writing-emojis'),
    writingStory:      $('writing-story'),
    writingFinishBtn:  $('writing-finish-btn'),
    wordCount:         $('word-count'),
    wordLimit:         $('word-limit'),
    roundIndicator:    $('round-indicator'),
    roundCurrent:      $('round-current'),
    roundTotal:        $('round-total'),
    writingProgress:   $('writing-progress'),
    storiesSubmitted:  $('stories-submitted'),
    storiesTotal:      $('stories-total'),

    // Guessing
    guessSection:       $('guess-section'),
    guessStory:         $('guess-story'),
    emojiGuessGroup:    $('emoji-guess-group'),
    emojiOptions:       $('emoji-options'),
    playerOptions:      $('player-options'),
    submitGuess:        $('submit-guess'),
    guessRoundIndicator:$('guess-round-indicator'),
    guessRoundCurrent:  $('guess-round-current'),
    guessRoundTotal:    $('guess-round-total'),

    // Results
    resultsSection:     $('results-section'),
    resultsSidebar:     $('results-sidebar'),
    resultsChat:        $('results-chat'),
    resultsContinueBtn: $('results-continue-btn'),
    resultsRoundInd:    $('results-round-indicator'),
    resultsRoundCur:    $('results-round-current'),
    resultsRoundTot:    $('results-round-total'),
    teamScores:         $('team-scores'),
    leaderboardContainer: $('leaderboard-container'),
    leaderboardTable:   $('leaderboard-table'),
    postRoundActions:   $('post-round-actions'),
    nextRoundBtn:       $('next-round-btn'),
    newGameBtn:         $('new-game-btn'),

    // Game over
    gameoverSection:    $('gameover-section'),
    gameoverTable:      $('gameover-table'),
    gameoverTeamScores: $('gameover-team-scores'),
    gameoverNewGameBtn: $('gameover-new-game-btn'),

    // Spectator
    spectatorSection:   $('spectator-section'),
    spectatorInfo:      $('spectator-info'),
    spectatorContent:   $('spectator-content'),

    // Global
    errorMessage:   $('error-message'),
    tutorialModal:  $('tutorial-modal'),
    tutorialClose:  $('tutorial-close'),
    tutorialStart:  $('tutorial-start-btn'),
    loadingOverlay: $('loading-overlay'),
};

// ── Utility Functions ────────────────────────────────────────
function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function getRandomEmoji() {
    return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function hideAllSections() {
    [dom.mainMenu, dom.lobby, dom.writingSection, dom.guessSection,
     dom.resultsSection, dom.gameoverSection, dom.spectatorSection].forEach(el => {
        if (el) el.style.display = 'none';
    });
}

function showError(message) {
    dom.errorMessage.textContent = message;
    dom.errorMessage.style.display = 'block';
    dom.errorMessage.style.animation = 'slideInDown 0.3s ease';
    setTimeout(() => { dom.errorMessage.style.display = 'none'; }, 5000);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function typeText(text, el, speed) {
    el.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
        el.textContent = text.slice(0, i + 1);
        i++;
        if (i >= text.length) clearInterval(interval);
    }, speed);
}

// ── Emoji Selection ──────────────────────────────────────────
function setUserEmoji(emoji) {
    dom.userEmoji.textContent = emoji;
    localStorage.setItem('icontale_user_emoji', emoji);
}

function loadUserEmoji() {
    const saved = localStorage.getItem('icontale_user_emoji');
    setUserEmoji(saved || getRandomEmoji());
}

dom.changeEmoji.onclick = () => {
    let e;
    do { e = getRandomEmoji(); } while (e === dom.userEmoji.textContent);
    setUserEmoji(e);
};

// ── Tab Switching ────────────────────────────────────────────
function setTab(tab) {
    if (tab === 'create') {
        dom.tabCreate.classList.add('active');
        dom.tabJoin.classList.remove('active');
        dom.roomCodeGroup.style.display = 'none';
        dom.spectatorBtn.style.display = 'none';
        dom.menuActionBtn.innerHTML = '<span class="btn-icon">🚀</span> Lobby erstellen';
    } else {
        dom.tabCreate.classList.remove('active');
        dom.tabJoin.classList.add('active');
        dom.roomCodeGroup.style.display = 'block';
        dom.spectatorBtn.style.display = 'block';
        dom.menuActionBtn.innerHTML = '<span class="btn-icon">🎯</span> Lobby beitreten';
    }
}
dom.tabCreate.onclick = () => setTab('create');
dom.tabJoin.onclick = () => setTab('join');

// ── Settings UI ──────────────────────────────────────────────
function initSettingsUI() {
    // Mode
    setupSettingGroup('mode-options', 'gameMode', val => {
        dom.modeDesc.textContent = MODE_DESCRIPTIONS[val] || '';
        // Speed mode locks timer & wordlimit
        if (val === 'speed') {
            setSettingActive('timer-options', '60');
            setSettingActive('wordlimit-options', '100');
            dom.timerGroup.classList.add('setting-locked');
            dom.wordlimitGroup.classList.add('setting-locked');
        } else {
            dom.timerGroup.classList.remove('setting-locked');
            dom.wordlimitGroup.classList.remove('setting-locked');
        }
    });

    // Timer
    setupSettingGroup('timer-options', 'timerDuration', null, true);

    // Word limit
    setupSettingGroup('wordlimit-options', 'wordLimit', null, true);

    // Emoji count
    setupSettingGroup('emojicount-options', 'emojiCount', null, true);

    // Rounds
    setupSettingGroup('rounds-options', 'rounds', null, true);

    // Emoji packs
    const packContainer = dom.packOptions;
    if (packContainer) {
        packContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const allCb = packContainer.querySelector('input[value="all"]');
                if (cb.value === 'all' && cb.checked) {
                    // Uncheck all others
                    packContainer.querySelectorAll('input:not([value="all"])').forEach(c => c.checked = false);
                } else if (cb.value !== 'all' && cb.checked) {
                    allCb.checked = false;
                }
                // If nothing checked, default to all
                const checked = [...packContainer.querySelectorAll('input:checked')].map(c => c.value);
                if (checked.length === 0) {
                    allCb.checked = true;
                }
                emitSettings();
            });
        });
    }
}

function setupSettingGroup(containerId, settingKey, onChangeCallback, isNumeric) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.setting-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (container.closest('.setting-locked')) return;
            container.querySelectorAll('.setting-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (onChangeCallback) onChangeCallback(btn.dataset.value);
            emitSettings();
        });
    });
}

function setSettingActive(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.setting-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === String(value));
    });
}

function getActiveValue(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    const active = container.querySelector('.setting-btn.active');
    return active ? active.dataset.value : null;
}

function getSelectedPacks() {
    if (!dom.packOptions) return ['all'];
    const checked = [...dom.packOptions.querySelectorAll('input:checked')].map(c => c.value);
    return checked.length > 0 ? checked : ['all'];
}

function emitSettings() {
    if (!currentRoomCode || !isHost) return;
    const settings = {
        gameMode:      getActiveValue('mode-options') || 'classic',
        timerDuration: parseInt(getActiveValue('timer-options')) || 180,
        wordLimit:     parseInt(getActiveValue('wordlimit-options')) || 500,
        emojiCount:    parseInt(getActiveValue('emojicount-options')) || 3,
        rounds:        parseInt(getActiveValue('rounds-options')) || 1,
        emojiPacks:    getSelectedPacks()
    };
    socket.emit('update-settings', { roomCode: currentRoomCode, settings });
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
    dom.settingsDisplay.style.display = 'block';
}

// ── Lobby UI ─────────────────────────────────────────────────
function showLobby(roomCode, players, settings) {
    hideAllSections();
    dom.lobby.style.display = 'block';
    dom.roomCode.textContent = roomCode;
    currentSettings = settings || {};

    if (isHost) {
        dom.settingsPanel.style.display = 'block';
        dom.settingsDisplay.style.display = 'none';
        dom.startGame.style.display = 'inline-flex';
        // Sync settings UI
        setSettingActive('mode-options', settings.gameMode);
        setSettingActive('timer-options', String(settings.timerDuration));
        setSettingActive('wordlimit-options', String(settings.wordLimit));
        setSettingActive('emojicount-options', String(settings.emojiCount));
        setSettingActive('rounds-options', String(settings.rounds));
        dom.modeDesc.textContent = MODE_DESCRIPTIONS[settings.gameMode] || '';
    } else {
        dom.settingsPanel.style.display = 'none';
        dom.startGame.style.display = 'none';
        renderSettingsDisplay(settings);
    }

    updatePlayersList(players);
    dom.startGame.disabled = players.length < 3;
}

function updatePlayersList(players) {
    dom.playersGrid.innerHTML = '';
    players.slice(0, 20).forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'lobby-player';
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

    if (isHost) {
        dom.startGame.disabled = players.length < 3;
        dom.startHint.textContent = players.length < 3
            ? `Noch ${3 - players.length} Spieler nötig`
            : `${players.length} Spieler bereit!`;
    }
}

// ── Writing Phase ────────────────────────────────────────────
function showWritingPhase(emojis, writingStartTime, settings, round, totalRounds) {
    hideAllSections();
    dom.writingSection.style.display = 'flex';

    // Round indicator
    if (totalRounds > 1) {
        dom.roundIndicator.style.display = 'block';
        dom.roundCurrent.textContent = round;
        dom.roundTotal.textContent = totalRounds;
    } else {
        dom.roundIndicator.style.display = 'none';
    }

    // Word limit
    dom.wordLimit.textContent = settings.wordLimit;

    // Speed mode visual indicator
    if (settings.gameMode === 'speed') {
        dom.writingSection.classList.add('speed-mode');
    } else {
        dom.writingSection.classList.remove('speed-mode');
    }

    // Emojis
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
    dom.writingProgress.style.display = 'block';
    dom.storiesSubmitted.textContent = '0';
    dom.storiesTotal.textContent = '0';

    // Timer
    const timerDuration = settings.timerDuration || 180;
    const start = writingStartTime || Date.now();
    writingTimeLeft = Math.max(0, timerDuration - Math.floor((Date.now() - start) / 1000));
    updateWritingTimer(timerDuration);

    if (writingTimer) clearInterval(writingTimer);
    writingTimer = setInterval(() => {
        writingTimeLeft = Math.max(0, timerDuration - Math.floor((Date.now() - start) / 1000));
        updateWritingTimer(timerDuration);
        if (writingTimeLeft <= 0) {
            clearInterval(writingTimer);
            dom.writingStory.disabled = true;
            dom.writingSection.classList.add('writing-finished');
        }
    }, 1000);
}

function updateWritingTimer(total) {
    dom.writingTimerTime.textContent = formatTime(writingTimeLeft);
    const pct = Math.max(0, writingTimeLeft / total);
    dom.writingTimerBar.style.height = `${pct * 100}%`;

    // Color change when low
    if (writingTimeLeft <= 30) {
        dom.writingTimerTime.classList.add('timer-urgent');
    } else {
        dom.writingTimerTime.classList.remove('timer-urgent');
    }
}

// Word count
dom.writingStory.addEventListener('input', () => {
    const words = countWords(dom.writingStory.value);
    dom.wordCount.textContent = words;
    const limit = parseInt(dom.wordLimit.textContent) || 500;
    dom.wordCount.classList.toggle('over-limit', words > limit);
});

// Submit / Edit toggle
let storySubmittedFlag = false;
dom.writingFinishBtn.onclick = () => {
    if (!storySubmittedFlag) {
        const story = dom.writingStory.value.trim();
        if (!story) return showError('Bitte schreibe eine Geschichte.');
        const words = countWords(story);
        const limit = parseInt(dom.wordLimit.textContent) || 500;
        if (words > limit) return showError(`Max ${limit} Wörter erlaubt (aktuell: ${words}).`);

        socket.emit('submit-story', { roomCode: currentRoomCode, story });
        storySubmittedFlag = true;
        dom.writingStory.disabled = true;
        dom.writingSection.classList.add('writing-finished');
        dom.writingFinishBtn.innerHTML = '<span class="btn-icon">✏️</span> Bearbeiten';
    } else {
        storySubmittedFlag = false;
        dom.writingStory.disabled = false;
        dom.writingSection.classList.remove('writing-finished');
        dom.writingFinishBtn.innerHTML = '<span class="btn-icon">✅</span> Abschicken';
    }
};

// ── Guess Phase ──────────────────────────────────────────────
function showGuessPhase(data) {
    hideAllSections();
    dom.guessSection.style.display = 'block';
    guessSubmitted = false;
    selectedEmojiCombo = null;
    selectedPlayerId = null;

    // Round indicator
    // (we get round info from game-started event, stored in currentSettings)

    // Story
    dom.guessStory.textContent = data.story;

    // Blind mode: hide emoji group
    if (data.gameMode === 'blind') {
        dom.emojiGuessGroup.style.display = 'none';
    } else {
        dom.emojiGuessGroup.style.display = 'block';
        dom.emojiOptions.innerHTML = '';
        data.emojiOptions.forEach(combo => {
            const btn = document.createElement('button');
            btn.textContent = combo.join(' ');
            btn.className = 'guess-emoji-btn';
            btn.onclick = () => {
                if (guessSubmitted) return;
                dom.emojiOptions.querySelectorAll('.guess-emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedEmojiCombo = combo;
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
            if (guessSubmitted) return;
            dom.playerOptions.querySelectorAll('.guess-player-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedPlayerId = player.id;
            updateGuessButton();
        };
        dom.playerOptions.appendChild(btn);
    });

    dom.submitGuess.disabled = true;
    dom.submitGuess.innerHTML = '<span class="btn-icon">🎯</span> Tipp abgeben';

    dom.submitGuess.onclick = () => {
        if (!guessSubmitted) {
            const isBlind = data.gameMode === 'blind';
            if (!isBlind && !selectedEmojiCombo) return;
            if (!selectedPlayerId) return;

            socket.emit('submit-guess', {
                roomCode: currentRoomCode,
                guess: {
                    emojiCombo: selectedEmojiCombo,
                    playerId: selectedPlayerId
                }
            });

            guessSubmitted = true;
            dom.submitGuess.innerHTML = '<span class="btn-icon">✏️</span> Bearbeiten';
            setGuessInputsDisabled(true);
        } else {
            guessSubmitted = false;
            dom.submitGuess.innerHTML = '<span class="btn-icon">🎯</span> Tipp abgeben';
            setGuessInputsDisabled(false);
            updateGuessButton();
        }
    };
}

function updateGuessButton() {
    const isBlind = dom.emojiGuessGroup.style.display === 'none';
    if (isBlind) {
        dom.submitGuess.disabled = !selectedPlayerId;
    } else {
        dom.submitGuess.disabled = !(selectedEmojiCombo && selectedPlayerId);
    }
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

// ── Results Phase ────────────────────────────────────────────
function showResultsPhase(data) {
    hideAllSections();
    dom.resultsSection.style.display = 'block';
    dom.leaderboardContainer.style.display = 'none';
    dom.postRoundActions.style.display = 'none';

    resultsPlayers = data.players;
    resultsData = data.results;
    currentChatIdx = data.resultsState?.currentChatIdx || 0;
    currentMsgStep = data.resultsState?.currentMsgStep || 0;

    // Round indicator
    if (data.totalRounds > 1) {
        dom.resultsRoundInd.style.display = 'block';
        dom.resultsRoundCur.textContent = data.currentRound;
        dom.resultsRoundTot.textContent = data.totalRounds;
    } else {
        dom.resultsRoundInd.style.display = 'none';
    }

    // Team scores
    if (data.teamScores) {
        dom.teamScores.style.display = 'block';
        dom.teamScores.innerHTML = `
            <div class="team-score-card team-a">
                <span class="team-label">Team A</span>
                <span class="team-points">${data.teamScores.A.toFixed(1)}</span>
            </div>
            <div class="team-score-card team-b">
                <span class="team-label">Team B</span>
                <span class="team-points">${data.teamScores.B.toFixed(1)}</span>
            </div>
        `;
    } else {
        dom.teamScores.style.display = 'none';
    }

    renderResultsSidebar();
    renderResultsChat();

    dom.resultsContinueBtn.style.display = isHost ? 'flex' : 'none';
    dom.resultsContinueBtn.disabled = false;
}

function renderResultsSidebar() {
    dom.resultsSidebar.innerHTML = '';
    resultsPlayers.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.className = 'results-player-btn' + (idx === currentChatIdx ? ' selected' : '');
        btn.onclick = () => {
            if (!isHost) return;
            currentChatIdx = idx;
            currentMsgStep = 0;
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
    dom.resultsChat.innerHTML = '';
    if (!resultsData || !resultsData[currentChatIdx]) return;
    const res = resultsData[currentChatIdx];

    // Find guesser for this author
    let guessEntry = null;
    if (res.guesses && Array.isArray(res.guesses)) {
        guessEntry = res.guesses.find(g => g.guess && g.guess.playerId === res.authorId) || res.guesses[0];
    }

    let guesserPlayer = null, authorPlayer = null, guessEmojis = '', guessText = '—';
    if (guessEntry && guessEntry.guess) {
        guesserPlayer = resultsPlayers.find(p => p.id === guessEntry.playerId);
        authorPlayer = resultsPlayers.find(p => p.id === guessEntry.guess.playerId);
        guessEmojis = (guessEntry.guess.emojiCombo || []).join(' ');
        if (guesserPlayer && authorPlayer) {
            guessText = guessEmojis ? `${guessEmojis} — ${authorPlayer.name}` : authorPlayer.name;
        }
    }

    const steps = [
        { side: 'left', avatar: '🤖', text: res.emojis.join(' '), typing: true },
        { side: 'right', avatar: resultsPlayers[currentChatIdx]?.emoji || '😀', text: res.story, typing: true },
        { side: 'left', avatar: guesserPlayer?.emoji || '😀', text: guessText, typing: true }
    ];

    for (let i = 0; i <= currentMsgStep && i < steps.length; i++) {
        renderResultsMsg(steps[i], i === currentMsgStep);
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

dom.resultsContinueBtn.onclick = () => {
    socket.emit('results-continue', { roomCode: currentRoomCode });
};

// ── Leaderboard ──────────────────────────────────────────────
function showLeaderboard(data) {
    dom.leaderboardContainer.style.display = 'block';
    dom.postRoundActions.style.display = 'flex';

    renderLeaderboardTable(dom.leaderboardTable, data.leaderboard, data.leaderboardDetails, data.players);

    // Show next round or new game button
    if (isHost) {
        if (data.currentRound < data.totalRounds) {
            dom.nextRoundBtn.style.display = 'inline-flex';
            dom.newGameBtn.style.display = 'none';
        } else {
            dom.nextRoundBtn.style.display = 'none';
            dom.newGameBtn.style.display = 'inline-flex';
        }
    } else {
        dom.nextRoundBtn.style.display = 'none';
        dom.newGameBtn.style.display = 'none';
    }

    // Team scores
    if (data.teamScores) {
        dom.teamScores.style.display = 'block';
        dom.teamScores.innerHTML = `
            <div class="team-score-card team-a ${data.teamScores.A > data.teamScores.B ? 'winning' : ''}">
                <span class="team-label">Team A</span>
                <span class="team-points">${data.teamScores.A.toFixed(1)}</span>
            </div>
            <div class="team-score-card team-b ${data.teamScores.B > data.teamScores.A ? 'winning' : ''}">
                <span class="team-label">Team B</span>
                <span class="team-points">${data.teamScores.B.toFixed(1)}</span>
            </div>
        `;
    }
}

function renderLeaderboardTable(table, leaderboard, details, players) {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>#</th><th>Spieler</th><th>Punkte</th></tr>';
    table.appendChild(thead);

    // Sort by score
    const sorted = [...players].sort((a, b) => (leaderboard[b.id] || 0) - (leaderboard[a.id] || 0));
    const tbody = document.createElement('tbody');

    sorted.forEach((p, idx) => {
        const tr = document.createElement('tr');
        const medals = ['🥇', '🥈', '🥉'];
        tr.innerHTML = `
            <td>${medals[idx] || idx + 1}</td>
            <td><span class="lb-emoji">${p.emoji || '😀'}</span> ${p.name}</td>
            <td class="leaderboard-points">${(leaderboard[p.id] || 0).toFixed(1)}</td>
        `;

        // Tooltip with details
        if (details && details[p.id]) {
            const tdPoints = tr.querySelector('.leaderboard-points');
            const tooltip = document.createElement('span');
            tooltip.className = 'leaderboard-tooltip';
            const tips = [
                ...(details[p.id].personal || []).map(t => t.reason),
                ...(details[p.id].earned || []).map(t => t.reason)
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

dom.nextRoundBtn.onclick = () => {
    socket.emit('next-round', { roomCode: currentRoomCode });
};

dom.newGameBtn.onclick = () => {
    socket.emit('new-game', { roomCode: currentRoomCode });
};

dom.gameoverNewGameBtn.onclick = () => {
    socket.emit('new-game', { roomCode: currentRoomCode });
};

// ── Game Over ────────────────────────────────────────────────
function showGameOver(data) {
    hideAllSections();
    dom.gameoverSection.style.display = 'block';

    renderLeaderboardTable(dom.gameoverTable, data.totalScores, null, data.players);

    if (data.teams) {
        let teamScores = { A: 0, B: 0 };
        for (const pid of data.teams.A) teamScores.A += (data.totalScores[pid] || 0);
        for (const pid of data.teams.B) teamScores.B += (data.totalScores[pid] || 0);

        dom.gameoverTeamScores.style.display = 'block';
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

    dom.gameoverNewGameBtn.style.display = isHost ? 'inline-flex' : 'none';
}

// ── Spectator Mode ───────────────────────────────────────────
function showSpectatorView(info) {
    hideAllSections();
    dom.spectatorSection.style.display = 'block';
    dom.spectatorInfo.innerHTML = `<p>${info || 'Du schaust dem Spiel zu.'}</p>`;
}

// ── Tutorial ─────────────────────────────────────────────────
function showTutorial() {
    dom.tutorialModal.style.display = 'flex';
}

function hideTutorial() {
    dom.tutorialModal.style.display = 'none';
    localStorage.setItem('icontale_tutorial_seen', 'true');
}

dom.tutorialClose.onclick = hideTutorial;
dom.tutorialStart.onclick = hideTutorial;
dom.helpBtn.onclick = showTutorial;

// ── Socket Events ────────────────────────────────────────────

// Lobby
socket.on('lobby-created', ({ roomCode, players, settings }) => {
    isHost = true;
    isSpectator = false;
    currentRoomCode = roomCode;
    currentSettings = settings;
    showLobby(roomCode, players, settings);
});

socket.on('lobby-joined', ({ roomCode, players, settings }) => {
    isHost = false;
    isSpectator = false;
    currentRoomCode = roomCode;
    currentSettings = settings;
    showLobby(roomCode, players, settings);
});

socket.on('players-update', (players) => {
    updatePlayersList(players);
});

socket.on('settings-update', (settings) => {
    currentSettings = settings;
    if (!isHost) {
        renderSettingsDisplay(settings);
    }
});

socket.on('spectators-update', (spectators) => {
    if (spectators.length > 0) {
        dom.spectatorCount.style.display = 'block';
        dom.spectatorNum.textContent = spectators.length;
    } else {
        dom.spectatorCount.style.display = 'none';
    }
});

socket.on('lobby-error', ({ message }) => {
    showError(message);
});

socket.on('lobby-closed', () => {
    showError('Lobby wurde geschlossen.');
    setTimeout(() => window.location.reload(), 2000);
});

// Spectator
socket.on('spectator-joined', ({ roomCode, players, settings, started, currentRound, totalRounds }) => {
    isSpectator = true;
    currentRoomCode = roomCode;
    currentSettings = settings;
    if (started) {
        showSpectatorView(`Spiel läuft — Runde ${currentRound}/${totalRounds}`);
    } else {
        showSpectatorView(`Lobby ${roomCode} — Warte auf Spielstart...`);
    }
});

socket.on('spectator-round-started', ({ currentRound, totalRounds, settings }) => {
    showSpectatorView(`Schreibphase — Runde ${currentRound}/${totalRounds} (${settings.gameMode})`);
});

socket.on('spectator-guess-phase', () => {
    showSpectatorView('Ratephase läuft...');
});

// Teams
socket.on('teams-assigned', ({ teams, players }) => {
    if (dom.teamDisplay) {
        const teamANames = teams.A.map(id => players.find(p => p.id === id)).filter(Boolean);
        const teamBNames = teams.B.map(id => players.find(p => p.id === id)).filter(Boolean);
        dom.teamDisplay.style.display = 'block';
        dom.teamDisplay.innerHTML = `
            <div class="team-column team-a">
                <h4>Team A</h4>
                ${teamANames.map(p => `<span class="team-member">${p.emoji} ${p.name}</span>`).join('')}
            </div>
            <div class="team-column team-b">
                <h4>Team B</h4>
                ${teamBNames.map(p => `<span class="team-member">${p.emoji} ${p.name}</span>`).join('')}
            </div>
        `;
    }
});

// Game flow
socket.on('game-started', ({ currentRound, totalRounds, gameMode }) => {
    currentSettings.gameMode = gameMode;
});

socket.on('round-started', ({ emojis, writingStartTime, currentRound, totalRounds, settings }) => {
    currentSettings = settings;
    storySubmittedFlag = false;
    showWritingPhase(emojis, writingStartTime, settings, currentRound, totalRounds);
});

socket.on('writing-progress', ({ submitted, total }) => {
    dom.storiesSubmitted.textContent = submitted;
    dom.storiesTotal.textContent = total;
});

socket.on('guess-phase', (data) => {
    if (writingTimer) clearInterval(writingTimer);
    showGuessPhase(data);
});

socket.on('guessing-progress', ({ submitted, total }) => {
    // Could show progress indicator if desired
});

socket.on('results-phase', (data) => {
    showResultsPhase(data);
});

socket.on('results-progress', ({ currentChatIdx: idx, currentMsgStep: step }) => {
    currentChatIdx = idx;
    currentMsgStep = step;
    renderResultsSidebar();
    renderResultsChat();

    // Check if we should transition to leaderboard
    if (isHost && idx === resultsPlayers.length - 1 && step >= 2) {
        setTimeout(() => {
            socket.emit('leaderboard-phase', { roomCode: currentRoomCode });
        }, 500);
    }
});

socket.on('leaderboard-phase', (data) => {
    showLeaderboard(data);
});

socket.on('game-over', (data) => {
    showGameOver(data);
});

socket.on('back-to-lobby', ({ players, settings }) => {
    currentSettings = settings;
    showLobby(currentRoomCode, players, settings);
});

socket.on('story-error', ({ message }) => {
    showError(message);
});

// ── Menu Action ──────────────────────────────────────────────
dom.menuActionBtn.onclick = () => {
    const username = dom.username.value.trim();
    const userEmoji = localStorage.getItem('icontale_user_emoji') || '😀';

    if (!username) return showError('Bitte gib einen Namen ein.');

    if (dom.tabCreate.classList.contains('active')) {
        socket.emit('create-lobby', { username, emoji: userEmoji });
    } else {
        const roomCode = dom.roomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 6) return showError('Bitte gib einen gültigen 6-stelligen Code ein.');
        socket.emit('join-lobby', { username, roomCode, emoji: userEmoji });
    }
};

dom.spectatorBtn.onclick = () => {
    const roomCode = dom.roomCodeInput.value.trim().toUpperCase();
    if (roomCode.length !== 6) return showError('Bitte gib einen gültigen 6-stelligen Code ein.');
    socket.emit('join-spectator', { roomCode });
};

dom.startGame.onclick = () => {
    if (currentRoomCode && isHost) {
        socket.emit('start-game', { roomCode: currentRoomCode });
    }
};

// ── Initialization ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    loadUserEmoji();
    setTab('create');
    initSettingsUI();

    // Show tutorial on first visit
    if (!localStorage.getItem('icontale_tutorial_seen')) {
        showTutorial();
    }
});
