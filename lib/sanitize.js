// ═══════════════════════════════════════════════════════════════
//  Input Validation & Sanitization
// ═══════════════════════════════════════════════════════════════

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
};

/**
 * Escape HTML entities to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'`/]/g, char => HTML_ENTITIES[char] || char);
}

/**
 * Strip control characters (except newline/tab) from a string.
 * @param {string} str
 * @returns {string}
 */
function stripControl(str) {
    if (typeof str !== 'string') return '';
    // Keep \n and \t, remove other control chars
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validate and sanitize a username.
 * Rules: 1-20 chars, trimmed, no HTML, no control chars.
 * @param {string} raw
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
function validateUsername(raw) {
    if (typeof raw !== 'string') {
        return { valid: false, value: '', error: 'Username must be a string.' };
    }

    const trimmed = stripControl(raw).trim();
    if (trimmed.length === 0) {
        return { valid: false, value: '', error: 'Username is required.' };
    }
    if (trimmed.length > 20) {
        return { valid: false, value: '', error: 'Username must be 20 characters or fewer.' };
    }

    return { valid: true, value: escapeHtml(trimmed) };
}

/**
 * Validate and sanitize a story submission.
 * Rules: non-empty, max wordLimit words, max 4000 chars, no HTML, no control chars.
 * @param {string} raw
 * @param {number} wordLimit
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
function validateStory(raw, wordLimit = 500) {
    if (typeof raw !== 'string') {
        return { valid: false, value: '', error: 'Story must be a string.' };
    }

    const cleaned = stripControl(raw).trim();
    if (cleaned.length === 0) {
        return { valid: false, value: '', error: 'Story cannot be empty.' };
    }
    if (cleaned.length > 4000) {
        return { valid: false, value: '', error: 'Story exceeds maximum character limit (4000).' };
    }

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount > wordLimit) {
        return { valid: false, value: '', error: `Story exceeds word limit (${wordLimit}).` };
    }

    return { valid: true, value: escapeHtml(cleaned) };
}

/**
 * Validate a room code.
 * Rules: exactly 6 alphanumeric characters.
 * @param {string} raw
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
function validateRoomCode(raw) {
    if (typeof raw !== 'string') {
        return { valid: false, value: '', error: 'Room code must be a string.' };
    }

    const upper = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(upper)) {
        return { valid: false, value: '', error: 'Room code must be exactly 6 alphanumeric characters.' };
    }

    return { valid: true, value: upper };
}

/**
 * Validate an emoji string (single emoji character or small sequence).
 * @param {string} raw
 * @returns {{ valid: boolean, value: string }}
 */
function validateEmoji(raw) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8) {
        return { valid: false, value: '😀' };
    }
    // Strip any HTML
    return { valid: true, value: escapeHtml(raw.trim()) };
}

/**
 * Validate game settings object.
 * @param {object} raw
 * @returns {object} sanitized settings (only valid keys)
 */
function validateSettings(raw) {
    if (!raw || typeof raw !== 'object') return {};

    const safe = {};
    const MODES = ['classic', 'speed', 'blind', 'team'];
    const TIMERS = [60, 120, 180, 300];
    const WORD_LIMITS = [100, 250, 500];
    const EMOJI_COUNTS = [1, 2, 3, 4, 5];
    const ROUNDS = [1, 3, 5];
    const PACKS = ['all', 'faces', 'animals', 'food', 'sports', 'nature', 'objects'];

    if (MODES.includes(raw.gameMode))          safe.gameMode = raw.gameMode;
    if (TIMERS.includes(Number(raw.timerDuration))) safe.timerDuration = Number(raw.timerDuration);
    if (WORD_LIMITS.includes(Number(raw.wordLimit))) safe.wordLimit = Number(raw.wordLimit);
    if (EMOJI_COUNTS.includes(Number(raw.emojiCount))) safe.emojiCount = Number(raw.emojiCount);
    if (ROUNDS.includes(Number(raw.rounds)))    safe.rounds = Number(raw.rounds);

    if (Array.isArray(raw.emojiPacks)) {
        safe.emojiPacks = raw.emojiPacks.filter(p => PACKS.includes(p));
        if (safe.emojiPacks.length === 0) safe.emojiPacks = ['all'];
    }

    return safe;
}

module.exports = {
    escapeHtml,
    stripControl,
    validateUsername,
    validateStory,
    validateRoomCode,
    validateEmoji,
    validateSettings,
};
