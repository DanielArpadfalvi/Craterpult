# Session log – where each session left off

Newest on top. Every finished task updates the current entry in the same commit (rule in
`CLAUDE.md` → "Session continuity"). A new session: read `docs/HANDOFF.md`, then the top entry
here, and continue from its **Next** line.

---

## 2026-10-08 – cloud session (claude/funny-curie-v9b41i → main)

**Mode:** autonomous, directly on `main`, merge/push after every task (owner's instruction).

**Done (all on `main`, CI green unless noted):**
- `7e00277` T9.3 online rematch (+ merged the old `qa-pass-1007` branch).
- `fa846ee` T9.4 72-hour reply limit, "Claim the win".
- `1d4eb07` T9.5 turn-start signal: leaving mid-turn continues the turn / forfeits it without a local record.
- `842820f` T9.6 pushes: rematch offer + reminder 12 h before the deadline (`pg_cron`).
- `678075e` + `7ab9929` T9.7 privacy page online section (EN/HU, published to craterpult-site `a2a0715`), daily data purge, 1.1 store privacy answers (`docs/store-privacy-answers.md` 7).
- `6526ad8` T9.8 fix: resigned / timed-out / unwatched online matches now count in the stats.
- `3b68b4b` CI: Android pre-release re-creation retries (fixed a red run on `842820f`).
- T10.4 store screenshots in every listing language (captions, locale, crew name per language; generated and checked DE/PT on Android) (commit: see `git log`, "T10.4").
- `7b31123` T10.3 Brazilian Portuguese (`pt`) + wrapping language picker.
- `5091b6a` T10.2 Spanish (`es`): dictionaries, push texts, store listing, e2e layout checks.
- `2e2e041` T10.1 German localization: `src/i18n/*.de.ts`, `LANGUAGES` list + device-language detection, settings picker, e2e layout checks in DE, German store listing (`store/listing/de`), push texts per language (migration `20261008220000_push_languages.sql`).

**State:** all code verified with unit tests, e2e (mock backend) and PGlite for the SQL. Nothing runs on a real Supabase yet (no project). 7 SQL migrations in `supabase/migrations/` to apply in order.

**Waiting on the owner:** Supabase project + `pg_cron` (T9.2, `docs/ONLINE.md` 4), RevenueCat (T8.4), store data forms per `docs/store-privacy-answers.md` 7, iOS privacy manifest for 1.1.

**Next:** T10.5 public site in DE/ES/PT (`docs/site/*`: language switch in `lang.js` + CSS for 5 languages, then index, join, support and the privacy policy translated – the store listings in those languages link to it), publish with `scripts/publish-site.sh` to the craterpult-site repo (clone it next to this repo; push to its `main`).
