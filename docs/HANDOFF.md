# Craterpult – átadási jegyzet (hideg indulás lokális sessionből)

Utolsó frissítés: 2026-10-06 (M9 merge után). A felhős fejlesztés a tulajdonos kérésére leállt (credit), innen egy **lokális** Claude Code session folytatja. Olvasd el ezt, majd `CLAUDE.md`, `docs/PLAN.md`, `docs/TASKS.md`, `docs/RELEASE.md`, `docs/ONLINE.md`.

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
| M7 Mobil héj (Capacitor, ikon/splash kódból, Android/iOS CI), T7.2 paywall | ✅ (T7.2 merge a main-re: 2026-10-06) |
| M8 Kiadás 1.0 (store-szövegek, screenshot-generátor, adatvédelmi oldal, QA T8.1–T8.3) | ✅ kód kész; T8.4 tulajdonosi lépések: RevenueCat + sandbox vásárlás eszközön |
| M9 1.1 online (aszinkron meccs) | ✅ kód kész, mock backenddel tesztelve; T9.2: Supabase-projekt + push-kulcsok (tulajdonos), két eszközös teszt |

Tesztek a main-en: 288+ unit (`npm run check`), 40 e2e (`npm run test:e2e`, köztük `online.spec.ts`). Párhuzamos e2e futtatáshoz: `PW_PORT=<port> npm run test:e2e`. CI, Android (debug APK → Releases `android-debug-latest`) és iOS (szimulátor) workflow a push után ellenőrizendő.

## 2. Félkész munkák és ágak

- **M9 online:** `m9-online` ágon készült, merge-elve a main-re (2026-10-06). Részletek, döntés (Supabase), architektúra és a **tulajdonosi beállítási lépések**: `docs/ONLINE.md`. A játék csak az `OnlineService` interfészt látja; weben/tesztben localStorage-mock, natívon backend-config nélkül „nem érhető el”.
- **T8.3** (orchestrator session agentje): kamera-túra a meccs elején, képernyőn kívüli ellenfél-nyilak, kampány-egyensúly (`npm run sim:campaign`), HUD csak változáskor – a main-en (`8a90b5c`).
- Régi ágak a remote-on: `t7.2-paywall`, `t3.3-themes` (merge-elve, csak archívum).

## 3. Nyitott döntések / ismert hibák

- **Tulajdonosi döntés kell:** Supabase-projekt létrehozása (melyik fiók/régió, ingyenes szint) – amíg nincs, natívon az Online nem érhető el. Push: Firebase-projekt + APNs-kulcs. Lásd `docs/ONLINE.md` 4.
- A 1.1 kiadása előtt az adatvédelmi oldalt és a store-kérdőívet bővíteni kell az online adatokkal (anonim azonosító, csapatnév, körök, push-token).
- Valódi vásárlás (StoreKit/Play Billing, RevenueCat) még sosem futott: kell RevenueCat projekt, termék `craterpult_full_version`, entitlement `full_version`, secretek `VITE_RC_API_KEY_IOS/ANDROID`.
- A weboldal él: `https://danielarpadfalvi.github.io/craterpult-site/` (privacy, support, join). Frissítés: `scripts/publish-site.sh ../craterpult-site`, majd commit + push abban a repóban.
- Valódi telefonon még nem futott (haptika, státuszsor, splash, háttérbe tett app → szünet, push, deep link). Natív build csak GitHub Actionsben.
- Online korlátok (1.1): a saját kör közbeni kilépés után a kör újrajátszható; a győztest a kliens állítja (a másik kliens hash-sel ellenőrzi); nincs válasz-időkorlát.
- Ládák korlátozott arzenálú küldetésekben más fegyvert is adhatnak.
- E2E: a leglassabb folyamatok (hotseat, stats) terhelt gépen 1,5–2 percig futnak (időkorlát 240 s).
- Android debug kulcs a Swaplighté (nem titkos), release-hez saját upload keystore kell.

## 4. Következő lépések sorrendben

1. CI (CI, Android, iOS) ellenőrzése a legutóbbi push után.
2. Tulajdonos: RevenueCat (T8.4), Supabase + push (T9.2) – utána valódi eszközös teszt (vásárlás, két eszközös online meccs).
3. 1.0 kiadás a store-okba (`docs/RELEASE.md`, checklisták); 1.1-hez adatvédelmi oldal + kérdőív frissítése.
4. Online továbbfejlesztés (ötletek): kör-kezdés jelzése a szervernek (újrapróbálás ellen), válasz-időkorlát, visszavágó gomb, barátlista.

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
