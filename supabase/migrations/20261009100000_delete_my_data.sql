-- Craterpult 1.1: "Delete my online data" (Settings). GDPR self-service erasure:
--   - the player's invites nobody joined, and rematches reserved for them, are deleted;
--   - active matches are resigned (the opponent wins);
--   - in every remaining match the player's seat is anonymized (no player id, team name '?'),
--     and their turns lose the author id – the opponent keeps their own history;
--   - push tokens and the anonymous auth user are deleted.
-- Mirrors MockOnline.deleteMyData (src/net/mock.ts).

alter table public.turns alter column created_by drop not null;

create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m record;
  seat int;
begin
  if me is null then raise exception 'auth' using errcode = '28000'; end if;
  delete from public.matches x
    where x.status = 'open' and (x.players[2] = me or x.reserved = me);
  for m in select * from public.matches x where me = any (x.players) for update loop
    seat := array_position(m.players, me) - 1;
    if m.status = 'active' then
      update public.matches x set
        status = 'finished', resigned = seat, winner = 1 - seat, next_team = -1, updated_at = now()
      where x.id = m.id;
    end if;
    update public.matches x set players[seat + 1] = null, names[seat + 1] = '?'
      where x.id = m.id;
  end loop;
  update public.turns t set created_by = null where t.created_by = me;
  delete from public.push_tokens t where t.user_id = me;
  delete from auth.users u where u.id = me;
end;
$$;

-- The match as one player sees it, now also telling when the opponent deleted their data.
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
    'rematchBy', case when m.rematch is null then null else m.rematch_by end,
    'opponentGone', m.status <> 'open'
      and m.players[2 - greatest(0, coalesce(array_position(m.players, auth.uid()), 1) - 1)] is null
  );
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

-- A rematch needs an opponent: after they deleted their data there is nobody to reserve it for.
create or replace function public.rematch_match(match_id uuid, params jsonb, name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  old public.matches;
  m public.matches;
  seat int;
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  select * into old from public.matches x where x.id = rematch_match.match_id for update;
  if not found or not (auth.uid() = any (old.players)) then
    raise exception 'notFound' using errcode = 'P0002';
  end if;
  if old.status <> 'finished' then raise exception 'conflict' using errcode = 'P0001'; end if;
  seat := array_position(old.players, auth.uid()) - 1;
  if old.rematch is not null then
    select * into m from public.matches x where x.id = old.rematch for update;
    if m.status = 'open' and m.players[2] <> auth.uid() then
      update public.matches x set
        players[1] = auth.uid(),
        names[1] = public.clean_name(name),
        status = 'active',
        next_team = 0,
        reserved = null,
        updated_at = now()
      where x.id = m.id
      returning * into m;
    elsif not (auth.uid() = any (m.players)) then
      raise exception 'notFound' using errcode = 'P0002';
    end if;
    return public.match_view(m);
  end if;
  if old.players[2 - seat] is null then raise exception 'notFound' using errcode = 'P0002'; end if;
  m := public.open_match(params, name, old.players[2 - seat]);
  update public.matches x set rematch = m.id, rematch_by = seat, updated_at = now()
    where x.id = old.id;
  return public.match_view(m);
end;
$$;
