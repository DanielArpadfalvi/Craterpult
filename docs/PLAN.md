# Craterpult – megvalósítási terv

> Munkacím: **Craterpult** (később átnevezhető). Worms-szerű, körökre osztott artillery játék portré módban,
> rombolható terepen, offline botokkal és egy-telefonos (hotseat) móddal; aszinkron online meccs barátokkal a 1.1-ben.
> Forrás: `swaplight/docs/market-research-2026-10.md`, #2 (Igény 4 · Rés 5 · Megval. 4 · Trend 3).
> A Worms W.M.D Mobilize 2025 márciusában lekerült a Google Playről; a műfaj mobilon gyakorlatilag üres.

---

## 1. Játékterv (GDD)

### 1.1 Alapmechanika
- **Portré mód, egy kézzel játszható.** A pálya szélesebb a képernyőnél (kb. 3 képernyőnyi), a kamera követi az
  aktív egységet és a lövedéket; két ujjal nagyítás/görgetés.
- **Csapatok:** 2–4 csapat, csapatonként 2–4 egység („Kráterek”, kis neon lények). 100 HP, víz/űr alá esés = kiesés.
- **Kör:** 45 mp (állítható). Az aktív egység mozoghat (bal/jobb, ugrás, hátraszaltó), majd **egy** fegyvert használ;
  lövés után 3 mp „menekülési idő”. Szél körönként változik (−10…+10).
- **Célzás touch-ra tervezve:** húzás az egységtől („csúzli”-gesztus) → szög + erő, előnézeti ív az első szakaszra
  (nehézségtől függően rövidebb/hosszabb). Finomhangoló ±1° gombok. Nincs időzített gombnyomva-tartás.
- **Rombolható terep:** bitmaszkos terep (1 px = 1 cella), robbanás kör alakú lyukat vág; a terep anyaga
  (föld / kő / fém) eltérően törik. Egységek csúsznak, esnek, esési sebzés.
- **Determinisztikus szimuláció:** fix 60 Hz tick, egész/fixpontos fizika, seedelt RNG. Egy kör = seed + input log
  → **pontosan visszajátszható**. Ez az alapja a botoknak, a visszajátszásnak és az aszinkron online meccsnek
  (a szerver csak köröket továbbít, nem szimulál).

### 1.2 Fegyverek (1.0: ~16)
| Csoport | Példák |
|---|---|
| Alap | Bazooka (széltől függ), Gránát (időzítő 1–5 mp, pattog), Shotgun (2 lövés, egyenes) |
| Taktikai | Kötél / kampó (mozgás), Ásó (alagút), Gerenda (híd), Teleport |
| Terület | Kazetta-gránát, Napalm-csepp, Légicsapás (célpont kijelölés), Akna |
| Különleges | Ugráló „Bárány”-szerű élő bomba (saját karakter!), Földrengés, Fekete lyuk, Szuper-ütés |
- Fegyverkészlet módonként (korlátos lőszer), ládák körök között (fegyver / gyógyítás), hirtelen halál a
  meccs végén (emelkedő víz).
- **Saját, eredeti dizájn** – sem név, sem kinézet nem utal a Worms-ra (védjegy).

### 1.3 Játékmódok
| Mód | Leírás | Ingyenes? |
|---|---|---|
| **Küldetés (Campaign)** | ~30 kézzel hangolt pálya botok ellen, célokkal (pl. „győzz 3 körön belül”, „csak gránáttal”), csillagok | 1. fejezet (10) ingyen |
| **Gyors meccs vs. bot** | Generált pálya, 1–3 bot, 5 nehézség | Könnyű/Közepes ingyen |
| **Hotseat** | 2–4 játékos egy telefonon, körönként átadva (képernyő-takaró „Te jössz, X!”) | Igen |
| **Napi kihívás** | Napi seed + szabálymódosító, egy hivatalos próbálkozás, sorozat | Teljes verzió |
| **Aszinkron online (1.1)** | Barát meghívása kóddal/linkkel, lépj amikor ráérsz, push értesítés | Teljes verzió |

### 1.4 Botok (AI)
- A determinisztikus szimuláció miatt a bot **ugyanazzal a motorral próbálgat**: jelölt (fegyver, szög, erő)
  hármasokat szimulál gyorsított, render nélküli módban, és a legjobb pontszámút választja
  (sebzés ellenfélnek − saját sebzés − önveszély). Nehézség = mintaszám + szándékos zaj + fegyvertudás.
- Időkeret: max ~150 ms/kör a gyenge telefonokon is (Web Worker).

### 1.5 Meta & monetizáció
- Ingyenes + **egyszeri „Teljes verzió” (~4,99 USD)**. Nincs reklám, nincs energia, nincs fogyóeszköz, nincs
  fizetős erő. „Vásárlások visszaállítása”.
- Teljes verzió: összes küldetés, összes bot-nehézség, Napi kihívás, online mód (1.1), extra csapat-testreszabás.
- Meta: csapatnév, színek, kalapok/sírkövek (játékkal feloldva), statisztikák, gyűjtemény.

