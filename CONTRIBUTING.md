# Contributing to IconTale

Thank you for your interest in contributing to IconTale! This document provides guidelines to help you get started.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/icontale_v1.git
   cd icontale_v1
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/my-new-feature
   ```

## Development Workflow

### Running Locally

```bash
cp .env.example .env
npm run dev
```

The server starts at `http://localhost:3000` with auto-reload via nodemon.

### Code Style

This project uses **ESLint** and **Prettier** for consistent formatting:

```bash
npm run lint      # Check for lint errors
npm run format    # Auto-format all files
```

Please run both before committing.

### Testing

```bash
npm test          # Run all tests
npm run test:watch  # Watch mode during development
```

All tests must pass before a pull request can be merged.

## Pull Request Process

1. Ensure your code passes linting and all tests.
2. Update documentation if your change affects the public API or user-facing behavior.
3. Write a clear PR description explaining **what** changed and **why**.
4. Keep PRs focused — one feature or fix per PR.
5. Link any relevant issues in the PR description.

## Code Organization

| Directory | Purpose |
|---|---|
| `server.js` | Express & Socket.io server |
| `lib/` | Server-side modules (logging, validation, scoring) |
| `public/js/` | Client-side ES modules |
| `public/` | Static assets (HTML, CSS, icons) |
| `__tests__/` | Vitest test files |

## Commit Messages

Use clear, descriptive commit messages:

- `fix: correct scoring for blind mode when no guesses`
- `feat: add sound toggle preference to localStorage`
- `docs: update Socket.io API documentation`
- `refactor: extract timer logic into separate module`

## Code Review Checklist

Before approving a pull request, reviewers should verify:

- [ ] **Tests pass** — `npm test` exits with 0.
- [ ] **No lint errors** — `npm run lint` is clean.
- [ ] **Input validation** — All user inputs go through `lib/sanitize.js`.
- [ ] **Word filter** — Usernames and stories are checked via `lib/wordfilter.js`.
- [ ] **Error handling** — Socket event handlers are wrapped in try/catch.
- [ ] **No hardcoded secrets** — Environment variables in `.env.example` if needed.
- [ ] **JSDoc types** — New functions and parameters have `@param` / `@returns` tags.
- [ ] **English comments** — All code comments are in English; UI strings may be German.
- [ ] **Consistent naming** — camelCase for variables/functions, PascalCase for types.
- [ ] **No dead code** — Unused functions, variables, and CSS classes are removed.
- [ ] **Memory safety** — Timers and intervals are cleaned up on phase transitions.
- [ ] **Rate limits** — New socket events respect the per-socket rate limiter.

## Reporting Issues

When reporting a bug, please include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser and OS information
- Console errors (if any)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](https://opensource.org/licenses/MIT).
