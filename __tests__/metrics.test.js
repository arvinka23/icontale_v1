import { describe, it, expect, beforeEach } from 'vitest';
import {
    registerCounter,
    registerGauge,
    registerSnapshotGauge,
    renderMetrics,
    __reset,
} from '../lib/metrics';

describe('metrics', () => {
    beforeEach(() => __reset());

    it('renders a counter with zero samples as a single zero line', async () => {
        registerCounter('icontale_test_total', 'test counter');
        const out = await renderMetrics();
        expect(out).toContain('# HELP icontale_test_total test counter');
        expect(out).toContain('# TYPE icontale_test_total counter');
        expect(out).toContain('icontale_test_total 0');
    });

    it('aggregates counter increments by label set', async () => {
        const c = registerCounter('icontale_events_total', 'events', ['event']);
        c.inc({ event: 'submit-story' });
        c.inc({ event: 'submit-story' });
        c.inc({ event: 'submit-guess' });
        const out = await renderMetrics();
        expect(out).toContain('icontale_events_total{event="submit-story"} 2');
        expect(out).toContain('icontale_events_total{event="submit-guess"} 1');
    });

    it('gauge set replaces the current value, inc/dec adjust it', async () => {
        const g = registerGauge('icontale_lobbies', 'lobbies');
        g.set(10);
        g.inc({}, 2);
        g.dec({}, 3);
        const out = await renderMetrics();
        expect(out).toContain('icontale_lobbies 9');
    });

    it('snapshot gauges are resolved on every scrape', async () => {
        let tick = 0;
        registerSnapshotGauge('icontale_ticker', 'a ticker', () => ++tick);
        const first = await renderMetrics();
        const second = await renderMetrics();
        expect(first).toContain('icontale_ticker 1');
        expect(second).toContain('icontale_ticker 2');
    });

    it('a broken snapshot provider does not crash the scrape', async () => {
        registerCounter('icontale_safe_total', 'safe', []);
        registerSnapshotGauge('icontale_bad', 'bad provider', () => {
            throw new Error('boom');
        });
        const out = await renderMetrics();
        expect(out).toContain('icontale_safe_total 0');
    });

    it('escapes quotes and backslashes in label values', async () => {
        const c = registerCounter('icontale_labeled_total', 'labeled', ['path']);
        c.inc({ path: 'with "quotes" and \\backslash' });
        const out = await renderMetrics();
        expect(out).toContain('path="with \\"quotes\\" and \\\\backslash"');
    });
});
