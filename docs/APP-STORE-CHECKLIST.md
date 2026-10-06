# Apple App Store kiadás – teendőlista (Dániel)

A technikai rész (iOS build macOS-es GitHub Actions runneren, aláírási pipeline, store-szövegek,
grafika, kérdőív-válaszok) elő van készítve; ez a lista azt tartalmazza, amit **neked** kell
elvégezned. Saját Mac **nem kell**. Részletes útmutató: `docs/RELEASE.md` (2. iOS, 6. RevenueCat,
7. store-anyagok).

## 1. Apple Developer Program
- [ ] Ha a Swaplighthoz már van tagságod, ugyanaz a fiók jó (nincs újabb éves díj). Különben:
  https://developer.apple.com/programs/enroll/ – 99 USD/év, 2FA-s Apple ID.

## 2. Szerződések, adó, bank (App Store Connect → Business)
- [ ] **Paid Applications Agreement** elfogadva, bank- és adóadatok (W-8BEN / W-8BEN-E) kitöltve.

## 3. EU Digital Services Act (DSA) – kereskedői státusz
- [ ] Kereskedői (trader) nyilatkozat; kereskedőként a címed, telefonszámod és e-mail-címed
  nyilvánosan megjelenik az EU-s App Store-oldalon (fiókszintű, ha a Swaplightnál már megtetted, kész).

## 4. App azonosítók és app rekord
- [ ] Bundle ID: `com.arpadfalvi.craterpult`; app rekord: név Craterpult, SKU `craterpult` (`RELEASE.md` 2.1).

## 5. Aláírás és CI-feltöltés
- [ ] App Store Connect API kulcs (**Admin**), Team ID → GitHub secretek (`RELEASE.md` 2.2–2.4).
  A Swaplight kulcsa csapatszintű, újrahasznosítható – de a Craterpult repójába is fel kell venni.
- Export-megfelelőség: `ITSAppUsesNonExemptEncryption = NO` (kész).

## 6. Weboldal (adatvédelmi nyilatkozat, támogatás)
- [ ] `DanielArpadfalvi/craterpult-site` publikus repó + GitHub Pages, majd
  `scripts/publish-site.sh` (`RELEASE.md` 7.3; ugyanaz, mint a Play-lista 4. pontja).
- [ ] `craterpult.support@gmail.com` postafiók (vagy másik cím, lásd a Play-listát).

## 7. App adatlap
> Kész anyagok: szövegek `store/listing/{en,hu}/`, kategória/korhatár `store/listing/README.md`,
> kérdőív-válaszok `docs/store-privacy-answers.md`, grafika `store/`.
- [ ] *App Information*: név, alcím (EN + HU lokalizáció), kategória **Games → Strategy** + **Action**,
  Privacy Policy URL, (opcionálisan) Marketing URL.
- [ ] Verzió oldal: leírás, kulcsszavak, promóciós szöveg, *What's New*, Support URL, screenshotok
  (iPhone 6,9", 1320×2868; az app csak iPhone-os, iPad-kép nem kell).
- [ ] **App Privacy**: Purchase History + User ID, *not linked*, *no tracking*
  (`store-privacy-answers.md` 2. – **nem** „Data Not Collected”, a RevenueCat miatt).
- [ ] **Age Rating**: rajzfilmes erőszak – *Cartoon or Fantasy Violence: Frequent*, várhatóan **13+**
  (`store-privacy-answers.md` 5.). „Made for Kids”: nem.
- [ ] Ár: ingyenes, minden ország.

## 8. Egyszeri vásárlás (IAP)
- [ ] Non-consumable `craterpult_full_version`, 4,99 USD-s sáv, EN + HU lokalizáció, review-screenshot
  a vásárlási lapról (`RELEASE.md` 6.2).
- [ ] RevenueCat: In-App Purchase kulcs, termék, `full_version` entitlement, offering,
  `VITE_RC_API_KEY_IOS` secret (`RELEASE.md` 6.3–6.4).
- [ ] Az első IAP-t **az app első verziójával együtt** kell beküldeni review-ra.

## 9. Tesztelés és kiadás
- [ ] TestFlight belső teszt (sandbox vásárlás + visszaállítás kipróbálva).
- [ ] Beküldés App Review-ra (megjegyzés a reviewernek: „Tap Full Version on the main menu or any
  item with a gold lock.”). Elbírálás általában 24–48 óra.
- [ ] Kiadás: azonnal vagy kézzel a jóváhagyás után.
