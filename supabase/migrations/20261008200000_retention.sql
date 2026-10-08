-- Craterpult 1.1: data retention promised in the privacy policy (docs/site/privacy.html).
-- Daily: finished matches 90 days after their end, open invites nobody joined after 30 days,
-- abandoned matches (no move for 180 days, nobody claimed the win),
-- push tokens not refreshed for 180 days (the app re-registers on every create / join /
-- rematch), and anonymous players with nothing left after 180 days without a sign-in.
-- Turns go with their match (on delete cascade).

create or replace function public.purge_old_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.matches m
  where (m.status = 'finished' and m.updated_at < now() - interval '90 days')
     or (m.status = 'open' and m.created_at < now() - interval '30 days')
     or (m.status = 'active' and m.updated_at < now() - interval '180 days');
  delete from public.push_tokens t where t.updated_at < now() - interval '180 days';
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '180 days'
    and not exists (select 1 from public.matches m where u.id = any (m.players))
    and not exists (select 1 from public.push_tokens t where t.user_id = u.id);
end;
$$;

revoke all on function public.purge_old_data() from public, anon, authenticated;

select cron.schedule('craterpult-purge', '41 3 * * *', 'select public.purge_old_data()');
