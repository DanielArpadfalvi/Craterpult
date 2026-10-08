-- Craterpult 1.1: turn start signal. The player to move reports their first command of a
-- turn; when they reopen the match without the turn recorded on their device (app data cleared,
-- another phone), the client forfeits that turn instead of letting it be played again.
-- Mirrors MockOnline.startTurn (src/net/mock.ts). The reply clock (updated_at) is not touched.

alter table public.matches add column started_turn int;

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
    'startedTurn', m.started_turn,
    'updatedAt', (extract(epoch from m.updated_at) * 1000)::bigint,
    'rematch', m.rematch,
    'rematchBy', case when m.rematch is null then null else m.rematch_by end
  );
$$;

create or replace function public.start_turn(match_id uuid, n int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  seat int;
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  select * into m from public.matches x where x.id = start_turn.match_id for update;
  if not found or not (auth.uid() = any (m.players)) then
    raise exception 'notFound' using errcode = 'P0002';
  end if;
  seat := array_position(m.players, auth.uid()) - 1;
  if m.status <> 'active' or m.next_team <> seat then
    raise exception 'notYourTurn' using errcode = 'P0001';
  end if;
  if start_turn.n <> m.turn_count then raise exception 'conflict' using errcode = 'P0001'; end if;
  update public.matches x set started_turn = start_turn.n where x.id = m.id;
end;
$$;

revoke all on function public.start_turn(uuid, int) from public, anon;
grant execute on function public.start_turn(uuid, int) to authenticated;
