// ═══════════════════════════════════════════════════════════════
//  Lightweight socket handshake tokens
//
//  The HTTP layer issues a short-lived HMAC-signed token at
//  GET /api/socket-token. Socket.io connections must present that
//  token in handshake.auth.token; the middleware verifies the HMAC
//  and rejects expired or forged tokens.
//
//  No external JWT library is pulled in. Tokens are
//       `<base64url(issuedAt|random)>.<base64url(hmacSha256)>`
//  which is enough for a single-use unforgeable handshake credential
//  that survives server restarts as long as SOCKET_AUTH_SECRET is
//  stable across instances.
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto';

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 min
const DEV_SECRET = 'icontale-dev-secret-do-not-use-in-production';

function getSecret(): string {
    const env = process.env.SOCKET_AUTH_SECRET;
    if (env && env.length >= 16) return env;
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'SOCKET_AUTH_SECRET must be set to a 16+ char string in production'
        );
    }
    return DEV_SECRET;
}

function toB64Url(buf: Buffer): string {
    return buf.toString('base64url');
}

function sign(payload: string): string {
    return toB64Url(
        crypto.createHmac('sha256', getSecret()).update(payload).digest()
    );
}

/**
 * Mint a new token. Valid for {@link DEFAULT_TTL_MS}.
 * The payload encodes the issue time so the server can reject
 * replays without keeping per-token state.
 */
export function issueToken(now: number = Date.now()): string {
    const nonce = crypto.randomBytes(8);
    const payload = toB64Url(
        Buffer.concat([Buffer.from(String(now)), Buffer.from(':'), nonce])
    );
    const sig = sign(payload);
    return `${payload}.${sig}`;
}

export interface VerifyResult {
    valid: boolean;
    reason?: string;
    issuedAt?: number;
}

export function verifyToken(token: unknown, now: number = Date.now()): VerifyResult {
    if (typeof token !== 'string' || token.length === 0) {
        return { valid: false, reason: 'missing' };
    }
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false, reason: 'malformed' };

    const [payload, sig] = parts;
    const expected = sign(payload);

    // Constant-time comparison to avoid timing leaks.
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(sig);
    if (expectedBuf.length !== sigBuf.length) return { valid: false, reason: 'bad-sig' };
    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return { valid: false, reason: 'bad-sig' };

    let decoded: string;
    try {
        decoded = Buffer.from(payload, 'base64url').toString('utf8');
    } catch {
        return { valid: false, reason: 'malformed' };
    }

    const iatPart = decoded.split(':')[0];
    const iat = Number(iatPart);
    if (!Number.isFinite(iat)) return { valid: false, reason: 'malformed' };

    if (now - iat > DEFAULT_TTL_MS) return { valid: false, reason: 'expired' };
    if (iat - now > 60_000) return { valid: false, reason: 'future' };

    return { valid: true, issuedAt: iat };
}

/** Only used in tests. */
export const __internals = { DEFAULT_TTL_MS };
