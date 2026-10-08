-- Craterpult 1.1: reply time limit. A player who has not sent their turn 72 hours after the
-- previous change of an active match (REPLY_LIMIT_HOURS in src/net/types.ts) loses it once the
-- opponent claims the win. Mirrors MockOnline.claimTimeout (src/net/mock.ts).

alter table public.matches add column timed_out int;

create or replace function public.match_view(m public.matches)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'status', m.status,
    'params', m.params,
    'names', to_jsonb(m.names),
    'myTeam', greatest(0, coalesce(array_position(m.players, auth.uid()), 1) - 1),
    'turnCount', m.turn_count,
    'nextTeam', m.next_team,
    'winner', m.winner,
    'resigned', m.resigned,
    'timedOut', m.timed_out,
    'updatedAt', (extract(epoch from m.updated_at) * 1000)::bigint,
    'rematch', m.rematch,
    'rematchBy', case when m.rematch is null then null else m.rematch_by end
  );
$$;

create or replace function public.claim_timeout(match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  seat int;
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  select * into m from public.matches x where x.id = claim_timeout.match_id for update;
  if not found or not (auth.uid() = any (m.players)) then
    raise exception 'notFound' using errcode = 'P0002';
  end if;
  seat := array_position(m.players, auth.uid()) - 1;
  if m.status <> 'active' or m.next_team = seat or now() - m.updated_at < interval '72 hours' then
    raise exception 'conflict' using errcode = 'P0001';
  end if;
  update public.matches x set
    status = 'finished',
    timed_out = 1 - seat,
    winner = seat,
    next_team = -1,
    updated_at = now()
  where x.id = m.id
  returning * into m;
  return public.match_view(m);
end;
$$;

revoke all on function public.claim_timeout(uuid) from public, anon;
grant execute on function public.claim_timeout(uuid) to authenticated;
