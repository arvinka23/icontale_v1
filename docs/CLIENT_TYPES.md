# Client-side type checking

The browser bundle lives in `public/js/` as plain ES-module JavaScript,
but every file passes through `tsc --noEmit` in CI. This doc explains
the setup and how to keep it green when you touch client code.

## What runs

```
npm run typecheck:client     # tsc -p tsconfig.client.json --noEmit
```

`tsconfig.client.json` differs from the server config:

- `allowJs: true`, `checkJs: true`, `noEmit: true` — no compilation,
  just verification.
- `lib: ["ES2022", "DOM", "DOM.Iterable"]` — browser APIs are visible.
- `strict: false` — we opted out of the stricter flags for the initial
  pass. `noImplicitOverride` stays on; the rest can be enabled per-file
  with `// @ts-check` once ready.

## Shared types

Server-side types live in `lib/types.ts`. The client re-exports the
relevant ones from `public/js/types.d.ts` so JSDoc annotations in the
client stay in sync with Socket.io payloads:

```js
/** @param {import('./types').Player[]} players */
function updatePlayersList(players) { /* … */ }
```

Only re-export what the client actually needs. Avoid pulling in server-
only types (store entries, achievements, etc.) because they drag lots
of incidental dependencies into the client check.

## Annotation patterns

### Caching DOM references

`public/js/dom.js` declares one big JSDoc object type covering every
cached reference. When you add a new element, update that type so
`.value` / `.checked` / `.disabled` are visible to the checker.

### Querying DOM nodes dynamically

Use the two local helpers in `public/js/ui.js` instead of raw
`querySelector`/`querySelectorAll`:

```js
const inputs = qsa(root, 'input[type="checkbox"]');
const active = qs(container, '.setting-btn.active');
```

They keep the result element type accurate so downstream accesses
don't need manual casts.

### Socket payloads

The ClientSocket interface in `types.d.ts` types `on(event, handler)`
with `handler: (...args: any[])` on purpose, so each handler body can
declare its expected payload with a JSDoc `@typedef` or inline cast:

```js
socket.on('round-started', (data) => {
    /** @type {{ emojis: string[]; writingStartTime: number }} */
    const { emojis, writingStartTime } = data;
});
```

### Casting

Prefer expression-level JSDoc casts over `@ts-ignore`:

```js
const el = /** @type {HTMLButtonElement} */ (e.target);
```

Reserve `@ts-ignore` for genuinely third-party gaps (e.g. the global
`window.io` from `socket.io.js`). When you do use it, add a one-line
comment above it explaining why.

## Tightening over time

The current config is intentionally lenient. Upgrades we want later:

- Flip `strictNullChecks: true` module by module (start with the
  smallest files).
- Flip `noImplicitAny: true`.
- Migrate modules to real `.ts` / `.mts` files so the tooling stops
  depending on JSDoc prose.

Each of these is tracked in [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md).
