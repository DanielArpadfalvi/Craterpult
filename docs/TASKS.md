# Task list

Status: `[ ]` todo · `[~]` in progress · `[x]` done (verified). Acceptance criteria (AC) must all hold.

## M0 – Foundation
- [x] **T0.1 Scaffold** – Vite + TS strict, ESLint + Prettier, Vitest, Playwright (Chromium at /opt/pw-browsers), PixiJS v8, Preact. Portrait canvas + DOM overlay. AC: check/build/e2e smoke pass.
- [x] **T0.2 CI** – web CI (check, build, e2e).

## M1 – Core engine (`src/core`)
- [x] **T1.1 RNG + fixed-point math** – seeded PRNG, Q16 helpers (mul, div, sqrt, sin/cos tables). AC: unit tests, no floats in core sim state.
- [x] **T1.2 Terrain** – mask + materials, circular carve, solidity queries, ground normal, map generator (seeded hills, islands, caves).
- [x] **T1.3 Physics** – projectile (gravity, wind, bounce, fuse), unit movement (walk, jump, slide, fall damage), collisions, water.
- [x] **T1.4 Turn/match state machine** – teams, turn timer, retreat time, damage resolution, death, win; event stream; input log + replay + state hash. AC: determinism tests.

## M2 – Playable prototype
- [x] **T2.1 Renderer** – terrain texture with dirty-rect updates, units, projectiles, camera follow + pinch/pan.
- [x] **T2.2 Input** – slingshot aiming, move/jump controls, fire.
- [x] **T2.3 Hotseat 2 players, 3 weapons** (bazooka, grenade, shotgun) + HUD. AC: e2e plays a full turn cycle; screenshots reviewed.

## M3 – Game feel & content
- [x] T3.1 Explosions, particles, shake, procedural audio, haptics (slow-mo: later polish)
- [x] T3.2 16 weapons, crates, sudden death
- [x] T3.3 Map themes + generator polish (per-style render themes: sky, parallax silhouettes, terrain/water palettes, ambient life)

## M4 – Bots
- [x] T4.1 Simulation-based AI, 5 difficulties (time-sliced on the main thread instead of a Worker)

## M5 – Modes
- [x] T5.1 Campaign (30 levels, objectives, stars) – 3×10 missions (bot 1→5, map styles, arsenals, physics), 1–3 stars, chapter unlocks, versioned save
- [x] T5.2 Quick match vs bots, Daily challenge – team size + map style chips; date-seeded daily with modifier, official attempt, score, best + streak

## M6 – Meta & UI
- [x] T6.1 Menu, settings, pause, save (versioned), stats, team customization, EN/HU – save v2 (settings/team/quick choices/stats, v1 migration, legacy mute/lang keys imported); settings (language, sound, haptics, turn time, reduced motion, larger text, aim preview, two-step reset), stats per mode, team name/color/hat (3 hats unlocked by stars), back/Escape navigation, pause restart/settings

## M7 – Mobile shell & monetization
- [x] T7.1 Capacitor android/ios, icon/splash from code, Android/iOS CI – Capacitor 8 shell (com.arpadfalvi.craterpult, portrait, iPhone-only), `npm run assets`, platform layer (storage/haptics/lifecycle/system UI), android.yml + ios.yml, docs/RELEASE.md; native builds verified only in GitHub Actions
- [x] T7.2 RevenueCat full-version paywall + restore – one non-consumable `craterpult_full_version` (entitlement `full_version`); free: chapter 1, bots 1–2, teams ≤3, hills/islands, pass & play; Full Version: chapters 2–3, bots 3–5, team size 4, Daily, all map styles, cosmetic hats (crown/horns/halo; plain team shapes stay free); neon sheet (price from store, buy, restore, Terms/Privacy, pending/cancel/fail/success states), lock badges + menu button; RevenueCat via platform layer, native build without key = "store unavailable" (never free); web mock + `?test` hooks; merged onto M6 (lock badges on the quick-options screen and team hats); real store purchases verified only on device

## M8 – Release 1.0
- [x] T8.1 Store listing EN/HU, screenshot generator, privacy policy, QA pass
- [x] T8.2 QA fixes – UI & release hygiene: menu squeeze at 360×640, Settings "About" (privacy, support, restore, version), paywall legal links above the fold, back button (hotseat hand-over → pause, main menu → minimize), wind gauge value, weapon-sheet strip, consistent team name, listing hat wording, versions 1.0.0 (package.json, Android, iOS), hidden sourcemaps, dead code, iOS PrivacyInfo, meta.spec teardown flake
- [ ] T8.3 QA fixes – gameplay: off-screen enemy indicators + match-start pan, campaign chapter 2–3 balance (sim-verified), HUD publish re-render throttling
- [ ] T8.4 Owner: craterpult-site repo + Pages, support mailbox, RevenueCat project/product/secrets, sandbox purchase on device

## M9 – 1.1 Online
- [ ] T9.1 Backend decision + async match service, invites, push
