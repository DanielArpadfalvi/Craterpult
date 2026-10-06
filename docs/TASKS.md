# Task list

Status: `[ ]` todo · `[~]` in progress · `[x]` done (verified). Acceptance criteria (AC) must all hold.

## M0 – Foundation
- [ ] **T0.1 Scaffold** – Vite + TS strict, ESLint + Prettier, Vitest, Playwright (Chromium at /opt/pw-browsers), PixiJS v8, Preact. Portrait canvas + DOM overlay. AC: check/build/e2e smoke pass.
- [ ] **T0.2 CI** – web CI (check, build, e2e).

## M1 – Core engine (`src/core`)
- [ ] **T1.1 RNG + fixed-point math** – seeded PRNG, Q16 helpers (mul, div, sqrt, sin/cos tables). AC: unit tests, no floats in core sim state.
- [ ] **T1.2 Terrain** – mask + materials, circular carve, solidity queries, ground normal, map generator (seeded hills, islands, caves).
- [ ] **T1.3 Physics** – projectile (gravity, wind, bounce, fuse), unit movement (walk, jump, slide, fall damage), collisions, water.
- [ ] **T1.4 Turn/match state machine** – teams, turn timer, retreat time, damage resolution, death, win; event stream; input log + replay + state hash. AC: determinism tests.

## M2 – Playable prototype
- [ ] **T2.1 Renderer** – terrain texture with dirty-rect updates, units, projectiles, camera follow + pinch/pan.
- [ ] **T2.2 Input** – slingshot aiming, move/jump controls, fire.
- [ ] **T2.3 Hotseat 2 players, 3 weapons** (bazooka, grenade, shotgun) + HUD. AC: e2e plays a full turn cycle; screenshots reviewed.

## M3 – Game feel & content
- [ ] T3.1 Explosions, particles, shake, slow-mo, procedural audio, haptics
- [ ] T3.2 16 weapons, crates, sudden death
- [ ] T3.3 Map themes + generator polish

## M4 – Bots
- [ ] T4.1 Simulation-based AI in a Worker, 5 difficulties

## M5 – Modes
- [ ] T5.1 Campaign (30 levels, objectives, stars)
- [ ] T5.2 Quick match vs bots, Daily challenge

## M6 – Meta & UI
- [ ] T6.1 Menu, settings, pause, save (versioned), stats, team customization, EN/HU

## M7 – Mobile shell & monetization
- [ ] T7.1 Capacitor android/ios, icon/splash from code, Android/iOS CI
- [ ] T7.2 RevenueCat full-version paywall + restore

## M8 – Release 1.0
- [ ] T8.1 Store listing EN/HU, screenshot generator, privacy policy, QA pass

## M9 – 1.1 Online
- [ ] T9.1 Backend decision + async match service, invites, push
