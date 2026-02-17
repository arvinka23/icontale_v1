// ═══════════════════════════════════════════════════════════════
//  Input Validation & Sanitization
// ═══════════════════════════════════════════════════════════════

import type { ValidationResult, GameSettings } from './types';

const HTML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
};

export function escapeHtml(str: unknown): string {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITIES[char] || char);
}

export function stripControl(str: unknown): string {
    if (typeof str !== 'string') return '';
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function validateUsername(raw: unknown): ValidationResult {
    if (typeof raw !== 'string') {
        return { valid: false, value: '', error: 'Benutzername muss ein Text sein.' };
    }

    const trimmed = stripControl(raw).trim();
    if (trimmed.length === 0) {
        return { valid: false, value: '', error: 'Benutzername ist erforderlich.' };
    }
    if (trimmed.length > 20) {
        return { valid: false, value: '', error: 'Benutzername darf höchstens 20 Zeichen haben.' };
    }

    return { valid: true, value: escapeHtml(trimmed) };
}

export function validateStory(raw: unknown, wordLimit = 500): ValidationResult {
    if (typeof raw !== 'string') {
        return { valid: false, value: '', error: 'Die Geschichte muss ein Text sein.' };
    }

    const cleaned = stripControl(raw).trim();
    if (cleaned.length === 0) {
        return { valid: false, value: '', error: 'Die Geschichte darf nicht leer sein.' };
    }
    if (cleaned.length > 4000) {
        return { valid: false, value: '', error: 'Die Geschichte überschreitet das Zeichenlimit (4000).' };
    }

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount > wordLimit) {
        return { valid: false, value: '', error: `Die Geschichte überschreitet das Wortlimit (${wordLimit}).` };
    }

    return { valid: true, value: escapeHtml(cleaned) };
}

export function validateRoomCode(raw: unknown): ValidationResult {
    if (typeof raw !== 'string') {
        return { valid: false, value: '', error: 'Der Raumcode muss ein Text sein.' };
    }

    const upper = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(upper)) {
        return { valid: false, value: '', error: 'Der Raumcode muss genau 6 alphanumerische Zeichen haben.' };
    }

    return { valid: true, value: upper };
}

export function validateEmoji(raw: unknown): ValidationResult {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8) {
        return { valid: false, value: '😀' };
    }
    return { valid: true, value: escapeHtml(raw.trim()) };
}

const MODES = ['classic', 'speed', 'blind', 'team'] as const;
const TIMERS = [60, 120, 180, 300];
const WORD_LIMITS = [100, 250, 500];
const EMOJI_COUNTS = [1, 2, 3, 4, 5];
const ROUNDS = [1, 3, 5];
const PACKS = ['all', 'faces', 'animals', 'food', 'sports', 'nature', 'objects'];

export function validateSettings(raw: unknown): Partial<GameSettings> {
    if (!raw || typeof raw !== 'object') return {};
    const r = raw as Record<string, unknown>;

    const safe: Partial<GameSettings> = {};

    if (typeof r.gameMode === 'string' && (MODES as readonly string[]).includes(r.gameMode)) {
        safe.gameMode = r.gameMode as GameSettings['gameMode'];
    }
    if (TIMERS.includes(Number(r.timerDuration))) safe.timerDuration = Number(r.timerDuration);
    if (WORD_LIMITS.includes(Number(r.wordLimit))) safe.wordLimit = Number(r.wordLimit);
    if (EMOJI_COUNTS.includes(Number(r.emojiCount))) safe.emojiCount = Number(r.emojiCount);
    if (ROUNDS.includes(Number(r.rounds))) safe.rounds = Number(r.rounds);

    if (Array.isArray(r.emojiPacks)) {
        safe.emojiPacks = (r.emojiPacks as string[]).filter((p) => PACKS.includes(p));
        if (safe.emojiPacks.length === 0) safe.emojiPacks = ['all'];
    }

    return safe;
}
