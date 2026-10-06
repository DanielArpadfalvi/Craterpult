# Kiadás – natív buildek, aláírás, TestFlight, Play belső teszt

Ez az útmutató azt írja le, mit kell **egyszer** beállítanod ahhoz, hogy a GitHub Actions aláírt
Craterpult-buildeket készítsen és feltöltse őket. Mac nem kell. Titkos értékek (jelszavak, kulcsok)
**soha** nem kerülnek a repóba – csak GitHub secretként.

Alapadatok: app ID / bundle ID **`com.arpadfalvi.craterpult`**, név **Craterpult**, csak álló
(portrait) mód, iOS-en **csak iPhone** (`TARGETED_DEVICE_FAMILY = 1`; iPaden kompatibilitási
módban fut), háttérszín `#05040f`.

## Mi fut magától?

| Workflow | Mikor | Mit csinál | Kell hozzá secret? |
|---|---|---|---|
| **CI** (`ci.yml`) | minden push / PR | typecheck, lint, unit, build, e2e | nem |
| **Android** `debug-apk` | minden push | debug APK → artifact + „android-debug-latest” pre-release | nem |
| **Android** `release-aab` | kézi indítás, push a `main`-re, `v*` tag | aláírt AAB → artifact; opcionálisan feltöltés Google Playre | igen (lent) |
| **iOS** `simulator` | minden push | szimulátoros build (aláírás nélkül) → artifact, bizonyítja, hogy fordul | nem |
| **iOS** `release` | kézi indítás, push a `main`-re, `v*` tag | aláírt IPA → artifact; feltöltés TestFlightra | igen (lent) |

Ha a secretek hiányoznak, a release jobok kimaradnak (a futás összefoglalójában erről egy „notice”
üzenet szól), a többi job zöld marad.

A debug APK telepítése teszteléshez: GitHub → *Releases* → **android-debug-latest** → az `.apk`
letöltése a telefonon (az „ismeretlen források” engedélyezése kell). A debug buildek egy közös,
nem titkos debug kulccsal (`android/app/debug.keystore`) vannak aláírva, így az újabb APK
frissítésként települ a régire.

> **Megjegyzés:** a felhős fejlesztői konténerből a `dl.google.com` nem érhető el, ezért natív
> Android/iOS build csak a GitHub Actionsben fut. Helyben a `npx cap sync` működik (nem kell hozzá
> hálózat), a Gradle/Xcode build nem.

### Verziószámok

- **Build-szám** (Android `versionCode`, iOS `CFBundleVersion`): mindig a workflow futásszáma
  (`github.run_number`), így minden feltöltésnél nő.
- **Megjelenő verzió** (Android `versionName`, iOS `CFBundleShortVersionString`): `v1.2.3` tagnél
  `1.2.3`; egyébként Androidon `0.1.<futásszám>`, iOS-en `0.1.0`.
- Helyi buildnél (env nélkül) `versionCode 1`, `versionName 1.0.0` (iOS `MARKETING_VERSION = 1.0.0`)
  (`android/app/build.gradle`, `ios/App/App.xcodeproj`).

### Secretek felvétele

GitHub → a repó → *Settings → Secrets and variables → Actions → New repository secret*.
(Vagy parancssorból: `gh secret set NÉV < fájl`.)

| Secret | Platform | Leírás |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Android | a feltöltő kulcs (`.jks`) base64-ben (1.1) |
| `ANDROID_KEYSTORE_PASSWORD` | Android | a keystore jelszava |
| `ANDROID_KEY_ALIAS` | Android | a kulcs aliasa (pl. `upload`) |
| `ANDROID_KEY_PASSWORD` | Android | a kulcs jelszava |
| `PLAY_SERVICE_ACCOUNT_JSON` | Android | opcionális: Google Play service account JSON (1.4) |
| `VITE_RC_API_KEY_ANDROID` | Android | RevenueCat publikus SDK-kulcs (`goog_…`) (6.4) |
| `VITE_RC_API_KEY_IOS` | iOS | RevenueCat publikus SDK-kulcs (`appl_…`) (6.4) |
| `ASC_KEY_ID` | iOS | App Store Connect API kulcs Key ID (2.3) |
| `ASC_ISSUER_ID` | iOS | App Store Connect Issuer ID |
| `ASC_KEY_P8` | iOS | az `AuthKey_….p8` base64-ben |
| `APPLE_TEAM_ID` | iOS | Apple Developer Team ID (2.2) |

