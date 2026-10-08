-- Craterpult 1.1: rematches. After a finished match either player can offer a rematch; it is an
-- open match (fresh seed, same options) reserved for the old opponent. When the opponent asks
-- for the rematch too, they join it and move first. Mirrors MockOnline.rematch (src/net/mock.ts).

alter table public.matches
  add column reserved uuid,
  add column rematch uuid references public.matches (id) on delete set null,
  add column rematch_by int;

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
    'updatedAt', (extract(epoch from m.updated_at) * 1000)::bigint,
    'rematch', m.rematch,
    'rematchBy', case when m.rematch is null then null else m.rematch_by end
  );
$$;

-- An open match: a fresh invite code, the caller waiting as team 1 (shared by create and rematch).
create or replace function public.open_match(params jsonb, name text, reserved uuid)
returns public.matches language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  m public.matches;
  open_count int;
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  select count(*) into open_count from public.matches x
    where x.status = 'open' and x.players[2] = auth.uid();
  if open_count >= 10 then raise exception 'conflict' using errcode = 'P0001'; end if;
  if jsonb_typeof(params -> 'seed') is distinct from 'string'
    or jsonb_typeof(params -> 'protocol') is distinct from 'number'
    or octet_length(params::text) > 1024 then
    raise exception 'protocol' using errcode = 'P0001';
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.matches (code, params, players, names, reserved)
        values (c, params, array[null, auth.uid()]::uuid[],
                array[null, public.clean_name(name)]::text[], open_match.reserved)
        returning * into m;
      exit;
    exception when unique_violation then
      -- The code is taken by another open match: draw again.
    end;
  end loop;
  return m;
end;
$$;

create or replace function public.create_match(params jsonb, name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.match_view(public.open_match(params, name, null));
end;
$$;

create or replace function public.join_match(code text, name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  select * into m from public.matches x
    where x.code = upper(join_match.code) and x.status = 'open'
      and (x.reserved is null or x.reserved = auth.uid())
    for update;
  if not found then raise exception 'notFound' using errcode = 'P0002'; end if;
  if m.players[2] = auth.uid() then raise exception 'ownMatch' using errcode = 'P0001'; end if;
  update public.matches x set
    players[1] = auth.uid(),
    names[1] = public.clean_name(name),
    status = 'active',
    next_team = 0,
    reserved = null,
    updated_at = now()
  where x.id = m.id
  returning * into m;
  return public.match_view(m);
end;
$$;

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
  m := public.open_match(params, name, old.players[2 - seat]);
  update public.matches x set rematch = m.id, rematch_by = seat, updated_at = now()
    where x.id = old.id;
  return public.match_view(m);
end;
$$;

revoke all on function public.open_match(jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.rematch_match(uuid, jsonb, text) from public, anon;
grant execute on function public.rematch_match(uuid, jsonb, text) to authenticated;
