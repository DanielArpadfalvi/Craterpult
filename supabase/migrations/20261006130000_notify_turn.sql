-- "Your turn" pushes (M9): after a join or a stored turn, call the `notify-turn` edge function.
-- Needs two Vault secrets (see docs/ONLINE.md):
--   notify_url    = https://<project-ref>.supabase.co/functions/v1/notify-turn
--   notify_secret = the same value as the function's NOTIFY_SECRET
-- Without them the trigger does nothing, so the online game works without push.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_turn()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  url text;
  secret text;
begin
  if new.status <> 'active' or new.next_team < 0 then return new; end if;
  if tg_op = 'UPDATE' and old.turn_count = new.turn_count and old.status = new.status then
    return new;
  end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
  if url is null or secret is null then return new; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('match_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    )
  );
  return new;
end;
$$;

revoke all on function public.notify_turn() from public, anon, authenticated;

create trigger matches_notify_turn
  after update on public.matches
  for each row execute function public.notify_turn();