---

## 1. Android (Google Play)

### 1.1 Feltöltő kulcs (upload key) létrehozása – egyszer
Kell hozzá Java (JDK 17+), mert a `keytool` abban van.

```bash
keytool -genkeypair -v -keystore craterpult-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

- Kér egy jelszót (keystore jelszó) és néhány adatot (név, ország – bármi lehet).
- **Mentsd el a `.jks` fájlt és a jelszót biztonságos helyre** (pl. jelszókezelő). Ha elveszik,
  a Play Console-ban kérhető új upload key, de az macerás. A `.jks`-t **ne** commitold.

Base64-be alakítás (egy sor szöveg lesz belőle):

- Linux: `base64 -w0 craterpult-upload.jks > upload.b64`
- macOS: `base64 -i craterpult-upload.jks | tr -d '\n' > upload.b64`
- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("craterpult-upload.jks")) | Set-Content upload.b64`

### 1.2 GitHub secretek
| Név | Érték |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | az `upload.b64` tartalma |
| `ANDROID_KEYSTORE_PASSWORD` | a keystore jelszava |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | a kulcs jelszava (a `keytool` alapból ugyanazt használja, mint a keystore-é) |

A `android/app/build.gradle` ezeket környezeti változóból (CI) vagy `~/.gradle/gradle.properties`
/ `-P` kapcsolóból (helyben) olvassa; nélkülük a `bundleRelease` aláíratlan AAB-t ad.

### 1.3 Első AAB és a Play Console app
1. GitHub → *Actions → Android → Run workflow* (a `play_upload` maradjon kikapcsolva).
2. A futás végén az *Artifacts* részből töltsd le a `craterpult-release-aab` zipet, benne az `.aab`.
3. Play Console → *Create app* (név: Craterpult, játék, ingyenes).
4. *Testing → Internal testing → Create new release* → a Play App Signinget fogadd el
   (alapértelmezett) → töltsd fel az `.aab`-t → mentés → *Review release → Start rollout*.
   Az **első** feltöltésnek kézinek kell lennie: a Play API csak már létező appba tud feltölteni.
5. *Internal testing → Testers*: hozz létre egy e-mail-listát (Gmail-címek), és küldd el a
   tesztelőknek a „Join on the web” linket. Ők a Play Áruházból telepítik a buildet.

### 1.4 Automatikus feltöltés (opcionális)
1. Google Cloud Console → új projekt (pl. „craterpult-ci”).
2. *APIs & Services → Library* → **Google Play Android Developer API** → *Enable*.
3. *IAM & Admin → Service Accounts → Create service account* (pl. „play-upload”), szerepkör nem kell.
4. A service account → *Keys → Add key → Create new key → JSON* → letöltődik egy `.json` fájl.
5. Play Console → *Users and permissions → Invite new users* → a service account e-mail-címe →
   *App permissions*: Craterpult → **Release to testing tracks** (és ha éleset is akarsz innen:
   *Release to production*) → *Invite user*.
6. GitHub secret: `PLAY_SERVICE_ACCOUNT_JSON` = a `.json` fájl **teljes tartalma**.

Feltöltés: *Actions → Android → Run workflow* → `play_upload` ✓, `play_track`: `internal`,
`play_status`: amíg az app még soha nem volt kiadva („draft app”), válaszd a **`draft`**-ot, és a
kiadást a Console-ban indítsd el. Az első jóváhagyott kiadás után a `completed` közvetlenül kiadja.
A `v*` tag (3. fejezet) automatikusan feltölt az `internal` sávra `completed` státusszal.

### 1.5 Követelmények
- `targetSdk`/`compileSdk` = 36 (Android 16), `minSdk` = 24 (`android/variables.gradle`) – megfelel
  a Google Play 2026-os target API követelményének.
- A Play az AAB-t a saját kulcsával írja alá (Play App Signing); a te kulcsod csak a feltöltéshez kell.

---

## 2. iOS (TestFlight / App Store)

### 2.1 Bundle ID és app rekord – egyszer
1. developer.apple.com → *Certificates, Identifiers & Profiles → Identifiers → +* → *App IDs → App*
   → Description: Craterpult, **Explicit** Bundle ID: `com.arpadfalvi.craterpult` → *Register*.
2. App Store Connect → *Apps → + → New App*: iOS, név: Craterpult, elsődleges nyelv, a fenti
   Bundle ID, SKU: `craterpult`.

