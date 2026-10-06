# Store-adatlap szövegek (EN + HU)

Egy mező = egy fájl, nyelvenként (`en/`, `hu/`). Másold be őket a konzolba úgy, ahogy vannak
(a záró sortörés nem számít bele). Ellenőrzés: `npm run store:check` (a `npm run check` része).

| Fájl | Hova | Korlát |
|---|---|---|
| `name.txt` | App Store *Name* · Play *App name* | 30 karakter |
| `subtitle.txt` | App Store *Subtitle* | 30 karakter |
| `short_description.txt` | Play *Short description* | 80 karakter |
| `full_description.txt` | App Store *Description* · Play *Full description* | 4000 karakter |
| `keywords.txt` | App Store *Keywords* (vessző, szóköz nélkül) | 100 bájt |
| `promotional_text.txt` | App Store *Promotional Text* (review nélkül bármikor módosítható) | 170 karakter |
| `release_notes.txt` | App Store *What's New* · Play *Release notes* (1.0) | 4000 / 500 karakter |

Szabályok (a `scripts/store-listing-check.ts` ellenőrzi):

- **Saját IP:** sem a leírások, sem a kulcsszavak nem említenek más játékot vagy védjegyet
  (a műfajt csak általánosan: „artillery”, „turn-based”, „tüzérpárbaj”).
- **Üzleti modell:** ingyenes letöltés, teljes értékű ingyenes alapjáték, egyetlen egyszeri
  „Full Version / Teljes verzió” feloldás; nincs reklám, energia, előfizetés, játékbeli valuta.
  Az ingyenes változatra **soha** nem írjuk, hogy „Lite”, „Demo”, „Trial” (vagy „demó”,
  „próbaverzió”).
- A kulcsszavak nem ismétlik a névben már szereplő szavakat (az Apple azokat amúgy is indexeli).
- Az ingyenes / Teljes verzió tartalma egyezzen a `src/game/entitlement.ts` szabályaival és a
  `docs/RELEASE.md` 6. fejezetével – ha a gating változik, a `full_description.txt`-t is frissíteni kell.

## Kategória

- **App Store:** elsődleges *Games*, alkategóriák: **Strategy** + **Action**. Másodlagos
  kategória (opcionális): *Games → Casual*.
- **Google Play:** *Game* → **Strategy**. Címkék (Store settings → Tags): *Strategy*,
  *Turn-based*, *Casual*, *Offline*, *Single player*, *Multiplayer* (helyi, egy telefonon),
  *Stylized*.
- Ár: ingyenes, egy nem fogyó (non-consumable) IAP: „Full Version / Teljes verzió” (~4,99 USD),
  termékazonosító `craterpult_full_version`.

## Korhatár (várható eredmény)

A játékban rajzfilmszerű (cartoon) erőszak van: kitalált neonlények robbanószerekkel és
fegyverekkel (bazooka, gránát, sörétes, dinamit…) sebzik egymást, a kiesett egység egy kis
füstpamaccsal eltűnik. Nincs vér, nincs emberi szereplő, nincs realisztikus ábrázolás.

- **App Store:** várhatóan **9+** vagy **13+** (a gyakoriságra adott választól függ).
- **IARC (Play):** várhatóan PEGI **7**, ESRB **Everyone 10+**, USK **6**, ClassInd **10**.
- A kérdőívek pontos válaszai és indoklása: `docs/store-privacy-answers.md`.

## Célközönség (Play → Target audience)

13+ korcsoportok (13–15, 16–17, 18+). A 13 év alattiak kihagyása a Play Families Policy
többletkövetelményei miatt javasolt (minden SDK – így a RevenueCat – megfelelése, szigorúbb
adatkezelés, külön ellenőrzés), és a rajzfilmes erőszak miatt is ez a tisztább választás.
„Appeal to children”: nem.
