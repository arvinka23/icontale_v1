// ═══════════════════════════════════════════════════════════════
//  Replay Viewer — Client-side replay viewing
// ═══════════════════════════════════════════════════════════════

const modal = document.getElementById('replay-modal');
const timeline = document.getElementById('replay-timeline');
const content = document.getElementById('replay-content');
const counter = document.getElementById('replay-counter');
const prevBtn = document.getElementById('replay-prev');
const nextBtn = document.getElementById('replay-next');
const closeBtn = document.getElementById('replay-close');

let events = [];
let currentIdx = 0;

/**
 * Open the replay viewer for a given replay ID.
 * @param {string} replayId
 */
export async function openReplay(replayId) {
    if (!replayId) return;

    try {
        const res = await fetch(`/replay/${replayId}`);
        if (!res.ok) {
            console.warn('[replay] Replay not found:', replayId);
            return;
        }

        const replay = await res.json();
        events = replay.events || [];
        currentIdx = 0;

        // Build timeline dots
        timeline.innerHTML = '';
        events.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'timeline-dot' + (i === 0 ? ' active' : '');
            dot.addEventListener('click', () => goTo(i));
            timeline.appendChild(dot);
        });

        renderEvent();
        modal.classList.remove('hidden');
    } catch (err) {
        console.error('[replay] Error loading replay:', err);
    }
}

function renderEvent() {
    if (events.length === 0) {
        content.textContent = 'Keine Events vorhanden.';
        counter.textContent = '0 / 0';
        return;
    }

    const evt = events[currentIdx];
    const time = new Date(evt.timestamp).toLocaleTimeString('de-CH');

    let text = `[${time}] ${formatEventType(evt.type)}\n\n`;
    text += JSON.stringify(evt.data, null, 2);

    content.textContent = text;
    counter.textContent = `${currentIdx + 1} / ${events.length}`;

    // Update timeline dots
    const dots = timeline.querySelectorAll('.timeline-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIdx);
    });
}

function formatEventType(type) {
    const labels = {
        'round-start': '🎬 Runde gestartet',
        'story-submit': '✍️ Geschichte eingereicht',
        'guess-submit': '🔍 Rateversuch',
        'results': '📊 Ergebnisse',
        'leaderboard': '🏆 Bestenliste',
        'game-over': '🎮 Spiel beendet',
    };
    return labels[type] || type;
}

function goTo(idx) {
    currentIdx = Math.max(0, Math.min(idx, events.length - 1));
    renderEvent();
}

// Navigation
if (prevBtn) prevBtn.addEventListener('click', () => goTo(currentIdx - 1));
if (nextBtn) nextBtn.addEventListener('click', () => goTo(currentIdx + 1));
if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

// Close on background click
if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
    }
});