### 2.2 Team ID
developer.apple.com/account → *Membership details* → **Team ID** (10 karakter).

### 2.3 App Store Connect API kulcs
1. App Store Connect → *Users and Access → Integrations → App Store Connect API → Team Keys →
   Generate API Key* (az első kulcsnál előbb *Request Access*, az Account Holder fogadja el).
2. Név: „GitHub CI”, Access: **Admin**. (Az aláírás felhőben kezelt terjesztési tanúsítvánnyal
   történik – ehhez Admin szerepkör kell; „App Manager”-rel „Cloud signing permission error” jön.)
3. *Download API Key* → `AuthKey_XXXXXXXXXX.p8`. **Csak egyszer tölthető le**, mentsd el!
4. Jegyezd fel a **Key ID**-t (a kulcs sorában) és az **Issuer ID**-t (a lista fölött).

Base64 a `.p8`-ból: `base64 -w0 AuthKey_XXXXXXXXXX.p8 > asc.b64` (macOS-en
`base64 -i … | tr -d '\n'`, Windows-on az 1.1-es PowerShell-sor a fájlnévvel).

### 2.4 GitHub secretek
| Név | Érték |
|---|---|
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID (UUID) |
| `ASC_KEY_P8` | az `asc.b64` tartalma |
| `APPLE_TEAM_ID` | Team ID |

Tanúsítványt, `.p12`-t, provisioning profile-t **nem** kell feltöltened: az `xcodebuild` az API
kulccsal automatikusan létrehozza őket (a tanúsítvány az Apple felhőjében marad).

### 2.5 Build TestFlightra
1. GitHub → *Actions → iOS → Run workflow* (`testflight` ✓ – alapból be van pipálva).
2. ~15–25 perc a build; utána az App Store Connect 5–30 percig „Processing” állapotban dolgozza fel.
3. App Store Connect → Craterpult → *TestFlight*: megjelenik a build. Az export-megfelelőségi
   kérdés nem jön elő (`ITSAppUsesNonExemptEncryption = NO` az Info.plistben).
4. *Internal Testing → +* csoport → tesztelők hozzáadása. Ők az iPhone-on a **TestFlight** appból
   telepítenek.

A `main` ágra pusholt kód is készít aláírt IPA-t (artifactként), de **nem** tölti fel; feltöltés
csak kézi indításnál (`testflight` ✓) vagy `v*` tagnél történik.

### 2.6 Ha az iOS release job hibázik
- *„Cloud signing permission error” / „No signing certificate”*: az API kulcs nem Admin, vagy az
  Account Holdernek el kell fogadnia egy új Apple-szerződést.
- *„No profiles for 'com.arpadfalvi.craterpult'”*: a Bundle ID nincs regisztrálva (2.1).
- *„The bundle version must be higher…”*: ugyanazzal a build-számmal már volt feltöltés – indítsd
  újra a workflow-t (új futásszám).

---

## 3. Kiadás verziótaggel (mindkét platform egyszerre)

```bash
git tag v1.0.0
git push origin v1.0.0
```

- Android: aláírt AAB `versionName 1.0.0`-val, és (ha van `PLAY_SERVICE_ACCOUNT_JSON`) feltöltés
  az `internal` sávra.
- iOS: aláírt IPA `1.0.0 (futásszám)` verzióval, feltöltés TestFlightra.
- Innen a Console-okban léptetheted tovább: Play → zárt teszt / éles; App Store → *Add for Review*.

## 4. Ikon és splash újragenerálása

A grafika kódból készül (`scripts/make-assets.ts`, SVG → Chromium → PNG; nincs külső bitkép):

```bash
npm run assets
```

Ez frissíti a `resources/` forrásképeket, a natív ikon/splash méreteket (`android/…/res`,
`ios/App/App/Assets.xcassets`) és a store-képeket (`store/`: App Store ikon 1024, Play ikon 512,
Play kiemelt kép 1024×500). A `capacitor-assets` újraformázza az
`android/app/src/main/AndroidManifest.xml`-t – ezt érdemes visszaállítani (`git checkout`),
tartalmilag nem változik. Újragenerálás után **nézd át a képeket**.

## 5. Natív projekt karbantartása

- Az `android/` és `ios/` mappa a gitben van (a Capacitor generálta, kézi módosításokkal:
  álló mód, sötét háttér, overscroll tiltás a `MainActivity`-ben, aláírás a `build.gradle`-ben,
  csak iPhone). Ne generáld újra `cap add`-dal.
