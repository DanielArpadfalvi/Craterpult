# Adatvédelmi és korhatár-kérdőívek – kész válaszok

Ez a dokumentum a **Google Play Data safety** űrlap, az **App Store App Privacy** („nutrition label”)
és a két **korhatár-kérdőív** (IARC a Play-en, Apple Age Rating) válaszait tartalmazza, a kód
alapján (2026-10, 1.0 előtti állapot). Ha a kód adatkezelése változik (pl. az 1.1 aszinkron online
meccse, push értesítés, fiók), **ezeket és a `docs/site/privacy.html` oldalt is frissíteni kell**.

## 0. Mit csinál a játék valójában? (a válaszok alapja)

| Terület | Kód | Adat elhagyja a készüléket? |
|---|---|---|
| Mentés: hadjárat, csillagok, statisztika, napi kihívás, csapatnév/szín/kalap, beállítások | `src/game/save.ts` → `src/platform/` storage (Capacitor Preferences / localStorage) | **Nem** |
| Teljes verzió utolsó ismert állapota (offline feloldáshoz) | `src/platform/purchasesRevenueCat.ts` (helyi cache) | Nem |
| Nyelv | eszköznyelv kiolvasása, helyben | Nem |
| Rezgés, életciklus, státuszsor, splash | `src/platform/*` natív pluginek | Nem |
| Hálózat | a `src/` alatt nincs `fetch`/XHR/WebSocket, nincs analitika, reklám vagy hibajelentő SDK; nincs vágólap/megosztás; a grafika és a hang kódból készül | Nem |
| **Vásárlás** (Teljes verzió) | **RevenueCat** (`@revenuecat/purchases-capacitor`) + Apple StoreKit / Google Play Billing | **Igen, csak ez** |

A RevenueCat SDK (a dokumentációja szerint, alapbeállítással, „custom App User ID” nélkül) ezt
küldi a saját szervereire – **minden indításkor**, nem csak vásárláskor, mert a játék lekéri a
jogosultságot (`getCustomerInfo`):
- **anonim App User ID** (`$RCAnonymousID:…`, véletlen azonosító, az app első indulásakor jön létre,
  nem kötődik névhez, e-mailhez, fiókhoz);
- **vásárlási adatok**: az áruház nyugtája / purchase token, termékazonosító, ár, pénznem, időpont,
  az áruház országa (storefront);
- a kérésekhez technikailag szükséges adatok: platform, OS- és app-verzió, SDK-verzió, IP-cím
  (a kapcsolat része).

A fizetést (kártyaadatok, számlázási cím) **az Apple / a Google** kezeli; a játék és a RevenueCat
ezekhez nem fér hozzá. Hirdetési azonosítót (IDFA/AAID) nem kérünk, ATT-promptot nem mutatunk,
`collectDeviceIdentifiers()`-t / attribúciós integrációt **nem** kapcsolunk be.

> **„Data Not Collected”?** Csak akkor lenne igaz, ha a játék RevenueCat nélkül, közvetlenül
> StoreKit / Play Billing ellen futna. A RevenueCat a fenti adatokat a valós idejű kiszolgáláson
> túl is megőrzi, ezért az Apple és a Google definíciója szerint ez **gyűjtés** (a Swaplight is így
> deklarálja). A címke ettől még a legszelídebb: „Data Not Linked to You”, nincs követés.
>
> Ellenőrizd a beküldés előtt a RevenueCat aktuális útmutatóját (*RevenueCat docs → Apple App
> Privacy* és *Google Play Data Safety*), mert az SDK-verzióval változhat, mit gyűjt. Ha ott több
> szerepel (pl. diagnosztika), azt is jelöld.

---

## 1. Google Play – Data safety (App content → Data safety)

**Data collection and security**
| Kérdés | Válasz |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS) |
| Do you provide a way for users to request that their data is deleted? | **Yes** – e-mailben (craterpult.support@gmail.com); a RevenueCatben a „customer” törölhető. Lásd az adatvédelmi nyilatkozatot. |
| Account creation | **My app does not allow users to create an account** |
| Independent security review | nem kötelező, hagyd üresen / No |
| UPI / Families | nem releváns |

**Data types** – csak ezt a kettőt jelöld:

| Kategória → típus | Collected | Shared | Ephemeral | Required / optional | Cél (purpose) |
|---|---|---|---|---|---|
| **Financial info → Purchase history** | Yes | **No** ¹ | No | **Required** ² | **App functionality** |
| **Device or other IDs** (anonim App User ID) | Yes | **No** ¹ | No | **Required** ² | **App functionality** |

