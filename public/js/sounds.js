// ═══════════════════════════════════════════════════════════════
//  Optional Sound Effects
// ═══════════════════════════════════════════════════════════════

import { state } from './state.js';

// AudioContext (lazy init to avoid browser autoplay policy)
let ctx = null;

function getCtx() {
    if (!ctx) {
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch {
            return null;
        }
    }
    return ctx;
}

/**
 * Play a simple beep/tone.
 * @param {number} freq  Frequency in Hz
 * @param {number} dur   Duration in seconds
 * @param {string} type  Oscillator type ('sine', 'square', 'triangle')
 */
function playTone(freq, dur = 0.1, type = 'sine') {
    if (!state.soundEnabled) return;
    const ac = getCtx();
    if (!ac) return;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
}

/** Short click / select sound */
export function playClick() {
    playTone(800, 0.06, 'sine');
}

/** Success chime */
export function playSuccess() {
    playTone(523, 0.1, 'sine');
    setTimeout(() => playTone(659, 0.1, 'sine'), 100);
    setTimeout(() => playTone(784, 0.15, 'sine'), 200);
}

/** Error buzz */
export function playError() {
    playTone(200, 0.15, 'square');
}

/** Timer warning tick */
export function playTick() {
    playTone(1000, 0.03, 'triangle');
}

/** Toggle sound on/off */
export function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('icontale_sound', state.soundEnabled ? '1' : '0');
    return state.soundEnabled;
}

/** Load sound preference from localStorage */
export function loadSoundPreference() {
    const saved = localStorage.getItem('icontale_sound');
    state.soundEnabled = saved !== '0'; // Default: enabled
}