- Új Capacitor plugin után: `npm install …` → `npx vite build && npx cap sync` → commitold a
  `capacitor.settings.gradle`, `capacitor.build.gradle` és `ios/App/CapApp-SPM/Package.swift`
  változásait.
- Natív API-t csak a `src/platform/` modulok importálhatnak (`@capacitor/*`, ESLint-szabály);
  minden szolgáltatásnak van web/mock megvalósítása (`createPlatform`).

---

## 6. Vásárlás: RevenueCat beállítása (Teljes verzió)

A játék egyetlen egyszeri vásárlást árul: **Teljes verzió** (~4,99 USD), termékazonosító
**`craterpult_full_version`** (nem fogyó / non-consumable), ami a RevenueCatben a **`full_version`**
jogosultságot (entitlement) adja. A kód (`src/platform/purchasesRevenueCat.ts`) pontosan ezeket a
neveket várja. Nincs reklám, nincs energia, nincs előfizetés.

**Ingyenes:** 1. fejezet (1–10. küldetés), gyors meccs botok ellen 1–2. nehézségen, legfeljebb 3 fős
csapatokkal, „Dombok” és „Szigetek” pályán (a „Véletlen” ezek közül választ), egy telefonon (teljes).
**Teljes verzió:** 2–3. fejezet, 3–5. szintű botok, 4 fős csapat, Napi kihívás, minden pályatípus,
díszkalapok (Korona, Szarvak, Glória – a csillagos feloldás mellett; a sima csapatformák ingyenesek
maradnak a színtévesztők miatt; szabály: `hatsNeedFull()` / `hatNeedsFull()` a `src/game/profile.ts`-ben).
A szabályok egy helyen vannak: `src/game/entitlement.ts`. A kampány-előrehaladás (7 küldetés a
következő fejezethez) a Teljes verzió mellett is érvényes.

Hogyan működik: a natív build a RevenueCat Capacitor pluginnal beszél (anonim felhasználói
azonosító, nincs bejelentkezés). A legutóbbi jogosultság-állapotot a készülék elmenti, így a
megvett Teljes verzió **offline is** feloldva marad; online a RevenueCat válasza az irányadó (pl.
visszatérítés után újra zárol, és a zárolt beállítások – 3–5. bot, 4 fős csapat, extra pálya –
visszaállnak ingyenesre). Weben (dev, e2e) a teszt-bolt (`MockPurchases`) fut. Ha a natív buildben
**nincs RevenueCat-kulcs**, a játék **nem** a teszt-boltra vált (az ingyen feloldana), hanem „nem
elérhető” boltot használ: a Teljes verzió lap „az áruház nem érhető el” állapotot mutat, a
vásárlás mindig sikertelen. Ilyen buildet nem szabad kiadni – a release jobok ilyenkor
figyelmeztetést (`::warning`) írnak ki.

### 6.1 Előfeltételek
- App Store Connect: a **Paid Applications Agreement** elfogadva, adó- és bankadatok kitöltve
  (*Business*). Enélkül a termék nem tölthető be.
- Play Console: **fizetési profil** (merchant account) létrehozva, és legalább egy AAB feltöltve
  (belső tesztre is elég, lásd 1.3) – addig a Console nem enged terméket létrehozni.
- **Adatvédelmi oldal**: a `https://danielarpadfalvi.github.io/craterpult-site/privacy.html`
  (`src/game/links.ts`) forrása kész (`docs/site/`), de **közzé kell tenni** a
  `DanielArpadfalvi/craterpult-site` publikus repóban GitHub Pages-szel (7.3), különben a
  fizetőfal és a store-adatlap adatvédelmi linkje 404-et ad. A felhasználási feltételek az Apple
  szabványos EULA-ja (`TERMS_URL`).

### 6.2 Termék létrehozása a boltokban
**App Store Connect** → Craterpult → *Monetization → In-App Purchases → +*
1. Típus: **Non-Consumable**, Reference Name: „Full Version”, Product ID: `craterpult_full_version`.
2. Ár: a 4,99 USD-nek megfelelő sáv, elérhetőség: minden ország.
3. Lokalizáció (EN + HU): „Full Version” / „Teljes verzió”, leírás pl. „Every chapter, bot level,
   map and the Daily Challenge.” / „Minden fejezet, botszint, pálya és a Napi kihívás.”