¹ A Play definíciója szerint a *szolgáltatónak* (service provider) a te nevedben, a te
utasításod szerint történő átadás **nem** „sharing” – a RevenueCat ilyen adatfeldolgozó.
A Google Play Billing a Google saját rendszere, az sem „sharing”.
² Az SDK minden indításkor lekéri a jogosultságot, a játékos ezt nem tudja kikapcsolni →
„Required” (konzervatív válasz).

Minden más kategória (Location, Personal info, Messages, Photos, Audio, Files, Calendar,
Contacts, App activity, Web browsing, App info and performance, Health) → **nincs gyűjtés**.

**Ads declaration:** *Does your app contain ads?* → **No**.

---

## 2. App Store Connect – App Privacy

*Data Collection* → **Yes, we collect data from this app** (a RevenueCat miatt, lásd a 0. pont
megjegyzését).

| Data type | Use | Linked to the user? | Used for tracking? |
|---|---|---|---|
| **Purchases → Purchase History** | **App Functionality** | **No** ³ | **No** |
| **Identifiers → User ID** (anonim RevenueCat App User ID) | **App Functionality** | **No** ³ | **No** |

³ Az azonosító véletlenszerű, a játékban nincs fiók, név, e-mail; az adat nem köthető a felhasználó
személyazonosságához. **Ha később (pl. az 1.1 online módjában) bejelentkezés / saját App User ID
(Game Center, e-mail, Supabase-fiók) kerül be, mindkettőt „Linked to you”-ra kell állítani**, és
valószínűleg új típusok is kellenek (pl. Gameplay Content, Other User Content).

Minden más típus: nem gyűjtjük. Nincs tracking → ATT (App Tracking Transparency) nem kell.
A fizetési adatokat az Apple kezeli, ezeket **nem** kell deklarálni.

**Privacy manifest:** a RevenueCat iOS SDK saját `PrivacyInfo.xcprivacy`-t hoz; a Capacitor pluginek
(Preferences → `UserDefaults`, required-reason API) is. Az app saját manifestje:
`ios/App/App/PrivacyInfo.xcprivacy` (T8.2): nincs tracking, gyűjtött adat a fenti táblázat két sora
(Purchase History, User ID – nem kötött, App Functionality), required-reason API: UserDefaults
`CA92.1`. Ha az App Store Connect feltöltéskor „Missing API declaration” e-mailt küld, a hiányzó okot
ide kell felvenni; ha a táblázat változik, a manifestet is frissíteni kell.

---

## 3. Korhatár – a tartalom pontos leírása (mindkét kérdőívhez)

- **Szereplők:** kitalált, rajzfilmszerű neonlények („kráterek”) – nem emberek, nem állatok.
- **Erőszak:** a játék lényege, hogy a csapatok körről körre lőnek egymásra. Fegyverek: bazooka,
  gránát, sörétes, repeszbomba, mozsár, napalm, célkövető rakéta, légicsapás, dinamit, akna,
  mászóbomba, erős ütés (közelharci lökés), földrengés; nem harci eszközök: fúró, gerenda, teleport.
  Mind egyszerű, stilizált vektoros formák és neon effektek, nem realisztikus fegyverábrázolás.
- **Következmény:** a találat HP-t von le (számként jelenik meg), az egység hátralök/repül;
  0 HP-nál vagy vízbe esve kiesik, és egy kis füstpamaccsal eltűnik. **Nincs vér, nincs
  testrész, nincs holttest, nincs szenvedés-ábrázolás, nincs sír/halál-szimbolika.**
- **Egyéb:** nincs trágárság, szexuális tartalom, drog/alkohol, horror. A ládák tartalma
  (gyógyítás / fegyver) véletlenszerű, de **nem vásárolható** és nincs valódi értéke.
- **Interakció:** nincs chat, nincs online játék, nincs felhasználói tartalom (a csapatnév csak a
  saját készüléken jelenik meg); a kétszemélyes mód egy telefonon, egymás mellett zajlik.

## 4. Korhatár – IARC (Google Play: App content → Content rating)

- E-mail-cím: a te címed · Kategória: **Game**.

