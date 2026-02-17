# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [3.0.0] - 2026-02-14

### Added

- **TypeScript Migration**: Server-side codebase migrated from JavaScript to TypeScript (`server.ts`, `lib/*.ts`) with strict mode, full type annotations, and compiled output in `dist/`.
- **Shared Types**: Comprehensive type definitions in `lib/types.ts` covering all game entities (Lobby, Player, GameSettings, Guess, Achievement, Replay, etc.).
- **Redis Persistence**: All lobbies, sessions, replays, achievements, and player stats are now persisted in Redis via `lib/store.ts` (ioredis). Server restarts no longer lose game state.
- **Achievement System**: 15 achievements (Erster Schritt, Meistererzähler, Geschwindigkeitsdämon, Unsichtbar, Detektiv, Blind-Meister, Team-Kapitän, Wortkarg, Romanautor, Perfekte Runde, Serien-Sieger, Allrounder, Zuschauer-Profi, Comeback, Marathon) with automatic stat tracking and toast notifications.
- **Replay System**: Games are automatically recorded (`lib/replay.ts`). After game-over, replays can be viewed via the in-app replay viewer or fetched via `GET /replay/:id`.
- **PNG PWA Icons**: Generated via `scripts/generate-icons.js` (using `canvas` package) in 192x192, 512x512, and maskable formats — replacing SVG icons for maximum device compatibility.
- **Test Coverage**: Expanded from 39 to 91 tests across 8 test suites:
  - Unit tests: sanitize, scoring, wordfilter, server-helpers, store, achievements
  - Integration tests: HTTP endpoints, socket lobby management, game flow, security
  - E2E tests: full classic/speed/blind/team game flows, spectator, multi-round, disconnect, settings
- **Replay Viewer UI**: Modal-based timeline replay viewer (`public/js/replay.js`) with navigation controls.
- **Achievement Toast UI**: Animated toast notifications for newly unlocked achievements.
- **Docker Redis**: `docker-compose.yml` now includes Redis 7 service with health checks and persistent volume.

### Changed

- **Build System**: `npm start` now runs compiled `dist/server.js`; `npm run dev` uses `tsx watch` for hot-reload development; `npm run build` compiles TypeScript.
- **Package Scripts**: Added `start:dev`, `test:coverage`, `build:icons`; updated `start` to use compiled output.
- **manifest.json**: Icons updated from SVG to PNG format.
- **Service Worker**: Cache assets updated for PNG icons.
- **CI/CD**: GitHub Actions now includes TypeScript type-checking and build steps; Docker tests use Redis sidecar.
- **Dockerfile**: Multi-stage build (builder stage compiles TypeScript, production stage runs compiled JS).

---

## [2.0.0] - 2026-02-14

### Added

- **Game Modes**: Classic, Speed, Blind, and Team modes with distinct scoring systems.
- **Configurable Lobby Settings**: Timer, word limit, emoji count, rounds, emoji packs — all configurable by the host.
- **Multi-Round Play**: Best of 3 / Best of 5 with cumulative scoring and game-over screen.
- **Spectator Mode**: Watch games live without participating.
- **Tutorial / Onboarding**: First-visit tutorial overlay with step-by-step instructions and game mode descriptions.
- **Reconnect Handling**: Players can reconnect after a temporary disconnect using session tokens.
- **Input Validation & XSS Protection**: Server-side sanitization for usernames, stories, room codes, and settings.
- **Security Headers**: Helmet middleware with CSP, XSS protection, HSTS.
- **Rate Limiting**: HTTP rate limiting (express-rate-limit) and per-socket event throttling.
- **Structured Logging**: Pino logger with environment-aware formatting (pretty for dev, JSON for production).
- **Scoring Module**: Extracted scoring logic into `lib/scoring.js` with POINTS constants and `processRoundResults`.
- **Client-Side ES Modules**: Refactored monolithic `script.js` into 7 specialized modules.
- **State Machine**: Finite state machine (`js/state.js`) for game phase management with cleanup logic.
- **Sound Effects**: Optional WebAudio-based sound effects with localStorage preference.
- **OKLCH Design System**: CSS Custom Properties using OKLCH color format, dark theme.
- **Container Queries**: Component-level responsive design.
- **Print Stylesheet**: Leaderboard-optimized print layout.
- **PWA Icons**: SVG icons in 192x192, 512x512, and maskable formats.
- **SEO Improvements**: JSON-LD structured data, canonical URL, corrected sitemap and robots.txt.
- **Docker Support**: Dockerfile, docker-compose.yml, and .dockerignore.
- **CI/CD Pipeline**: GitHub Actions workflow with tests, audit, and Docker build verification.
- **Test Suite**: Vitest setup with 23 tests covering sanitization and scoring logic.
- **ESLint + Prettier**: Code quality tooling with flat ESLint config.
- **Environment Configuration**: dotenv support with `.env.example` and startup validation.
- **Graceful Shutdown**: SIGTERM/SIGINT handlers for clean server termination.
- **Health Check**: `/health` endpoint for monitoring.

### Changed

- **Express v5 → v4**: Downgraded from unstable Express v5 beta to stable Express v4.21.
- **Service Worker**: Updated to v3 with expanded asset caching including new icons and JS modules.
- **Manifest**: Full PWA manifest with icons, screenshots, and splash screen configuration.
- **HTML Structure**: Replaced inline styles with CSS classes, enhanced ARIA labels, added `<noscript>` fallback.
- **Minimum Node.js**: Raised from v14 to v18.

### Removed

- Monolithic `public/script.js` (replaced by ES modules in `public/js/`).
- Russian comments in server code.
- Unused CSS class `.flex`.

---

## [1.0.0] - 2025-08-17

### Added

- Initial release with single-round classic mode.
- Express + Socket.io server.
- Basic game flow: lobby → writing → guessing → results.
- CSS styling with responsive design.
- PWA manifest and favicon.
- Deployment configs for Heroku, Railway, and Render.
