-- Craterpult 1.1: more pushes through the `notify-turn` edge function (texts: message.ts there).
--   rematch   – a rematch of a finished match was offered (to the old opponent)
--   reminder  – 12 hours of the 72-hour reply time are left (to the player who has to move);
--               sent once per turn by an hourly pg_cron job
-- Like the "your turn" push, nothing is sent until the Vault secrets notify_url / notify_secret
-- exist (docs/ONLINE.md 4).

alter table public.matches add column reminded_turn int;

create or replace function public.post_notify(match_id uuid, kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('match_id', post_notify.match_id, 'kind', post_notify.kind),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    )
  );
end;
$$;

create or replace function public.notify_turn()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'finished' and old.rematch is null and new.rematch is not null then
    perform public.post_notify(new.id, 'rematch');
  elsif new.status = 'active' and new.next_team >= 0
    and (old.turn_count <> new.turn_count or old.status <> new.status) then
    perform public.post_notify(new.id, 'turn');
  end if;
  return new;
end;
$$;

create or replace function public.remind_slow_movers()
returns void language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  for m in
    update public.matches x set reminded_turn = x.turn_count
    where x.status = 'active' and x.next_team >= 0
      and now() - x.updated_at >= interval '60 hours'
      and now() - x.updated_at < interval '72 hours'
      and x.reminded_turn is distinct from x.turn_count
    returning x.id
  loop
    perform public.post_notify(m.id, 'reminder');
  end loop;
end;
$$;

revoke all on function public.post_notify(uuid, text) from public, anon, authenticated;
revoke all on function public.remind_slow_movers() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('craterpult-remind', '17 * * * *', 'select public.remind_slow_movers()');