4. *Review Information*: képernyőkép a vásárlási lapról (`tests/e2e/__screenshots__/paywall-en.png`,
   az e2e generálja), megjegyzés a reviewernek: „Tap Full Version on the main menu or any item with
   a gold lock.”
5. Az első IAP-t **az app első beküldésével együtt** kell review-ra küldeni.

**Play Console** → Craterpult → *Monetize → Products → In-app products → Create product*
1. Product ID: `craterpult_full_version`, név és leírás EN + HU, ár: 4,99 USD.
2. *Save → Activate*.

### 6.3 RevenueCat projekt
1. app.revenuecat.com → *Create new project*: „Craterpult”.
2. *Apps → + New → App Store*: Bundle ID `com.arpadfalvi.craterpult`; **In-App Purchase Key**
   (App Store Connect → *Users and Access → Integrations → In-App Purchase → Generate*) feltöltése
   a Key ID + Issuer ID-vel.
3. *Apps → + New → Play Store*: package `com.arpadfalvi.craterpult`; service account JSON
   (*View app information*, *View financial data*, *Manage orders and subscriptions* joggal).
4. *Product catalog → Products*: mindkét apphoz a `craterpult_full_version` termék.
5. *Entitlements → + New*: **`full_version`** → *Attach* → mindkét termék.
6. *Offerings*: a `default` offering (Current) → package `$rc_lifetime` → mindkét termék. A játék a
   current offeringből olvassa az árat; ha nincs, közvetlenül a termékazonosítóval kéri le.

### 6.4 API kulcsok → GitHub secretek
RevenueCat → *Project settings → API keys* → a két **Public app-specific API key**:
`VITE_RC_API_KEY_IOS` (`appl_…`) és `VITE_RC_API_KEY_ANDROID` (`goog_…`). Publikus SDK-kulcsok
(bekerülnek az appba), mégis secretként tároljuk. A workflow-k a `vite build` lépésnek adják át
őket. Helyi natív buildhez: `VITE_RC_API_KEY_ANDROID=goog_… npx vite build && npx cap sync`.

### 6.5 Natív beállítások
- **Android**: `com.android.vending.BILLING` engedély az `AndroidManifest.xml`-ben; a plugin
  (`@revenuecat/purchases-capacitor`) a gradle fájlokban regisztrálva (`cap sync`).
- **iOS**: StoreKithez nem kell külön képesség; a plugin Swift Package-ként kerül be
  (`ios/App/CapApp-SPM/Package.swift`).
- **Adatvédelmi címkék**: App Store *App Privacy* → „Purchases / Purchase History” és
  „Identifiers / User ID” – nem kapcsolódik a felhasználóhoz, nem követésre (RevenueCat); Play
  *Data safety* → „Purchase history” és „Device or other IDs”. Pontos válaszok:
  `docs/store-privacy-answers.md`.

### 6.6 Teszt vásárlás
- **iOS**: TestFlight-buildek sandboxban vásárolnak. Visszaállítás teszt: app törlése, újratelepítés
  → *Vásárlások visszaállítása*.
- **Android**: Play Console → *License testing* → tesztelők Gmail-címe; a belső tesztsávon
  „Test card, always approves / declines / slow test card” (az utóbbival a függőben lévő vásárlás is
  kipróbálható). Visszatérítés a *Order management* oldalon → a következő online indításkor újra zárol.
- **RevenueCat**: *Customers* → a `full_version` kézzel is adható (*Grant promotional entitlement*).
- **Web / fejlesztés**: `npm run dev` alatt a teszt-bolt fut. `?test` mellett a
  `window.__craterpult.purchases` hookok: `setNextOutcome('cancelled' | 'pending' | 'failed')`,
  `setLatency(ms)`, `ownedElsewhere()` (visszaállításhoz), `setFullVersion(bool)`; a `?test&full`
  paraméter eleve megvett Teljes verzióval indít.

---

## 7. Store-anyagok: szövegek, kérdőívek, weboldal

### 7.1 Hol mi van?

