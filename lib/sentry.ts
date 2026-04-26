// ═══════════════════════════════════════════════════════════════
//  Sentry integration (optional, DSN-gated)
//
//  Sentry is loaded lazily so the package stays a no-op when no
//  SENTRY_DSN is configured — which is the expected state for
//  local dev and for anyone self-hosting without external error
//  tracking. The runtime import path is used so tree-shaking
//  doesn't accidentally pull Sentry into the code paths that
//  don't need it.
// ═══════════════════════════════════════════════════════════════

import log from './logger';

export interface SentryLike {
    init: (_opts: Record<string, unknown>) => void;
    captureException: (_err: unknown, _context?: unknown) => void;
    captureMessage: (_msg: string, _level?: string) => void;
    setupExpressErrorHandler?: (_app: unknown) => void;
}

let sentry: SentryLike | null = null;

export function isSentryEnabled(): boolean {
    return !!process.env.SENTRY_DSN && process.env.SENTRY_DSN.trim().length > 0;
}

/**
 * Initialise Sentry if SENTRY_DSN is configured. Safe to call multiple
 * times; subsequent calls are no-ops.
 */
export function initSentry(extra?: { version?: string }): void {
    if (sentry) return;
    if (!isSentryEnabled()) {
        log.info('Sentry disabled (no SENTRY_DSN)');
        return;
    }

    try {
        // Using require here so bundlers do not resolve Sentry into
        // the dependency graph unless the runtime branch is taken.
        const Sentry = require('@sentry/node') as SentryLike;

        Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || 'development',
            release: extra?.version,
            // Fairly conservative defaults — sample 10 % of performance
            // traces, 100 % of errors. Tune via env if needed.
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
            sendDefaultPii: false,
        });

        sentry = Sentry;
        log.info(
            {
                environment: process.env.NODE_ENV,
                tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
            },
            'Sentry initialised'
        );
    } catch (err) {
        log.warn({ err }, 'Failed to initialise Sentry; continuing without it');
    }
}

/** Capture an exception; no-op when Sentry is disabled. */
export function captureException(err: unknown, context?: unknown): void {
    if (!sentry) return;
    try {
        sentry.captureException(err, context);
    } catch (inner) {
        log.warn({ inner }, 'Sentry captureException failed');
    }
}

/** Capture a free-form message; no-op when Sentry is disabled. */
export function captureMessage(msg: string, level: string = 'info'): void {
    if (!sentry) return;
    try {
        sentry.captureMessage(msg, level);
    } catch (inner) {
        log.warn({ inner }, 'Sentry captureMessage failed');
    }
}

/**
 * Attach Sentry's Express error handler to the app. Harmless when
 * Sentry was never initialised; returns silently.
 */
export function attachExpressErrorHandler(app: unknown): void {
    if (!sentry) return;
    try {
        sentry.setupExpressErrorHandler?.(app);
    } catch (inner) {
        log.warn({ inner }, 'Sentry setupExpressErrorHandler failed');
    }
}
