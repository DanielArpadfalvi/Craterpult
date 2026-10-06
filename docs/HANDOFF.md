# Craterpult – átadási jegyzet (hideg indulás lokális sessionből)

Utolsó frissítés: 2026-10-06. A felhős fejlesztés a tulajdonos kérésére leállt (credit), innen egy **lokális** Claude Code session folytatja. Olvasd el ezt, majd `CLAUDE.md`, `docs/PLAN.md`, `docs/TASKS.md`, `docs/RELEASE.md`.

## 1. Hol tart a projekt

Körökre osztott artillery (Worms-szerű, saját IP) portré mobilra: rombolható terep, botok, egy telefonos mód, küldetések, napi kihívás. Stack: Vite + TS + PixiJS v8 + Preact + Capacitor 8.

| Mérföldkő | Állapot |
|---|---|
| M0 Alapozás | ✅ |
| M1 Determinisztikus mag (fixpontos fizika, terep, körök, replay) | ✅ |
| M2 Játszható prototípus (render, kamera, csúzli-célzás, hotseat) | ✅ |
| M3 Játékélmény: 16 fegyver, ládák, hirtelen halál, hang, haptika, pályatémák | ✅ (T3.3 témák: main) |
| M4 Botok (szimuláció-alapú, 5 nehézség) | ✅ |
| M5 30 küldetés, gyors meccs beállítások, napi kihívás | ✅ |
| M6 Beállítások, statisztika, csapat-testreszabás, vissza gomb, menü | ✅ (main: `9e2cfe1`) |
| M7 Mobil héj (Capacitor, ikon/splash kódból, Android/iOS CI) | ✅ T7.1 · **T7.2 paywall: kész, de nincs a main-en (lásd 2.)** |
| M8 Kiadás 1.0 (store-szövegek, screenshot-generátor, adatvédelmi oldal, QA) | ⬜ |
| M9 1.1 online (aszinkron meccs) | ⬜ |

Tesztek a main-en: 189 unit (`npm run check`), 25 e2e (`npm run test:e2e`) – mind zöld volt az átadáskor. CI, Android (debug APK → Releases `android-debug-latest`) és iOS (szimulátor) workflow zöld volt az M7 merge-en; az M6 push CI-ját nézd meg.

## 2. Félkész munkák és ágak

- **`t7.2-paywall`** (pusholva, `060b5fd`, a `4cdf61b`-ből ágazik): RevenueCat „Teljes verzió” paywall + restore, gating (`src/game/entitlement.ts`), mock store webre, „store unavailable” natívon kulcs nélkül, lakat-jelvények, `paywall.spec.ts`, RELEASE.md 6. fejezet. Saját ágán 193 unit teszt zöld.
  **Teendő:** merge a main-re. Ütközik az M6 menü-átalakításával: `src/ui/App.tsx` (sheet + PaywallSheet renderelés együtt), `src/ui/Menu.tsx` (a nehézség/csapatméret/pályastílus chipek az M6-ban átkerültek a `QuickScreen`-re – oda kell áttenni a `fvLock`/`FullVersionBadge` jelvényeket; a `FullVersionButton` a főmenübe a „menu-play” sor alá), `tests/e2e/daily.spec.ts` (mindkét változat kell: `boot(page, '&full')` + `open-quick`). Az M6 megszüntette a `toggleSound`-ot és a menü nyelvváltót – a paywall ágon ezek hívásait `updateSettings`/`openSheet`-re kell cserélni. A kalapok (M6: `src/game/profile.ts`) zárolását a `hatsNeedFull()`-ra kell kötni.
- **T3.3 pályatémák:** kész és a main-en (5 téma: hills, islands, cavern, towers, flats; `src/render/themes.ts`, `backdrop.ts`, `ambient.ts`). A `t3.3-themes` ág is pusholva maradt (`0efb2a8`).

## 3. Nyitott döntések / ismert hibák

- Valódi vásárlás (StoreKit/Play Billing, RevenueCat) még sosem futott: kell RevenueCat projekt, termék `craterpult_full_version`, entitlement `full_version`, secretek `VITE_RC_API_KEY_IOS/ANDROID`.
- Az adatvédelmi oldal (`https://danielarpadfalvi.github.io/craterpult-site/privacy.html`) **nincs publikálva** – M8-ban a Swaplight mintájára (`docs/site/` + `scripts/publish-site.sh` + külön `craterpult-site` repó).
- Valódi telefonon még nem futott (haptika, státuszsor, splash, háttérbe tett app → szünet). Natív build csak GitHub Actionsben.
- A 3. fejezet (ász botok) nehézsége nincs végigjátszva; kampány-egyensúly finomhangolás kell.
- Ládák korlátozott arzenálú küldetésekben más fegyvert is adhatnak.
- E2E: a leglassabb folyamatok (hotseat, stats) terhelt gépen 1,5–2 percig futnak (időkorlát 240 s); unit tesztekben a bot/mapgen tesztek lassú gépen a 20 s korlát közelébe érhetnek.
- Android debug kulcs a Swaplighté (nem titkos), release-hez saját upload keystore kell.

## 4. Következő lépések sorrendben

1. `t7.2-paywall` merge a main-re (ütközések: 2. pont), `npm run check && npm run build && npm run test:e2e`, push, CI.
2. M8: store-szövegek EN/HU, screenshot-generátor (Swaplight `scripts/store-frames.ts` + `tests/e2e/store-screens.spec.ts` mintájára), adatvédelmi/támogatási weboldal, korhatár-besorolás, teljes QA-kör 3 képernyőméreten EN/HU.
3. Valódi eszközös teszt a `android-debug-latest` APK-val, egyensúly-finomhangolás (botok, kampány).
4. M9 (1.1): backend-döntés (javaslat: Supabase), aszinkron meccs.

## 5. Dashboard

Élő projekt-dashboard: https://claude.ai/artifact/94fw4py1eoxCoL7aozTVBQ – minden commit, agent indítás/befejezés, kipipált feladat és inputkérés után frissítsd az **ArtifactData** tool-lal (előbb olvasd ki, írást `if_version`-nel pinneld):
- `projects/craterpult`: `milestones` a `docs/TASKS.md`-ből (`## Mx – Cím`, `- [x] Tx.y cím`), `agents` `[{id, label, status: running|done|failed, since, endedAt}]`, `lastCommit {sha, message, at}`, `needsInput [{id, question, since}]`, `state` (active|paused|done), `updatedAt`.
- `feed/main`: `items` elejére `{at, project, kind: commit|task|agent|milestone|input, text}` (magyarul), max 40.
- A Swaplight-dokumentumot (`projects/swaplight`) a Swaplight-session frissíti; legutóbbi állapota: 27/30 feladat kész, T9.2 a tulajdonos store-fiókjaira és secretjeire vár (needsInput), egy teljesítménymérés futott. Egy harmadik projekt (`Pathlings`) is ír a dashboardba egy másik sessionből.

## 6. Lokális futtatás

```bash
git clone https://github.com/DanielArpadfalvi/Craterpult && cd Craterpult
npm ci
npx playwright install chromium   # lokálisan nincs /opt/pw-browsers
npm run dev                       # http://localhost:5173 (?test = test hookok)
npm run check && npm run build && npm run test:e2e
```
Natív: `npx cap sync` után Android Studio / Xcode is használható lokálisan (a felhőben ez nem ment). Ikon/splash újragenerálás: `npm run assets`.
