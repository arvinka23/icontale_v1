import { describe, it, expect, afterEach } from 'vitest';
import {
    isSentryEnabled,
    captureException,
    captureMessage,
    attachExpressErrorHandler,
} from '../lib/sentry';

describe('sentry wrapper', () => {
    const originalDsn = process.env.SENTRY_DSN;

    afterEach(() => {
        if (originalDsn === undefined) delete process.env.SENTRY_DSN;
        else process.env.SENTRY_DSN = originalDsn;
    });

    it('reports disabled when SENTRY_DSN is missing', () => {
        delete process.env.SENTRY_DSN;
        expect(isSentryEnabled()).toBe(false);
    });

    it('reports disabled when SENTRY_DSN is only whitespace', () => {
        process.env.SENTRY_DSN = '   ';
        expect(isSentryEnabled()).toBe(false);
    });

    it('reports enabled when SENTRY_DSN is set', () => {
        process.env.SENTRY_DSN = 'https://example@sentry.io/1';
        expect(isSentryEnabled()).toBe(true);
    });

    it('capture* helpers never throw when Sentry is not initialised', () => {
        delete process.env.SENTRY_DSN;
        expect(() => captureException(new Error('nope'))).not.toThrow();
        expect(() => captureMessage('noop')).not.toThrow();
        expect(() => attachExpressErrorHandler({})).not.toThrow();
    });
});
