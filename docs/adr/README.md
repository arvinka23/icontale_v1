# Architecture Decision Records

This folder holds short, numbered records of architectural decisions
made in IconTale. Each ADR captures **why** a choice was made — not
just what the code ended up doing — so future contributors can
rediscover context without archaeology through git blame.

## When to write one

Write an ADR when the change:

- introduces, replaces or removes a third-party dependency that many
  modules will touch (e.g. swapping Socket.io for plain WebSockets),
- commits the app to a particular protocol or data shape that is
  hard to walk back (e.g. the room-code charset, the Socket.io event
  naming convention),
- closes off an obvious alternative that a future reader might
  otherwise reopen.

Small refactors, bug fixes and feature additions don't need an ADR —
the commit message is enough.

## Format

Use `NNNN-short-kebab-title.md`, zero-padded, monotonically
increasing. Follow the template below.

```markdown
# ADR-NNNN: Short Title

- **Status**: Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date**: YYYY-MM-DD
- **Deciders**: @username (and any co-authors)

## Context

What problem are we solving? What constraints apply? What evidence
did we consider?

## Decision

Exactly what we decided, in one or two sentences.

## Consequences

- Positive: what gets better.
- Negative: what gets harder or carries risk.
- Follow-ups: any TODOs this decision creates.

## Alternatives considered

Brief mention of the options that were rejected and why.
```

## Index

| Nr | Title |
|---|---|
| [0001](0001-keep-jsdoc-instead-of-full-typescript.md) | Keep JSDoc on the client instead of migrating to TypeScript |