| Anyag | Hely | Mire kell |
|---|---|---|
| Adatlap-szövegek EN + HU (név, alcím, rövid/hosszú leírás, kulcsszavak, promóciós szöveg, 1.0 újdonságok) | `store/listing/{en,hu}/*.txt` | App Store Connect → *App Information* / verzió oldala; Play Console → *Main store listing* (+ *Translations*: magyar) |
| Kategória, korhatár, célközönség javaslat | `store/listing/README.md` | mindkét konzol |
| Data safety / App Privacy / IARC / Apple Age Rating válaszok | `docs/store-privacy-answers.md` | Play → *App content*; App Store → *App Privacy*, *Age Rating* |
| Ikon, Play kiemelt kép, screenshotok | `store/` (4. fejezet és a screenshot-generátor) | mindkét konzol |
| Weboldal: főoldal, adatvédelem, támogatás (EN + HU) | `docs/site/` (forrás) → `DanielArpadfalvi/craterpult-site` | GitHub Pages (külön publikus repó) |
| Teendőlisták a tulajdonosnak | `docs/PLAY-STORE-CHECKLIST.md`, `docs/APP-STORE-CHECKLIST.md` | – |

Várható korhatár: rajzfilmes (cartoon) erőszak miatt App Store **13+**, IARC **PEGI 7 / ESRB E10+**
(részletek és indoklás: `docs/store-privacy-answers.md` 3–5.).

### 7.2 Szövegek ellenőrzése

```bash
npm run store:check     # hosszkorlátok, egysoros mezők, kulcsszó-formátum, tiltott szavak
```

A `npm run check` is futtatja. Tiltott: más játékok nevei / védjegyek, és az ingyenes változatra
a „Lite”, „Demo”, „Trial” (és „demó”, „próbaverzió”) – az ingyenes változat teljes értékű játék.
Ha a Teljes verzió tartalma (`src/game/entitlement.ts`) változik, a `full_description.txt`, a
`docs/site/support.html` GYIK-ja és a 6. fejezet listája is frissítendő.

### 7.3 Weboldal (adatvédelmi nyilatkozat, támogatás) – külön publikus repó

A játék repója privát, ezért a weboldal **nem innen** megy ki: a GitHub Pages a külön, **publikus**
`DanielArpadfalvi/craterpult-site` repóból szolgálja ki (alapértelmezett ág gyökeréből). Az oldal
forrása (*source of truth*) itt a `docs/site/` mappa – mindig itt szerkeszd, és innen másold át.

Egyszeri beállítás (**a repó még nem létezik**):

1. Hozd létre a publikus `DanielArpadfalvi/craterpult-site` repót (üresen, `main` ággal).
2. A site repóban: *Settings → Pages → Build and deployment → Source:* **Deploy from a branch**,
   ág: **main**, mappa: **/ (root)** → *Save*. Pár perc múlva él a
   `https://danielarpadfalvi.github.io/craterpult-site/` cím.

Frissítés (minden `docs/site/` módosítás után):

```bash
git clone https://github.com/DanielArpadfalvi/craterpult-site.git ../craterpult-site   # első alkalommal
scripts/publish-site.sh ../craterpult-site       # docs/site/* → a site repó gyökerébe (+ .nojekyll)
cd ../craterpult-site
git add -A && git commit -m "Update site" && git push
```

A szkript csak másol (a célmappa `.git`-jét és a `docs/site`-ban nem szereplő saját fájlokat,
pl. `README.md`, `CNAME`, nem törli); a commit és a push kézi lépés. Windows-on Git Bash-ből futtasd.

Támogatási cím: **craterpult.support@gmail.com** (a `docs/site/*.html`-ben és a kérdőív-válaszokban;
a postafiókot létre kell hozni). Ha megvannak a store-linkek, írd be őket az `index.html`
jelvényeibe.

URL-ek (a site repó nevéből; ha átnevezed a repót vagy saját domaint állítasz be, ezek is
változnak – és a `src/game/links.ts` `SITE` konstansa is):

| Mező | URL |
|---|---|
| Privacy Policy URL (App Store *App Privacy*, Play *App content → Privacy policy*) | `https://danielarpadfalvi.github.io/craterpult-site/privacy.html` |
| Support URL (App Store) | `https://danielarpadfalvi.github.io/craterpult-site/support.html` |
| Marketing URL (App Store, opcionális) / Website (Play) | `https://danielarpadfalvi.github.io/craterpult-site/` |
| Contact e-mail (Play *Store settings*) | `craterpult.support@gmail.com` |

Az oldal a böngésző nyelve szerint vált magyarra/angolra; fixen: `privacy.html?lang=hu`.
A játékon belüli adatvédelmi link (Teljes verzió ablak: `src/game/links.ts` `PRIVACY_URL`)
ugyanezt az URL-t használja.
