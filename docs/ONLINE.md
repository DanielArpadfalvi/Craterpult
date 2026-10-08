# Craterpult online (M9, 1.1) – aszinkron meccs

## 1. Döntés (ADR)

**Backend: Supabase** (Postgres + anonim Auth + PostgREST RPC + Edge Functions + pg_net/Vault).

- A szerver **nem szimulál**: csak a meccs paramétereit, a lejátszott köröket (parancslista + állapot-hash)
  és azt tárolja, ki következik. Ezt a determinisztikus, fixpontos mag teszi lehetővé (`src/core/online.ts`).
- Miért Supabase: a PLAN.md-ben már ez volt a jelölt; ingyenes szint elég a kezdéshez (a forgalom
  körönként egy kis JSON); anonim bejelentkezés → nincs fiók, nincs jelszó, nincs új adatvédelmi kör;
  az RLS + `security definer` RPC-k a szabályokat a szerveren kényszerítik ki; nincs SDK-függőség
  (a kliens sima `fetch`, `src/net/supabase.ts`).
- Elvetett: Firebase (Firestore szabálynyelv a kör-sorrendhez körülményes, Google-kötés), saját szerver
  (üzemeltetés), Game Center / Play Games turn-based (két külön implementáció, a Play Games turn-based
  API megszűnt).
- **Csere bármikor:** a játék csak az `OnlineService` interfészt látja (`src/net/types.ts`); a böngészős
  mock (`src/net/mock.ts`) ugyanazokat a szabályokat követi, mint az SQL-függvények.

## 2. Hogyan működik

| Lépés | Ki | Mi történik |
|---|---|---|
| Meghívó | A (Teljes verzió) | `create_match(params, name)` → 6 jegyű kód (nincs 0/O/1/I). A a **1-es csapat**, vár. |
| Csatlakozás | B (ingyenes is) | `join_match(code, name)` → B a **0-s csapat**, ő kezd. |
| Kör | aki jön | a játék tickenként rögzíti a parancsokat (`TurnRecorder`), a kör végén `submit_turn(id, {n, team, from, to, cmds, hash}, next_team, winner)`. Hiba esetén tartós „outbox” (`craterpult.online.outbox`) és 8 mp-es újrapróbálás. |
| Ellenfél köre | a másik | a meccs újraépül a tárolt körökből; az ellenfél legutóbbi köre **élőben lejátszódik** (átugorható), a végén állapot-hash ellenőrzés. Eltérés → „desync” képernyő, a meccs nem folytatható. |
| Várakozás | | 4 mp-es lekérdezés, amíg a meccs nyitva van; push, ha be van kapcsolva. |
| Push-fajták | szerver | `turn` (csatlakozás / beküldött kör után a következő lépőnek), `rematch` (visszavágó-ajánlat a régi ellenfélnek; koppintásra a lista nyílik), `reminder` (12 órával a 72 órás lejárat előtt, körönként egyszer; óránkénti `pg_cron` job `craterpult-remind` → `remind_slow_movers()`). Szövegek EN/HU: `supabase/functions/notify-turn/message.ts`. |
| Vége | | a győztes / döntetlen a beküldő kliens szerint (`outcomeOf`), a másik kliens a visszajátszással ellenőrzi; feladás: `resign_match`. |
| Kör-kezdés | aki jön | a kör első parancsánál (lövés, mozgás) `start_turn(id, n)` → `started_turn` (a válaszórát nem állítja). A félkész kört a kliens folyamatosan menti (`craterpult.online.partial`, parancsonként és másodpercenként, kilépéskor). Újranyitáskor: van helyi mentés → a kör **onnan folytatódik** (ugyanaz a lövés, ugyanaz az eredmény; az ellenfél körét nem nézi újra); nincs mentés, de a szerver szerint elkezdődött (másik telefon, törölt adatok) → a kör **kimarad** (kényszerített `skip`). |
| Időkorlát | a váró fél | minden lépésre **72 óra** (`REPLY_LIMIT_HOURS`, az SQL-ben is): az aktív meccs utolsó változásától számít (csatlakozás / beküldött kör). A listában „még X ideje van / még X a lépésre”; lejárta után a váró fél „Győzelem kérése” gombja (lista vagy várakozó kártya) → `claim_timeout(id)`; a szerver órája dönt (`conflict`, ha még korai). Az eredmény `timedOut` = a kifutott csapat, a győztes a másik. |
| Visszavágó | bármelyik (ingyenes is) | `rematch_match(id, params, name)` a befejezett meccsre: az első kérő új nyitott meccset kap (friss seed, azonos beállítások), ami **csak a régi ellenfélnek** van fenntartva (`reserved`); a régi meccsen `rematch`/`rematchBy` jelzi. Az ellenfél listájában a „Te jössz” alatt „Visszavágó elfogadása” jelenik meg; ha ő is kéri, csatlakozik és ő kezd. Visszavonás = a nyitott meccs törlése (`cancel_match`), utána bárki újra kérhet. |

