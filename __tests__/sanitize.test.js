import { describe, it, expect } from 'vitest';

// Use dynamic import for CommonJS module
const san = await import('../lib/sanitize.js');

describe('sanitize', () => {

    describe('escapeHtml', () => {
        it('escapes HTML entities', () => {
            expect(san.escapeHtml('<script>alert("xss")</script>'))
                .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
        });

        it('returns empty string for non-string input', () => {
            expect(san.escapeHtml(null)).toBe('');
            expect(san.escapeHtml(undefined)).toBe('');
            expect(san.escapeHtml(42)).toBe('');
        });

        it('passes through safe strings', () => {
            expect(san.escapeHtml('Hello World')).toBe('Hello World');
        });
    });

    describe('validateUsername', () => {
        it('accepts valid usernames', () => {
            const result = san.validateUsername('TestUser');
            expect(result.valid).toBe(true);
            expect(result.value).toBe('TestUser');
        });

        it('rejects empty strings', () => {
            expect(san.validateUsername('').valid).toBe(false);
            expect(san.validateUsername('   ').valid).toBe(false);
        });

        it('rejects usernames over 20 chars', () => {
            expect(san.validateUsername('a'.repeat(21)).valid).toBe(false);
        });

        it('escapes HTML in usernames', () => {
            const result = san.validateUsername('<b>bold</b>');
            expect(result.valid).toBe(true);
            expect(result.value).not.toContain('<');
        });

        it('rejects non-string input', () => {
            expect(san.validateUsername(null).valid).toBe(false);
            expect(san.validateUsername(123).valid).toBe(false);
        });
    });

    describe('validateStory', () => {
        it('accepts valid stories', () => {
            const result = san.validateStory('Once upon a time...');
            expect(result.valid).toBe(true);
        });

        it('rejects empty stories', () => {
            expect(san.validateStory('').valid).toBe(false);
            expect(san.validateStory('   ').valid).toBe(false);
        });

        it('rejects stories exceeding word limit', () => {
            const longStory = Array(101).fill('word').join(' ');
            expect(san.validateStory(longStory, 100).valid).toBe(false);
        });

        it('accepts stories within word limit', () => {
            const story = Array(50).fill('word').join(' ');
            expect(san.validateStory(story, 100).valid).toBe(true);
        });
    });

    describe('validateRoomCode', () => {
        it('accepts valid 6-char codes', () => {
            expect(san.validateRoomCode('ABC123').valid).toBe(true);
            expect(san.validateRoomCode('abc123').value).toBe('ABC123'); // uppercased
        });

        it('rejects invalid codes', () => {
            expect(san.validateRoomCode('AB').valid).toBe(false);
            expect(san.validateRoomCode('ABCDEFG').valid).toBe(false);
            expect(san.validateRoomCode('ABC-12').valid).toBe(false);
        });
    });

    describe('validateSettings', () => {
        it('returns only valid settings', () => {
            const result = san.validateSettings({
                gameMode: 'speed',
                timerDuration: 60,
                wordLimit: 100,
                emojiCount: 3,
                rounds: 3,
                emojiPacks: ['faces', 'animals'],
            });
            expect(result.gameMode).toBe('speed');
            expect(result.rounds).toBe(3);
            expect(result.emojiPacks).toEqual(['faces', 'animals']);
        });

        it('ignores invalid values', () => {
            const result = san.validateSettings({
                gameMode: 'invalid',
                timerDuration: 999,
                rounds: 7,
            });
            expect(result.gameMode).toBeUndefined();
            expect(result.timerDuration).toBeUndefined();
            expect(result.rounds).toBeUndefined();
        });

        it('handles null/undefined input', () => {
            expect(san.validateSettings(null)).toEqual({});
            expect(san.validateSettings(undefined)).toEqual({});
        });
    });
});
