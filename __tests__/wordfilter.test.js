import { describe, it, expect } from 'vitest';

const { checkContent, checkUsername, checkStory } = await import('../lib/wordfilter.js');

describe('wordfilter', () => {
    describe('checkContent', () => {
        it('passes clean text', () => {
            expect(checkContent('Hello world').clean).toBe(true);
            expect(checkContent('Eine kreative Geschichte').clean).toBe(true);
            expect(checkContent('🎮 Gaming is fun').clean).toBe(true);
        });

        it('flags offensive content', () => {
            expect(checkContent('test f*ck test').clean).toBe(false);
        });

        it('handles non-string input gracefully', () => {
            expect(checkContent(null).clean).toBe(true);
            expect(checkContent(undefined).clean).toBe(true);
            expect(checkContent(123).clean).toBe(true);
        });

        it('handles empty string', () => {
            expect(checkContent('').clean).toBe(true);
        });
    });

    describe('checkUsername', () => {
        it('passes clean usernames', () => {
            expect(checkUsername('Player1').clean).toBe(true);
            expect(checkUsername('CoolGamer').clean).toBe(true);
        });

        it('returns reason when username is offensive', () => {
            const result = checkUsername('f*cker');
            expect(result.clean).toBe(false);
            expect(result.reason).toBeDefined();
        });
    });

    describe('checkStory', () => {
        it('passes clean stories', () => {
            expect(checkStory('Es war einmal ein Drache...').clean).toBe(true);
        });

        it('returns reason when story contains offensive content', () => {
            const result = checkStory('some offensive f*ck content');
            expect(result.clean).toBe(false);
            expect(result.reason).toBeDefined();
        });
    });
});