| Kérdéscsoport | Válasz |
|---|---|
| Violence – does the game contain violence? | **Yes** |
| … violence against fantasy / cartoon characters (not realistic humans or animals) | **Yes** |
| … realistic / human-like characters | **No** |
| … blood or gore | **No** |
| … dismemberment, death animations with gore | **No** (a kiesés füstpamacs) |
| … weapons depicted / used | **Yes** – rajzfilmszerű robbanó- és lőfegyverek (a kérdőív hangsúlyát olvasd: realisztikus fegyverekre **No**) |
| … violence is rewarded / central to gameplay | **Yes** (ellenfél kiütése a cél) |
| Fear / horror | **No** |
| Sexuality / nudity | **No** |
| Gambling (valódi vagy szimulált szerencsejáték, kaszinó) | **No** |
| Language (trágárság) | **No** |
| Controlled substances (drog, alkohol, dohány) | **No** |
| Crude humor | **No** |
| Users can interact or exchange content (chat, UGC) | **No** |
| Shares user's current physical location | **No** |
| Allows users to purchase digital goods | **Yes** (Teljes verzió) |
| Random items purchased with real money (loot box) | **No** – a Teljes verzió fix tartalmat old fel, a ládák nem vásárolhatók |
| Unrestricted internet access / browser | **No** |

**Várt eredmény:** PEGI **7** (nem realisztikus erőszak fantázialények ellen), ESRB
**Everyone 10+** (Fantasy Violence) – esetleg *Everyone* „Mild Fantasy Violence” jelzéssel,
USK **6**, ClassInd **10**, ACB **PG**, GRAC **ALL / 12** – „In-App Purchases” kiegészítő jelzéssel.
Az IARC a válaszokból automatikusan számol; ha a kapott besorolás ennél szigorúbb, ne „javítsd”
a válaszokat lefelé – a valós tartalmat kell leírni.

---

## 5. Korhatár – Apple (App Information → Age Rating)

Az új (2025-ös, 4+/9+/13+/16+/18+ rendszerű) Apple-kérdőív válaszai:

| Kérdés | Válasz |
|---|---|
| **In-app controls** – Parental Controls | No |
| Age Assurance | No |
| **Capabilities** – Unrestricted Web Access | No |
| User-Generated Content | No |
| Messaging and Chat | No |
| Advertising | No |
| **Mature themes** – Profanity or Crude Humor | None |
| Horror/Fear Themes | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| **Medical or wellness** – Medical or Treatment Information | None |
| Health or Wellness Topics | No |
| **Sexuality or nudity** – Mature or Suggestive Themes / Sexual Content / Graphic Sexual Content / Nudity | None |
| **Violence – Cartoon or Fantasy Violence** | **Frequent** ⁴ |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Guns or Other Weapons | **None** ⁵ |
| **Chance-based activities** – Simulated Gambling | None |
| Gambling (real money) | No |
| Contests | None |
| Loot boxes (paid random items) | No |

⁴ A harc minden körben jelen van, ez a játék magja – a pontos válasz a **Frequent**
(„Frequent/Intense”), akkor is, ha az ábrázolás enyhe (nincs vér, a kiesett egység eltűnik).
**Várt eredmény: 13+.** Az *Infrequent* (→ 9+) választás alulbecslés lenne, és review-n
metaadat-elutasítást kockáztat. Ha 9+ kell üzletileg, az csak tartalmi változtatással (nem a
válasz átírásával) érhető el.

⁵ A fegyverek stilizált, nem realisztikus rajzfilmes elemek; az erőszakot a ⁴ már lefedi. Ha a
konzolban a kérdés szövege **bármilyen** fegyverábrázolásra (nem csak a realisztikusra) kérdez,
válaszd a **Frequent**-et – ez a besorolást 13+-nál nem emeli tovább.

„Made for Kids”: **nem** jelöld (a Kids kategória külön szabályokat hoz, pl. külső SDK-k
korlátozása, és a tartalom sem gyerekeknek szól).

---

## 6. Egyéb nyilatkozatok

- **Play – Government apps / Financial features / Health / News:** No / nem releváns.
- **Play – Ads:** No ads.
- **Play – Target audience:** 13+ (indoklás: `store/listing/README.md`).
- **App Store – Export compliance:** csak szabványos titkosítás (HTTPS) →
  `ITSAppUsesNonExemptEncryption = NO` (már az Info.plistben).
- **EU DSA trader status:** lásd `docs/APP-STORE-CHECKLIST.md` 3. pont.
- **Adatvédelmi nyilatkozat URL / Support URL:** lásd `docs/RELEASE.md` 7.3.
