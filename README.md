# IconTale

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Express](https://img.shields.io/badge/Express-v4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-v4-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/arvinka23/icontale_v1/actions/workflows/ci.yml/badge.svg)](https://github.com/arvinka23/icontale_v1/actions)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20playwright-6E9F18?logo=vitest&logoColor=white)](#testing)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A570%25-brightgreen)](#testing)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](#docker)

> A real-time multiplayer storytelling game where players write creative stories inspired by emoji combinations, then try to guess each other's emojis and identities.

<!-- Replace with an actual screenshot or GIF of gameplay -->
![IconTale Preview](public/og-image.png)

---

## Table of Contents

- [Overview](#overview)
- [Game Modes](#game-modes)
- [Configurable Settings](#configurable-settings)
- [How to Play](#how-to-play)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Docker](#docker)
- [Project Structure](#project-structure)
- [Socket.io API](#socketio-api)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Overview

IconTale is a browser-based party game designed for 3–20 players. Each round follows three phases:

1. **Writing Phase** — Every player receives random emojis and writes a short story inspired by them.
2. **Guessing Phase** — Each player reads another player's story and guesses the emoji combination and/or the author.
3. **Results Phase** — Stories are revealed one by one in a chat-style discussion, followed by a leaderboard.

Games can run as single rounds or as multi-round matches (Best of 3 / Best of 5).

### Scoring (Classic Mode)

| Action | Points |
|---|---|
| Nobody guessed your emoji combination | +1 |
| Nobody guessed you as the author | +1 |
| Per player who guessed your emoji correctly | +2 |
| Per player who guessed you as the author | +2 |
| You correctly guessed someone's emoji | +0.5 |
| You correctly guessed the author | +0.5 |

Blind mode uses a separate scoring system focused only on author guessing.

---

## Game Modes

| Mode | Description |
|---|---|
| **Classic** | Write stories, guess both emoji combination and author. |
| **Speed** | 60-second timer, max 100 words — fast and intense. |
| **Blind** | No emoji options when guessing — only guess the author. |
| **Team** | Players are randomly split into two teams. Team scores are combined. |

---

## Configurable Settings

The lobby host can configure the following before starting:

| Setting | Options | Default |
|---|---|---|
| Game Mode | Classic, Speed, Blind, Team | Classic |
| Timer | 1 min, 2 min, 3 min, 5 min | 3 min |
| Word Limit | 100, 250, 500 | 500 |
| Emoji Count | 1–5 | 3 |
| Rounds | 1, Best of 3, Best of 5 | 1 |
| Emoji Packs | All, Faces, Animals, Food, Sports, Nature, Objects | All |

Non-host players see the current settings as read-only chips.

---

## How to Play

1. Open the app in your browser.
2. Enter a nickname and choose an emoji avatar.
3. **Create a lobby** to get a 6-character room code, or **join a lobby** by entering an existing code. You can also join as a **spectator**.
4. The host configures game settings and starts the game once at least 3 players have joined.
5. Write a story based on your assigned emojis within the timer.
6. Read another player's story and guess the emoji combination + author (or just the author in Blind mode).
7. Review results together and check the leaderboard.
8. In multi-round games, the host starts the next round until all rounds are complete, then the final scores are shown.

A built-in **tutorial** is shown on first visit and can be reopened via the **?** button at any time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js >= 18 |
| **Language** | TypeScript (server-side, strict mode) |
| **Backend** | Express v4, Socket.io v4 |
| **Database** | Redis (ioredis) — lobby persistence, sessions, achievements, replays |
| **Frontend** | Vanilla HTML5, CSS3, ES Modules |
| **Security** | Helmet, express-rate-limit, input sanitization, word filter |
| **Logging** | Pino (structured JSON logging) |
| **Testing** | Vitest (89 tests: unit, integration, E2E) |
| **Linting** | ESLint (flat config) + Prettier |
| **CI/CD** | GitHub Actions (type-check, build, test, audit, Docker) |
| **Container** | Docker + docker-compose (with Redis) |
| **PWA** | Service Worker, Web App Manifest, PNG icons |
| **Game Features** | Achievements (15), Replays, 4 game modes |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (included with Node.js)

### Installation

```bash
git clone https://github.com/arvinka23/icontale_v1.git
cd icontale_v1
npm install
```

### Environment Configuration

```bash
cp .env.example .env
# Edit .env as needed
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `LOG_LEVEL` | `debug` | Pino log level |

### Run in Development

```bash
npm run dev
```

Uses [tsx](https://github.com/privatenumber/tsx) for TypeScript execution with auto-reload on file changes.

### Run in Production

```bash
npm run build          # Compile TypeScript → dist/
NODE_ENV=production npm start
```

### Available Scripts

| Script | Description |
|---|---|
| `npm start` | Start compiled server (`dist/server.js`) |
| `npm run dev` | Start with tsx watch (hot-reload) |
| `npm run start:dev` | Start with tsx (no watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run all 89 tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |
| `npm run build:css` | Minify CSS for production |
| `npm run build:icons` | Generate PNG icons from canvas |
| `npm run audit` | Security audit |

---

## Docker

### Using docker-compose (recommended)

```bash
docker-compose up -d
```

This starts both the application and Redis with persistent storage, health checks, and automatic restart.

### Build and run manually

```bash
docker build -t icontale .
docker run -p 3000:3000 -e REDIS_URL=redis://your-redis:6379 icontale
```

> **Note:** Redis is a required dependency. The server will not start without a valid `REDIS_URL`.

---

## Project Structure

```
icontale_v1/
├── server.ts                  # Express + Socket.io server (TypeScript)
├── tsconfig.json              # TypeScript configuration (strict mode)
├── lib/
│   ├── types.ts               # Shared type definitions
│   ├── logger.ts              # Pino structured logging
│   ├── sanitize.ts            # Input validation & XSS protection
│   ├── scoring.ts             # Scoring logic for all game modes
│   ├── wordfilter.ts          # Abuse prevention word filter
│   ├── store.ts               # Redis-backed lobby/session persistence
│   ├── achievements.ts        # 15-achievement system with stat tracking
│   └── replay.ts              # Game recording & replay retrieval
├── dist/                      # Compiled JavaScript (git-ignored)
├── scripts/
│   └── generate-icons.js      # PNG icon generator (canvas)
├── public/
│   ├── index.html             # Single-page application
│   ├── styles.css             # OKLCH design system, responsive
│   ├── sw.js                  # Service Worker (PWA caching)
│   ├── manifest.json          # PWA manifest (PNG icons)
│   ├── favicon.ico            # Browser tab icon
│   ├── icon-192.png           # PWA icon 192x192
│   ├── icon-512.png           # PWA icon 512x512
│   ├── icon-maskable.png      # PWA maskable icon
│   ├── og-image.png           # Open Graph preview image
│   ├── robots.txt             # Crawling rules
│   ├── sitemap.xml            # XML sitemap
│   └── js/
│       ├── main.js            # Entry point, event bindings
│       ├── constants.js       # Emojis, mode descriptions
│       ├── state.js           # Finite state machine
│       ├── dom.js             # DOM references & utilities
│       ├── ui.js              # UI rendering for all phases
│       ├── sounds.js          # Optional WebAudio effects
│       ├── socket-handlers.js # Socket.io event handlers
│       └── replay.js          # Replay viewer modal
├── __tests__/
│   ├── sanitize.test.js       # Input validation tests
│   ├── scoring.test.js        # Scoring logic tests
│   ├── server-helpers.test.js # Derangement, room codes, ID replacement
│   ├── wordfilter.test.js     # Word filter tests
│   ├── store.test.js          # Redis store tests (mocked)
│   ├── achievements.test.js   # Achievement system tests
│   ├── integration.test.js    # Socket event integration tests
│   ├── e2e.test.js            # End-to-end game flow tests
│   └── test-server.js         # Shared test server helper
├── .github/workflows/
│   └── ci.yml                 # GitHub Actions CI (type-check, test, Docker)
├── Dockerfile                 # Multi-stage production container
├── docker-compose.yml         # App + Redis orchestration
├── .env.example               # Environment template
├── eslint.config.js           # ESLint flat config
├── .prettierrc                # Prettier config
├── vitest.config.js           # Test runner config
├── Procfile                   # Heroku deployment
├── railway.json               # Railway deployment
├── render.yaml                # Render deployment
├── CONTRIBUTING.md            # Contribution guidelines
├── CHANGELOG.md               # Version history (v1, v2, v3)
└── package.json
```

---

## Socket.io API

Full documentation of all real-time events between client and server.

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `create-lobby` | `{ username, emoji, settings }` | Create a new lobby |
| `join-lobby` | `{ username, roomCode, emoji }` | Join an existing lobby |
| `join-spectator` | `{ roomCode }` | Join as spectator |
| `update-settings` | `{ roomCode, settings }` | Host updates game settings |
| `start-game` | `{ roomCode }` | Host starts the game |
| `submit-story` | `{ roomCode, story }` | Submit a written story |
| `submit-guess` | `{ roomCode, guess }` | Submit emoji + author guess |
| `results-continue` | `{ roomCode }` | Host advances results |
| `leaderboard-phase` | `{ roomCode }` | Host shows leaderboard |
| `next-round` | `{ roomCode }` | Host starts next round |
| `new-game` | `{ roomCode }` | Host returns to lobby |
| `reconnect-session` | `{ sessionToken, roomCode }` | Reconnect after disconnect |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `lobby-created` | `{ roomCode, players, settings }` | Lobby was created |
| `lobby-joined` | `{ roomCode, players, settings }` | Successfully joined lobby |
| `lobby-error` | `{ message }` | Error (full lobby, bad code, etc.) |
| `lobby-closed` | `{ reason }` | Lobby was closed |
| `players-update` | `Player[]` | Player list changed |
| `settings-update` | `Settings` | Settings changed by host |
| `spectators-update` | `number` | Spectator count changed |
| `spectator-joined` | `{ roomCode, players, settings, started, ... }` | Spectator joined |
| `host-changed` | `{ newHost, newHostId }` | Host was reassigned |
| `player-disconnected` | `{ name }` | Player disconnected |
| `player-reconnected` | `{ name }` | Player reconnected |
| `teams-assigned` | `{ teams }` | Teams were assigned (Team mode) |
| `game-started` | `{ settings }` | Game has started |
| `round-started` | `{ emojis, timer, wordLimit, round, totalRounds }` | New round began |
| `writing-progress` | `{ submitted, total }` | Stories submission progress |
| `guess-phase` | `{ story, emojiOptions, playerOptions, ... }` | Guessing phase data |
| `guessing-progress` | `{ submitted, total }` | Guess submission progress |
| `results-phase` | `{ results }` | Results are ready |
| `results-progress` | `{ currentIndex }` | Host advancing results |
| `leaderboard-phase` | `{ leaderboard, leaderboardDetails }` | Leaderboard data |
| `game-over` | `{ leaderboard, leaderboardDetails, teamScores }` | Game ended (multi-round) |
| `back-to-lobby` | `{ players, settings }` | Returned to lobby |
| `story-error` | `{ message }` | Story validation failed |
| `reconnect-success` | `{ roomCode, playerName, ... }` | Reconnection succeeded |
| `reconnect-failed` | `{ reason }` | Reconnection failed |
| `server-shutdown` | — | Server is shutting down |

---

## Testing

IconTale ships with a three-tier test pyramid so regressions get
caught at the cheapest possible layer:

| Layer | Runner | Scope | Command |
|---|---|---|---|
| **Unit** | Vitest | Pure helpers (`lib/sanitize`, `lib/scoring`, `lib/metrics`, …) | `npm test` |
| **Integration** | Vitest + socket.io-client | Socket event surface wired against `lib/store` mock | `npm test` (same invocation) |
| **End-to-end (smoke)** | Playwright + Chromium | Real browser against a live Node server | `npm run test:e2e` |

### Run the full suite

```bash
npm test                    # unit + integration (Vitest)
npm run test:watch          # same, watch mode
npm run test:coverage       # same, with threshold enforcement
npm run test:e2e            # Playwright smoke tests (installs Chromium lazily)
npm run typecheck:client    # tsc --noEmit on public/js/**
```

### Coverage gates

`vitest.config.js` enforces a floor via `coverage.thresholds`:

| Metric | Minimum |
|---|---|
| Lines | 70 % |
| Statements | 70 % |
| Branches | 70 % |
| Functions | 85 % |

Running `npm run test:coverage` locally produces an HTML report
under `coverage/`. CI uploads the same folder as an artefact for
14 days. Ratchet the thresholds up in small steps whenever a PR
adds meaningful coverage — never lower them.

### What the tests actually cover

- **`__tests__/sanitize.test.js`** — HTML escaping, username / story /
  room-code validation, settings allow-listing.
- **`__tests__/scoring.test.js`** — Classic, blind and team scoring,
  derangement-based story assignment.
- **`__tests__/wordfilter.test.js`** — Profanity rejection with and
  without Unicode folding.
- **`__tests__/store.test.js`** — Redis store semantics with an
  in-memory stub (key layout, TTLs, cleanup).
- **`__tests__/achievements.test.js`** — 15-achievement unlock logic.
- **`__tests__/metrics.test.js`** — Prometheus registry behaviour
  (label aggregation, snapshot gauges, error isolation).
- **`__tests__/sentry.test.js`** — DSN-gated init, safe fallbacks.
- **`__tests__/socket-rate-limit.test.js`** — per-event quotas + global
  backstop + payload-size guard.
- **`__tests__/socket-auth.test.js`** — HMAC handshake tokens.
- **`__tests__/locales.test.js`** — Key parity and placeholder parity
  between `public/locales/*.json`.
- **`__tests__/server-helpers.test.js`** — Pure utilities extracted
  from `server.ts`.
- **`__tests__/integration.test.js`** — Real Socket.io client against a
  real test server (`__tests__/test-server.js`). Covers HTTP health +
  metrics endpoints, lobby create/join flow, rate limits.
- **`__tests__/e2e.test.js`** — Full game flow over Socket.io (no
  browser): classic, speed, blind, team modes, reconnect, spectator.
- **`e2e/lobby-flow.spec.js`** — Real browser smoke test (Playwright):
  asserts the page loads, a lobby can be created, a 6-char code
  renders and no console errors fire.

### Writing new tests

- Put unit tests next to existing ones under `__tests__/`.
- Add Playwright scenarios under `e2e/` using `*.spec.js`.
- See [`docs/CLIENT_TYPES.md`](docs/CLIENT_TYPES.md) for JSDoc
  conventions if you add client-side code.
- See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a map of
  which layer owns which behaviour.

---

## Deployment

Deployment configurations are included for multiple platforms:

### Heroku

```bash
heroku create
git push heroku main
```

### Railway

Connect the GitHub repository on [Railway](https://railway.app/). The `railway.json` config handles the rest.

### Render

Connect the GitHub repository on [Render](https://render.com/). The `render.yaml` defines the web service.

### Docker (Self-hosted)

```bash
docker-compose up -d
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## Known Limitations

- **Redis recommended:** When `REDIS_URL` is set, lobbies, sessions, achievements, and replays are persisted in Redis. The server restores active lobbies on restart. Without Redis, an in-memory fallback is used and all state is lost on restart.
- **Single instance only:** Horizontal scaling requires a shared store (Redis) **and** the Socket.io Redis adapter, which is not yet implemented.
- **No authentication:** There is no user account system. Players are identified by session tokens during a single game.

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---

Built by [Arvin Ka](https://github.com/arvinka23)
