# Google Play kiadás – teendőlista (Dániel)

A technikai rész (build, aláírási pipeline, store-szövegek, grafika, kérdőív-válaszok) elő van
készítve; ez a lista azt tartalmazza, amit **neked** kell elvégezned. A kattintásról kattintásra
szóló útmutató: `docs/RELEASE.md` (1. Android, 6. RevenueCat, 7. store-anyagok).

## 1. Fejlesztői fiók
- [ ] Ha a Swaplighthoz már van Play Console fiókod, ugyanazt használd (nem kell új regisztráció).
  Különben: https://play.google.com/console – egyszeri 25 USD, személyazonosság-ellenőrzés.

## 2. Fizetési profil (merchant account)
- [ ] Fizetési profil (bankszámla, adóadatok) – a „Teljes verzió” vásárláshoz kell (a Swaplighttal közös lehet).

## 3. Kötelező zárt teszt – **a leglassabb lépés**
- [ ] A 2023 novembere után nyitott magánszemélyes fiókoknál éles kiadás előtt **≥12 tesztelő,
  14 egymást követő napig** zárt tesztben – **appónként**, a Craterpultra is újra kell.
- [ ] 12+ tesztelő (Gmail-címek); egy korai, stabil buildet minél hamarabb feltölteni, hogy a 14 nap elinduljon.

## 4. Weboldal (adatvédelmi nyilatkozat, támogatás) – a store-adatlap előfeltétele
- [ ] Publikus repó létrehozása: **`DanielArpadfalvi/craterpult-site`** (üres, `main` ág), Pages:
  *Deploy from a branch → main → / (root)*.
- [ ] `scripts/publish-site.sh ../craterpult-site` → commit + push a site repóban (`RELEASE.md` 7.3).
- [ ] Ellenőrzés: `https://danielarpadfalvi.github.io/craterpult-site/privacy.html` betölt (a játék
  Teljes verzió ablaka is ide linkel).
- [ ] A `craterpult.support@gmail.com` postafiók létrehozása (vagy másik cím – akkor a `docs/site/`
  oldalakon és a kérdőív-válaszokban is cseréld).

## 5. App adatlap a Console-ban
> Kész anyagok: szövegek `store/listing/{en,hu}/`, kategória/korhatár/célközönség
> `store/listing/README.md`, kérdőív-válaszok `docs/store-privacy-answers.md`, grafika `store/`.
- [ ] *Create app*: Craterpult, **Game**, **Free**.
- [ ] *Main store listing*: név, rövid és teljes leírás (EN), *Translations* → magyar (HU fájlok).
- [ ] Grafika: ikon 512×512, kiemelt kép 1024×500, telefonos screenshotok (EN + HU).
- [ ] *Store settings*: kategória **Strategy**, címkék, kapcsolati e-mail, weboldal (`RELEASE.md` 7.3).
- [ ] *App content*: Privacy policy URL, **Data safety** (2 adattípus, `store-privacy-answers.md` 1.),
  **Ads: No**, **Content rating** (IARC, 4. pont – rajzfilmes erőszak, várhatóan PEGI 7),
  **Target audience: 13+**, egyéb nyilatkozatok: nem releváns.

## 6. Build és aláírás
- [ ] Saját **upload keystore** a Craterpulthoz (ne a Swaplighté), GitHub secretek (`RELEASE.md` 1.1–1.2).
- [ ] Első AAB kézzel a belső tesztsávra (`RELEASE.md` 1.3); opcionálisan service account az
  automatikus feltöltéshez (1.4).

## 7. Egyszeri vásárlás (IAP)
- [ ] Termék: `craterpult_full_version`, „Full Version / Teljes verzió”, 4,99 USD, *Activate*.
- [ ] RevenueCat projekt + Play app + `full_version` entitlement + offering, `VITE_RC_API_KEY_ANDROID`
  secret, *License testing* tesztelők (`RELEASE.md` 6.).

## 8. Kiadás
- [ ] Belső teszt → zárt teszt (12 fő / 14 nap) → hozzáférés kérése az éles kiadáshoz → éles kiadás.
- [ ] Kiadás előtt: `npm run check` zöld, valódi vásárlás + visszaállítás kipróbálva teszt-kártyával.
