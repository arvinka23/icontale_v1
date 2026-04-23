# Security Model

A short, operator-facing overview of the security boundaries inside IconTale.
Use this alongside the [improvement plan](./IMPROVEMENT_PLAN.md) when reviewing
changes that touch auth, rate-limits or transport.

## Reporting a vulnerability

Please do **not** open a public GitHub issue. Email the maintainer at the
address listed in [`package.json`](../package.json) with:

- a minimal reproduction,
- the commit hash you observed the issue on,
- and your preferred credit handle.

Expect an initial reply within a week. We coordinate disclosure via a private
GitHub security advisory once a fix is staged.

## Trust boundaries

```
 ┌──────────┐       HTTPS/WSS        ┌────────────────┐
 │  Client  │ ─────────────────────▶ │ reverse proxy  │ (Render/Railway/...)
 └──────────┘                        └──────┬─────────┘
                                            │ 1 hop (TRUST_PROXY=1)
                                            ▼
                                     ┌────────────────┐
                                     │  Node / Express│ ◀── Redis (store, achievements, replays)
                                     └────────────────┘
```

- Exactly one proxy hop is trusted by default (`TRUST_PROXY=1`). Set this to
  the number of reverse proxies in front of the server, or to a named policy
  such as `loopback` / `uniquelocal` when you know better. If the value is
  wrong, rate-limits collapse onto a single bucket and the HTTPS redirect
  becomes spoofable via `X-Forwarded-Proto`.
- HTTPS redirect is applied only in production.
- All non-GET socket messages carry a short-lived HMAC token; see below.

## Layered rate limiting

| Layer | Limit | Where |
|---|---|---|
| HTTP (global per IP) | 200 requests / 15 min | `express-rate-limit` in `server.ts` |
| Socket.io global (per socket) | 120 events / 10 s | `GLOBAL_QUOTA` in `lib/socket-rate-limit.ts` |
| Socket.io per-event | varies | `EVENT_QUOTAS` in `lib/socket-rate-limit.ts` |
| Socket.io payload size | 32 KB / packet | `MAX_PAYLOAD_BYTES` |
| Socket.io reconnect sessions | 10 / 60 s | `reconnect-session` quota |

Violations are logged at `warn` level through pino.

## Handshake tokens

`GET /api/socket-token` returns

```json
{ "token": "<base64url>.<base64url>" }
```

where the first half encodes `<issuedAt>:<8-byte-nonce>` and the second half is
`HMAC-SHA256(payload, SOCKET_AUTH_SECRET)`. Tokens expire after two minutes.

The Socket.io middleware verifies the token on every incoming connection. When
`ENFORCE_SOCKET_AUTH=1`, missing or invalid tokens reject the handshake
outright. Otherwise only a `warn` log is produced so operators can watch the
rollout before flipping enforcement on.

### Required environment variables

| Var | Default | Notes |
|---|---|---|
| `SOCKET_AUTH_SECRET` | (dev fallback) | Must be ≥ 16 characters in production; `issueToken()` throws otherwise. |
| `ENFORCE_SOCKET_AUTH` | unset → log-only | Set to `1` or `true` to reject invalid tokens. |
| `TRUST_PROXY` | `1` | Number of hops, or a valid Express `trust proxy` value. |

## Transport

- All cookies/localStorage values are first-party only; no third-party
  scripts, fonts or images are loaded.
- Content-Security-Policy forbids inline scripts (`script-src 'self'`) and
  all plugin content (`object-src 'none'`). See `server.ts` for the full
  directive list.
- The app is clickjacking-proof via `frame-ancestors 'none'`.

## Input sanitization

All user input is validated **server-side** via `lib/sanitize.ts`:

- `validateUsername` — 1..20 chars, HTML-escaped.
- `validateStory` — 1..4000 chars, ≤ configured word limit, HTML-escaped.
- `validateRoomCode` — exactly 6 alphanumeric chars, upper-cased.
- `validateSettings` — every field allow-listed against the authoritative
  enums; unknown fields are dropped silently.

Client-side checks exist only for responsiveness — they never gate behaviour.
