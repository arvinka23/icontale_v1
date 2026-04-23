import { describe, it, expect, beforeEach } from 'vitest';
import {
    allowEvent,
    forgetSocket,
    sweep,
    EVENT_QUOTAS,
    GLOBAL_QUOTA,
    __reset,
} from '../lib/socket-rate-limit';

describe('socket-rate-limit', () => {
    beforeEach(() => __reset());

    it('allows events up to the per-event quota', () => {
        const quota = EVENT_QUOTAS['submit-story'];
        for (let i = 0; i < quota.max; i++) {
            expect(allowEvent('sock-1', 'submit-story')).toBe(true);
        }
        expect(allowEvent('sock-1', 'submit-story')).toBe(false);
    });

    it('tracks each event independently for the same socket', () => {
        const storyQuota = EVENT_QUOTAS['submit-story'];
        for (let i = 0; i < storyQuota.max; i++) {
            allowEvent('sock-1', 'submit-story');
        }
        expect(allowEvent('sock-1', 'submit-story')).toBe(false);
        expect(allowEvent('sock-1', 'submit-guess')).toBe(true);
    });

    it('tracks each socket independently for the same event', () => {
        const quota = EVENT_QUOTAS['submit-story'];
        for (let i = 0; i < quota.max; i++) {
            allowEvent('sock-a', 'submit-story');
        }
        expect(allowEvent('sock-a', 'submit-story')).toBe(false);
        expect(allowEvent('sock-b', 'submit-story')).toBe(true);
    });

    it('falls back to the default quota for unknown events', () => {
        // Unknown events get the 60/10s default, so 60 must succeed.
        for (let i = 0; i < 60; i++) {
            expect(allowEvent('sock-1', 'custom-event')).toBe(true);
        }
        expect(allowEvent('sock-1', 'custom-event')).toBe(false);
    });

    it('global quota trips before a deluge of unknown events can run up', () => {
        // GLOBAL_QUOTA.max is lower than an attacker picking 120 distinct
        // unknown events to rotate through — prove the global bucket
        // kicks in regardless of which event name is sent.
        let allowed = 0;
        for (let i = 0; i < GLOBAL_QUOTA.max + 5; i++) {
            if (allowEvent('sock-1', `burst-event-${i}`)) allowed++;
        }
        expect(allowed).toBeLessThanOrEqual(GLOBAL_QUOTA.max);
    });

    it('forgetSocket removes all buckets for that id', () => {
        allowEvent('sock-1', 'submit-story');
        allowEvent('sock-1', 'submit-guess');
        forgetSocket('sock-1');

        // After forget, the socket's quota starts fresh again.
        const quota = EVENT_QUOTAS['submit-story'];
        for (let i = 0; i < quota.max; i++) {
            expect(allowEvent('sock-1', 'submit-story')).toBe(true);
        }
    });

    it('sweep removes stale buckets after 2x window', () => {
        allowEvent('sock-1', 'submit-story');
        const future = Date.now() + EVENT_QUOTAS['submit-story'].windowMs * 3;
        const removed = sweep(future);
        expect(removed).toBeGreaterThan(0);
    });
});
