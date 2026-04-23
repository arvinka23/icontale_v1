# ADR-0001: Keep JSDoc on the client instead of migrating to TypeScript

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: @arvinka23

## Context

The server side of IconTale is written in TypeScript (strict mode).
The browser bundle in `public/js/` remained plain ES-module JavaScript
with scattered JSDoc annotations. We wanted type safety for the client
too so regressions like "Element has no property `value`" stop
shipping, but a full migration to `.ts` carried real costs:

- There is no bundler in the pipeline today; the browser loads
  `public/js/main.js` as an ES module directly. Adding a bundler
  (esbuild, vite, rollup) is a separate, bigger decision with its
  own ADR-shaped consequences (cache invalidation, sourcemaps,
  deploy story, service-worker shell cache changes).
- A rename-heavy `.js → .ts` PR makes reviewing behavioural diffs
  harder and invites bugs during the transition.
- Mature JSDoc annotations plus `tsc --noEmit --checkJs` cover ~90 %
  of the safety net of a full migration. The remaining gap is mostly
  around discriminated unions and strict generics — features the
  client code does not rely on today.

## Decision

Treat `public/js/**` as a **type-checked JavaScript** project:

- Authoring language remains ES-module JavaScript. No `.ts` files
  below `public/js/` for now.
- A dedicated `tsconfig.client.json` enables `allowJs`, `checkJs`,
  `noEmit` plus the `DOM` lib. `strict` is deliberately `false`
  with an explicit floor of `noImplicitOverride: true`.
- Shared shapes are defined **once** in `lib/types.ts` and
  re-exported for the client through `public/js/types.d.ts`.
- Client-only helper types (e.g. `ClientSocket`, `IconTaleState`)
  live in `public/js/types.d.ts`.
- CI runs `npm run typecheck:client` as a required step.

## Consequences

- **Positive**
  - Zero build-time overhead; the browser keeps loading `*.js`
    directly from `public/js/` as before.
  - Full editor autocomplete, rename refactoring and error
    highlighting through the existing TypeScript tooling.
  - Encourages writing JSDoc — which also ships as inline docs
    for anyone reading the source without an IDE.
  - Incremental strictness is possible: we can flip
    `strictNullChecks` or `noImplicitAny` per module via
    `// @ts-check` + `// @ts-strict` comments as we go.
- **Negative**
  - Some TypeScript idioms (const-assertions, conditional types,
    template literal types) are awkward in JSDoc.
  - Contributors used to `.ts` syntax have to remember the JSDoc
    incantations (`@param {import('./types').X}`).
- **Follow-ups**
  - If and when we adopt a bundler, revisit this decision; the cost
    of a full migration drops dramatically at that point.
  - `CLIENT_TYPES.md` lists specific strictness flags to turn on
    module-by-module.

## Alternatives considered

- **Full TypeScript migration of `public/js/**`.** Rejected because
  it requires introducing a bundler first (the browser still needs
  `.js` output) and the current JSDoc coverage already catches the
  bugs the migration would prevent.
- **Rewrite the client in a framework (React/Solid/Svelte/Vue).**
  Out of scope — unrelated to the type-safety question and would
  invalidate most of the current UI code.
- **Ship no client-side type-checking at all.** Rejected. The
  45-error baseline uncovered during the JSDoc pass showed real
  defects (wrong element subtypes, missing null guards).
