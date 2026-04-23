import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { issueToken, verifyToken, __internals } from '../lib/socket-auth';

describe('socket-auth', () => {
    const originalSecret = process.env.SOCKET_AUTH_SECRET;
    const originalEnv = process.env.NODE_ENV;

    beforeAll(() => {
        process.env.SOCKET_AUTH_SECRET = 'unit-test-secret-please-ignore';
    });

    afterAll(() => {
        if (originalSecret === undefined) delete process.env.SOCKET_AUTH_SECRET;
        else process.env.SOCKET_AUTH_SECRET = originalSecret;
        if (originalEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnv;
    });

    it('issues and verifies tokens', () => {
        const token = issueToken();
        const result = verifyToken(token);
        expect(result.valid).toBe(true);
        expect(result.issuedAt).toBeGreaterThan(0);
    });

    it('rejects missing or malformed tokens', () => {
        expect(verifyToken('').valid).toBe(false);
        expect(verifyToken(null).valid).toBe(false);
        expect(verifyToken('nope').valid).toBe(false);
        expect(verifyToken('a.b.c').valid).toBe(false);
    });

    it('rejects tokens with a tampered signature', () => {
        const token = issueToken();
        const [payload, sig] = token.split('.');
        const tampered = `${payload}.${sig.slice(0, -2)}xx`;
        expect(verifyToken(tampered).valid).toBe(false);
    });

    it('rejects tokens with a tampered payload', () => {
        const token = issueToken();
        const [, sig] = token.split('.');
        expect(verifyToken(`AAAA.${sig}`).valid).toBe(false);
    });

    it('rejects expired tokens', () => {
        const token = issueToken(Date.now() - __internals.DEFAULT_TTL_MS - 1000);
        const result = verifyToken(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });

    it('rejects tokens from a different secret', () => {
        const token = issueToken();
        process.env.SOCKET_AUTH_SECRET = 'some-other-secret-for-verification';
        try {
            expect(verifyToken(token).valid).toBe(false);
        } finally {
            process.env.SOCKET_AUTH_SECRET = 'unit-test-secret-please-ignore';
        }
    });

    it('throws in production without a secret', () => {
        const prev = process.env.SOCKET_AUTH_SECRET;
        delete process.env.SOCKET_AUTH_SECRET;
        process.env.NODE_ENV = 'production';
        try {
            expect(() => issueToken()).toThrow(/SOCKET_AUTH_SECRET/);
        } finally {
            process.env.SOCKET_AUTH_SECRET = prev;
            process.env.NODE_ENV = 'test';
        }
    });
});
