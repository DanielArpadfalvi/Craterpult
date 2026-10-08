# Craterpult – contributor guide (for humans and agents)

Turn-based artillery game (destructible terrain, bots, hotseat; async online in 1.1), portrait mobile. Plan: `docs/PLAN.md` (Hungarian). Task list / status: `docs/TASKS.md`.

## Getting started (read first)
- **New session? Read `docs/HANDOFF.md` first**: current state, open branches, next steps, the live dashboard update rules and local setup notes.
- **Session progress log (mandatory, every session):** keep `docs/HANDOFF.md` current so a fresh session can pick up the thread with no explanation from the owner. Update it in the same commit as the work (at least after every finished task and before the session ends or pauses): bump the "Utolsó frissítés" line, record what was done, where work stopped (branch, last commit, half-finished items, failing tests), open questions waiting on the owner, and the exact next step. Write it in Hungarian, keep it a concise summary (replace stale info rather than appending a diary).

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
