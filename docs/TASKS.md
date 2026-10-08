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
- [x] T8.3 QA fixes – gameplay: off-screen enemy indicators + match-start pan, campaign chapter 2–3 balance (sim-verified), HUD publish re-render throttling
- [~] T8.4 Owner: ~~craterpult-site repo~~ (done, site pushed 2026-10-06), ~~GitHub Pages enable~~ (done, privacy/support live), ~~support mailbox craterpult.support@gmail.com~~ (done), RevenueCat project/product/secrets – open, sandbox purchase on device – open

## M9 – 1.1 Online
- [x] T9.1 Backend decision + async match service, invites, push – Supabase (ADR in `docs/ONLINE.md`); server stores params + turns (command log + state hash), never simulates; clients rebuild by verified replay (`src/core/online.ts`), the opponent's last turn plays back live (skippable), desync detection; `OnlineService` (Supabase over plain HTTP, localStorage mock for web/e2e, "unavailable" natively without config); SQL schema/RLS/RPCs + push trigger + `notify-turn` edge function (FCM v1 / APNs, EN/HU); lobby (invite code, share, join, lists, resign), waiting/desync overlays, outbox with retry; create = Full Version, join = free; deep link `craterpult://join/CODE` + site `join.html`; push opt-in via `VITE_PUSH_ENABLED`; stats mode "Online"; verified with unit tests + two-player e2e on the mock (real backend untested)
- [x] T9.3 Online rematch – `rematch_match` RPC (migration `20261008120000_rematch.sql`: `reserved`/`rematch`/`rematch_by`, shared `open_match`), mock with the same rules; either player (free too) offers from the finished row or the game-over card, the offer is reserved for the old opponent and shows under "Your turn" as "Accept rematch"; accepting joins and moves first; cancel withdraws it; unit tests + e2e (offer → accept → play)
- [x] T9.4 Online reply time limit – 72 h per move from the last change of an active match; `claim_timeout` RPC (migration `20261008140000_reply_timeout.sql`, `timed_out` column; server clock decides), mock with the same rules; time left in the lobby rows ("they have 2d 5h left" / "… left to move"), "Claim the win" in the list and on the waiting card, claimable matches listed under "Your turn", end reason on the game-over card (resigned / ran out of time), rule note under "New match"; unit tests + e2e
- [x] T9.5 Online turn-start signal (no retrying a shot by leaving) – `start_turn` RPC (migration `20261008160000_turn_start.sql`, `started_turn`, reply clock untouched) on the first command of a local turn; the half-played turn is saved on the device (on input, every second, on leave) and continues where it stopped on reopen (the opponent's turn is not replayed again); a turn the server saw begin without a local record is forfeited (forced skip); EN/HU toasts; unit tests (OnlinePlay resume/forfeit, mock/Supabase) + e2e
- [x] T9.6 More pushes – rematch offer (to the old opponent; tap opens the list) and a reminder 12 h before the reply time runs out (hourly `pg_cron` job `remind_slow_movers`, once per turn); migration `20261008180000_push_rematch_reminder.sql` (`post_notify`, `reminded_turn`), edge function picks recipient/text by `kind` (`message.ts`, EN/HU); unit tests + SQL checked on PGlite with stubbed vault/pg_net/pg_cron
- [x] T9.7 Online privacy & data retention – privacy page EN/HU online section (Supabase processor, data list, purpose/legal basis, retention, FCM/APNs, deletion request by team name + invite code), daily `pg_cron` purge `purge_old_data` (migration `20261008200000_retention.sql`: finished 90 d, unjoined invites 30 d, abandoned 180 d, push tokens 180 d, orphan anonymous users), `docs/store-privacy-answers.md` 7 (Data safety / App Privacy / manifest / age rating for 1.1); SQL checked on PGlite
- [x] T9.8 Fix: online matches that ended by resignation / time-out (or were never watched to the end) were missing from the stats – the controller counts every finished match once on first sight (list or live), regression test `tests/unit/game/online.test.ts`
- [ ] T9.2 Owner: Supabase project (anonymous sign-ins, migrations, `VITE_SUPABASE_URL/ANON_KEY`), optional push (Firebase `google-services.json` + FCM service account, APNs key, Vault secrets, `notify-turn` deploy, `VITE_PUSH_ENABLED=1`), two-device match test, ~~publish the updated privacy page~~ (done 2026-10-08, site `a2a0715`), fill the store data forms per `docs/store-privacy-answers.md` 7 (see `docs/ONLINE.md` 4)

## M10 – Localization
- [x] T10.1 German – `src/i18n/de.ts` (+ missions/paywall/online), `LANGUAGES` + device-language detection (`de-*` → German), settings picker from the list, every dictionary names every language, legacy language import for any language, push texts per language (`message.ts`, migration `20261008220000_push_languages.sql`: en/hu/de/es/pt), German store listing `store/listing/de` (+ DE banned words in `store:check`), e2e layout checks at 360 px in DE (menu, screens, paywall)
- [ ] T10.2 Spanish (es)
- [ ] T10.3 Brazilian Portuguese (pt)
- [ ] T10.4 Store screenshots per language (DE/ES/PT captions in `scripts/store-frames.ts`)
