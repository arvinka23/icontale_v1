# Observability

Operator-facing notes for keeping an eye on a running IconTale
deployment. All three pillars (logs, metrics, errors) are wired in but
remain opt-in so local dev stays quiet.

## Endpoints

| Path | Purpose | Auth |
|---|---|---|
| `GET /health` | Liveness + readiness probe. `200` when healthy, `503` when degraded. | none |
| `GET /metrics` | Prometheus text exposition. | none — restrict at proxy |

The health response shape:

```json
{
  "status": "ok",
  "uptime": 1234.5,
  "timestamp": "2026-04-23T09:00:00.000Z",
  "version": "3.0.0",
  "node": "v22.22.2",
  "lobbies": 7,
  "redis": "ok",
  "heap": { "used": 12345678, "total": 22345678 },
  "checkMs": 4
}
```

`status` flips to `degraded` and the HTTP code becomes `503` when the
store/Redis probe fails. Load balancers that trust readiness checks
(Render, Kubernetes, Fly) will route traffic away from that pod until
it recovers.

## Metrics reference

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `icontale_socket_events_total` | counter | `event` | Accepted Socket.io events, per event name |
| `icontale_socket_errors_total` | counter | `reason` | Events rejected by middleware (`rate_limited`, `payload_too_large`, …) |
| `icontale_lobby_events_total` | counter | `type` | `created`, `joined`, `closed_inactive` |
| `icontale_stories_submitted_total` | counter | — | Story submissions that passed validation |
| `icontale_guesses_submitted_total` | counter | — | Guess submissions that passed validation |
| `icontale_connected_sockets` | gauge | — | Live socket count on this node |
| `icontale_lobbies_active` | gauge (snapshot) | — | Active lobbies (from store) |
| `icontale_process_uptime_seconds` | gauge (snapshot) | — | Process uptime |
| `icontale_heap_bytes` | gauge (snapshot) | — | V8 `heapUsed` |

Add new metrics in `lib/metrics.ts`. Keep label cardinality low — never
push raw usernames, room codes or error messages as label values.

### Sample Prometheus scrape config

```yaml
scrape_configs:
  - job_name: icontale
    scrape_interval: 30s
    metrics_path: /metrics
    static_configs:
      - targets: ['icontale.example.com']
```

## Error tracking

Set `SENTRY_DSN` to enable [Sentry](https://sentry.io) capture:

| Env | Default | Notes |
|---|---|---|
| `SENTRY_DSN` | unset → disabled | DSN from the Sentry project settings. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Fraction of transactions for performance traces. |

Behaviour:

- Express request errors are captured via
  `sentry.setupExpressErrorHandler(app)`.
- `process.on('uncaughtException')` and `process.on('unhandledRejection')`
  both forward their payload to Sentry before handing back to the
  default crash / log flow.
- PII sending is explicitly disabled (`sendDefaultPii: false`). If you
  need user identifiers, tag them manually and scrub before capture.

## Logging

All structured logs go through [pino](https://getpino.io/) in
`lib/logger.ts`. The log level is driven by the `LOG_LEVEL` env
variable:

- Development: `debug`, pretty-printed.
- Production: `info`, JSON lines — easy to pipe into Datadog, Loki or
  CloudWatch.
