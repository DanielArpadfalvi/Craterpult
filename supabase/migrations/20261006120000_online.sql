-- Craterpult 1.1 asynchronous online matches.
-- The server never simulates: it stores match parameters and finished turns, enforces whose
-- turn it is, and notifies the opponent. Clients replay the turns deterministically and compare
-- state hashes (src/core/online.ts). Players sign in anonymously (Supabase Auth).
-- Clients have no direct write access; every change goes through the security definer RPCs,
-- which mirror the rules of the web mock (src/net/mock.ts).

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  status text not null default 'open' check (status in ('open', 'active', 'finished')),
  params jsonb not null,
  -- Seats by team index (SQL arrays are 1-based: players[1] = team 0). The creator waits as
  -- team 1; whoever joins becomes team 0 and moves first.
  players uuid[] not null check (array_length(players, 1) = 2),
  names text[] not null check (array_length(names, 1) = 2),
  turn_count int not null default 0,
  next_team int not null default -1,
  winner int,
  resigned int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index matches_open_code on public.matches (code) where status = 'open';
create index matches_player0 on public.matches ((players[1]));
create index matches_player1 on public.matches ((players[2]));

create table public.turns (
  match_id uuid not null references public.matches (id) on delete cascade,
  n int not null,
  team int not null,
  payload jsonb not null check (octet_length(payload::text) < 65536),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (match_id, n)
);

create table public.push_tokens (
  user_id uuid not null default auth.uid(),
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  lang text not null default 'en' check (lang in ('en', 'hu')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.matches enable row level security;
alter table public.turns enable row level security;
alter table public.push_tokens enable row level security;

create policy "players read their matches" on public.matches
  for select to authenticated using ((select auth.uid()) = any (players));

create policy "players read their turns" on public.turns
  for select to authenticated using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (select auth.uid()) = any (m.players)
    )
  );

create policy "own push tokens" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

-- The match as one player sees it (the shape of OnlineMatch in src/net/types.ts).
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
    'updatedAt', (extract(epoch from m.updated_at) * 1000)::bigint
  );
$$;

-- Team names are shown to the other player: single-line, trimmed, at most 16 characters.
create or replace function public.clean_name(name text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(left(btrim(regexp_replace(coalesce(name, ''), '[[:cntrl:]]', '', 'g')), 16), ''),
    '?'
  );
$$;

create or replace function public.create_match(params jsonb, name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
      insert into public.matches (code, params, players, names)
        values (c, params, array[null, auth.uid()]::uuid[],
                array[null, public.clean_name(name)]::text[])
        returning * into m;
      exit;
    exception when unique_violation then
      -- The code is taken by another open match: draw again.
    end;
  end loop;
  return public.match_view(m);
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
    for update;
  if not found then raise exception 'notFound' using errcode = 'P0002'; end if;
  if m.players[2] = auth.uid() then raise exception 'ownMatch' using errcode = 'P0001'; end if;
  update public.matches x set
    players[1] = auth.uid(),
    names[1] = public.clean_name(name),
    status = 'active',
    next_team = 0,
    updated_at = now()
  where x.id = m.id
  returning * into m;
  return public.match_view(m);
end;
$$;

create or replace function public.my_matches()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select public.match_view(m) from public.matches m
  where auth.uid() = any (m.players)
  order by m.updated_at desc
  limit 50;
$$;

create or replace function public.get_match(match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.matches;
begin
  select * into m from public.matches x
    where x.id = get_match.match_id and auth.uid() = any (x.players);
  if not found then raise exception 'notFound' using errcode = 'P0002'; end if;
  return public.match_view(m);
end;
$$;

create or replace function public.submit_turn(match_id uuid, turn jsonb, next_team int, winner int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  seat int;
begin
  if auth.uid() is null then raise exception 'auth' using errcode = '28000'; end if;
  select * into m from public.matches x where x.id = submit_turn.match_id for update;
  if not found or not (auth.uid() = any (m.players)) then
    raise exception 'notFound' using errcode = 'P0002';
  end if;
  seat := array_position(m.players, auth.uid()) - 1;
  if m.status <> 'active' or m.next_team <> seat or (turn ->> 'team')::int <> seat then
    raise exception 'notYourTurn' using errcode = 'P0001';
  end if;
  if (turn ->> 'n')::int <> m.turn_count then
    raise exception 'conflict' using errcode = 'P0001';
  end if;
  insert into public.turns (match_id, n, team, payload)
    values (m.id, m.turn_count, seat, turn);
  if submit_turn.winner is not null or submit_turn.next_team < 0 then
    update public.matches x set
      turn_count = x.turn_count + 1,
      status = 'finished',
      winner = coalesce(submit_turn.winner, -1),
      next_team = -1,
      updated_at = now()
    where x.id = m.id
    returning * into m;
  else
    update public.matches x set
      turn_count = x.turn_count + 1,
      next_team = case when submit_turn.next_team = 0 then 0 else 1 end,
      updated_at = now()
    where x.id = m.id
    returning * into m;
  end if;
  return public.match_view(m);
end;
$$;

create or replace function public.resign_match(match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  seat int;
begin
  select * into m from public.matches x where x.id = resign_match.match_id for update;
  if not found or not (auth.uid() = any (m.players)) then
    raise exception 'notFound' using errcode = 'P0002';
  end if;
  if m.status <> 'active' then raise exception 'conflict' using errcode = 'P0001'; end if;
  seat := array_position(m.players, auth.uid()) - 1;
  update public.matches x set
    status = 'finished',
    resigned = seat,
    winner = 1 - seat,
    next_team = -1,
    updated_at = now()
  where x.id = m.id
  returning * into m;
  return public.match_view(m);
end;
$$;

create or replace function public.cancel_match(match_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.matches x
  where x.id = cancel_match.match_id and x.status = 'open' and x.players[2] = auth.uid();
$$;

create or replace function public.register_push_token(token text, platform text, lang text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (user_id, token, platform, lang)
    values (auth.uid(), left(register_push_token.token, 512), register_push_token.platform,
            case when register_push_token.lang = 'hu' then 'hu' else 'en' end)
  on conflict (user_id, token)
    do update set updated_at = now(), platform = excluded.platform, lang = excluded.lang;
$$;

revoke all on function public.match_view(public.matches) from public, anon;
revoke all on function public.create_match(jsonb, text) from public, anon;
revoke all on function public.join_match(text, text) from public, anon;
revoke all on function public.my_matches() from public, anon;
revoke all on function public.get_match(uuid) from public, anon;
revoke all on function public.submit_turn(uuid, jsonb, int, int) from public, anon;
revoke all on function public.resign_match(uuid) from public, anon;
revoke all on function public.cancel_match(uuid) from public, anon;
revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.create_match(jsonb, text) to authenticated;
grant execute on function public.join_match(text, text) to authenticated;
grant execute on function public.my_matches() to authenticated;
grant execute on function public.get_match(uuid) to authenticated;
grant execute on function public.submit_turn(uuid, jsonb, int, int) to authenticated;
grant execute on function public.resign_match(uuid) to authenticated;
grant execute on function public.cancel_match(uuid) to authenticated;
grant execute on function public.register_push_token(text, text, text) to authenticated;