Ingyenes vs. Teljes verzió: **létrehozni** Teljes verzióval lehet, **csatlakozni** ingyen (így bárki
elfogadhat egy meghívót). Statisztika: „Online” mód, csak lejátszott/nyert (meccsenként egyszer).

Meghívó link: `craterpult://join/KÓD` (Android intent-filter, iOS URL scheme) és a weboldal
`join.html?code=KÓD` oldala, ami erre a linkre mutat. Weben `?join=KÓD`.

Ismert korlátok (1.1):
- A kör-kezdés védelem kliensoldali: aki a jelzés elküldése előtt (offline) lép ki ÉS törli a helyi adatot,
  még újrakezdheti a kört. A félkész kör a mentés óta eltelt (legfeljebb ~1 mp) idejét visszakapja.
- A győztest a kliens állítja; a csalást a másik kliens hash-ellenőrzése jelzi, a szerver nem dönt.
- A válasz-időkorlát fix 72 óra (nem állítható); lejárta után sem ér véget magától, a várónak kell kérnie a győzelmet.

## 3. Kód

- `src/core/online.ts` – paraméterek, `TurnRecord`, ellenőrzött visszajátszás, `TurnRecorder`, meghívókód.
- `src/game/onlinePlay.ts` – a meccs vezérlése a játékhurokban (felvétel / visszajátszás / várakozás).
- `src/game/online.ts` – lobbi-akciók, outbox, meghívó-link értelmezése.
- `src/net/` – `OnlineService` interfész, Supabase-kliens, mock, választó (`selectOnline`).
- `src/platform/push.ts`, `share.ts`, `lifecycle.onAppUrl` – natív push, megosztás, deep link.
- `src/ui/Online.tsx` – lobbi, várakozás, desync, visszajátszás-sáv.
- `supabase/migrations/*` – séma, RLS, RPC-k, push-trigger; `supabase/functions/notify-turn` – push.
- Tesztek: `tests/unit/core/online.test.ts`, `tests/unit/net/online.test.ts`,
  `tests/unit/game/onlinePlay.test.ts`, `tests/e2e/online.spec.ts` (két lap a mock szerveren).

## 4. Beállítás (tulajdonos) – amíg nincs meg, az appban az Online „nem érhető el” (natívon)

1. **Supabase projekt** (ingyenes szint, EU régió javasolt). Authentication → Sign In / Providers →
   **Anonymous sign-ins: ON**.
2. Migrációk: `supabase link --project-ref <ref>` majd `supabase db push`
   (vagy az SQL Editorban a `supabase/migrations/*.sql` sorban).
3. Build-változók (GitHub Actions secretek / `.env.local`):
   `VITE_SUPABASE_URL=https://<ref>.supabase.co`, `VITE_SUPABASE_ANON_KEY=<publishable/anon key>`.
   Ezek nyilvánosak (a kliensbe kerülnek); a jogosultságot az RLS + RPC-k adják.
4. **Push (opcionális):**
   - Android: Firebase projekt, `android/app/google-services.json` (a CI-ban secretből), service account
     JSON → `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat sa.json)"`.
   - iOS: Push Notifications capability + APNs kulcs (.p8) →
     `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC=com.arpadfalvi.craterpult`
     (fejlesztői buildhez `APNS_SANDBOX=1`).
   - `supabase secrets set NOTIFY_SECRET=<véletlen>`; `supabase functions deploy notify-turn --no-verify-jwt`.
   - Vault (SQL): `select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-turn', 'notify_url');`
     és `select vault.create_secret('<ugyanaz a NOTIFY_SECRET>', 'notify_secret');`
   - Emlékeztető: a `pg_cron` bővítmény kell (Database → Extensions; a `20261008180000` migráció
     bekapcsolja és ütemezi). Ellenőrzés: `select * from cron.job;`
   - Build: `VITE_PUSH_ENABLED=1` (enélkül a push ki van kapcsolva – Firebase-konfig nélkül az Android
     `register()` összeomlana).
5. Adatvédelem: az online mód egy anonim azonosítót, a csapatnevet, a lejátszott köröket és (push esetén)
   az eszköz-tokent tárolja → a `docs/site/privacy.html` és a store adatvédelmi kérdőív frissítése kell a
   1.1 kiadása előtt.

Fejlesztés: `npm run dev` → weben a mock backend (localStorage = „szerver”, sessionStorage = játékos),
két böngészőfül egymás ellen játszik. Valódi backenddel weben: `.env.local` a fenti változókkal.
