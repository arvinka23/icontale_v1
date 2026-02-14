# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