### 1.6 Látvány & hang
- A Swaplight neon/vektoros stílusa: sötét éjszakai égbolt, izzó terep-körvonal, a terep belseje procedurális
  mintázat (shader). Minden kódból generált (Pixi Graphics + filterek), nincs bitmap asset.
- Robbanás: részecskék, villanás, képernyő-rázás, lassítás nagy találatnál; kamera-ráközelítés.
- Egységek: egyszerű, kifejező vektoros lények, procedurális animációval (pislogás, ijedtség, tánc győzelemkor).
- Hang: procedurális Web Audio SFX + generatív zene; rövid, szintetizált „hang-blipek” az egységeknek.
- Akadálymentesség: színvak-barát csapatjelölés (forma + minta), csökkentett mozgás, nagyobb betű.

### 1.7 Nyelvek
EN + HU az 1.0-ban (i18n), később DE, ES, PT-BR.

---

## 2. Technikai architektúra

Stack (a Swaplighttal azonos, a bevált eszközök újrahasznosítva):
Vite + TypeScript (strict) · PixiJS v8 · Preact (DOM UI) · Capacitor (iOS/Android) · Vitest · Playwright.

```
src/
  core/        # tiszta, determinisztikus logika – NINCS DOM/Pixi, NINCS Math.random/Date.now
    rng.ts, fixed.ts (fixpontos matek), terrain.ts (bitmaszk + rombolás), physics.ts (lövedék, egység,
    ütközés, csúszás), weapons/, turn.ts, match.ts (kör-állapotgép, víz, ládák), mapgen.ts, ai/
  render/      # Pixi: terep-textúra frissítése dirty-rect alapon, egységek, effektek, kamera
  input/       # célzó csúzli-gesztus, mozgás-gombok, pinch-zoom
  audio/  ui/  i18n/
  platform/    # Capacitor wrapper (storage, haptics, IAP, lifecycle, push a 1.1-ben) web mockkal
  net/         # (1.1) aszinkron meccs kliens – interfész + mock, backend-független
tests/unit, tests/e2e
android/, ios/
```

- **Terep:** `Uint8Array` maszk (pl. 1536×640 a 3 képernyőnyi pályára), anyagkóddal. Renderelés: textúra,
  robbanáskor csak a sérült téglalap frissül.
- **Fizika:** fix időlépés, fixpontos (Q16) aritmetika → platformfüggetlen determinizmus (iOS/Android/web
  ugyanazt számolja – ez az online módhoz kötelező). Unit teszt: azonos seed + input → azonos állapot-hash.
- **Online (1.1):** a szerver csak a meccs-állapotot (seed, körök input logja, kié a kör) tárolja és push-t küld;
  minden kliens maga szimulál, a kör végén állapot-hash egyezést ellenőriz (csalás/desync jelzés).
  Backend: **Supabase** (döntés 2026-10-06, `docs/ONLINE.md`): anonim Auth, RPC-k + RLS, Edge Function a
  push-hoz (FCM/APNs).

---

## 3. Mérföldkövek

| # | Mérföldkő | Tartalom | Kész, ha… |
|---|---|---|---|
| M0 | Alapozás | scaffold, lint, teszt, CI (web + Android/iOS build a Swaplight workflow-iból) | check/build/e2e zöld |
| M1 | Mag-motor | rng, fixpont, terep + rombolás, lövedék- és egységfizika, kör-állapotgép, replay | determinizmus-tesztek zöldek |
| M2 | Játszható prototípus | render, kamera, célzás, 3 fegyver, hotseat 2 fő | e2e: lövés → sebzés → kör vége |
| M3 | Játékélmény | effektek, hang, haptika, mapgen, 16 fegyver, ládák, víz/hirtelen halál | screenshot-review |
| M4 | Botok | szimuláció-alapú AI, 5 nehézség, Worker | bot nyer Könnyű ellen ~90%-ban (teszt) |
| M5 | Módok | küldetés 30 pálya, napi kihívás, gyors meccs | |
| M6 | Meta & UI | menü, beállítások, mentés, stat, testreszabás, EN/HU | |
| M7 | Mobil héj + monetizáció | Capacitor, ikon/splash, RevenueCat paywall | APK a Releases-ben |
| M8 | Kiadás 1.0 | store-szövegek, screenshot-generátor, adatvédelem, QA | feltölthető build |
| M9 | 1.1 Online | backend, auth, aszinkron meccs, push, meghívó link | két eszköz közti meccs |

## 4. Kockázatok
- **Determinizmus platformok között** → fixpontos matek mindenhol a core-ban, CI-ban hash-tesztek.
- **Touch-célzás pontossága** → csúzli + finomhangoló gombok, korai e2e/screenshot iterációk.
- **Teljesítmény (nagy terep-textúra)** → dirty-rect frissítés, 1× belső felbontás felskálázva.
- **Védjegy** → eredeti név, karakterek, fegyvernevek; „Worms” szó sehol (store-szövegben sem).
