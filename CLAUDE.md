# Craterpult – contributor guide (for humans and agents)

Turn-based artillery game (destructible terrain, bots, hotseat; async online in 1.1), portrait mobile. Plan: `docs/PLAN.md` (Hungarian). Task list / status: `docs/TASKS.md`.

## Getting started (read first)
- **New session? Read `docs/HANDOFF.md` first**: current state, open branches, next steps, the live dashboard update rules and local setup notes. Then read the latest entries of `docs/SESSION-LOG.md` and continue from its "Next" line – the owner should never have to explain where work stopped.

## Session continuity (owner rule, always)
- Work autonomously: do not ask the owner what to do next; pick the next item from `docs/HANDOFF.md` / `docs/TASKS.md`.
- Work on `main`; when a task is done and `npm run check` (+ relevant e2e) passes, commit and push to `main`.
- **Every finished task updates the progress summary in the same commit:** the current session's entry in `docs/SESSION-LOG.md` (newest on top: date, what was done with commit SHAs, state, open items, the next step) and `docs/HANDOFF.md` when the overall state changed. A session that stops at any point must leave the log good enough for a cold start.

## Stack
Vite + TypeScript (strict) · PixiJS v8 (gameplay canvas) · Preact (DOM UI overlay) · Capacitor (iOS/Android) · Vitest · Playwright.

## Architecture rules
- `src/core/` is pure, deterministic game logic: no DOM, no Pixi, no `Math.random`, no `Date.now`, **no floating point in simulation state** (fixed-point helpers in `src/core/fixed.ts`). Seeded RNG from `src/core/rng.ts`. Fixed 60 Hz ticks. Every match must be replayable from seed + input log on every platform.
- `src/render/` reads core state and draws it; it never mutates core state.
- `src/platform/` wraps every native/Capacitor API behind an interface with a web/mock implementation. No other module imports `@capacitor/*` directly.
- All user-visible strings go through `src/i18n/` (EN + HU).
- No external bitmap assets: graphics are generated in code (Pixi Graphics/filters, SVG).
- Original IP only: never use "Worms" or other trademarked names/designs.

## Commands
- `npm run dev` – dev server
- `npm run check` – typecheck + lint + unit tests (must pass before every commit)
- `npm run test:e2e` – Playwright (Chromium at /opt/pw-browsers; never run `playwright install`)
- `npm run build` – production web build

## Conventions
- Small focused modules, named exports, no default exports.
- Unit tests in `tests/unit/**`, e2e in `tests/e2e/**`.
- Core logic changes need unit tests. Bug fixes need a regression test.
- Native Android/iOS builds run only in GitHub Actions (dl.google.com is blocked in the cloud dev container).
