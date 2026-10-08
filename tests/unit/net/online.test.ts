import { describe, expect, it } from 'vitest';
import { sanitizeParams, type TurnRecord } from '../../../src/core/online';
import { createMemoryStorage } from '../../../src/platform/storage';
import { cleanName, MockOnline, type KeyValue } from '../../../src/net/mock';
import { selectOnline, UnavailableOnline } from '../../../src/net/select';
import { errorCode, SUPABASE_SESSION_KEY, SupabaseOnline } from '../../../src/net/supabase';
import type { OnlineError } from '../../../src/net/types';
import { isMyTurn, opponentName, rematchOffered } from '../../../src/net/types';

function kv(): KeyValue {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const PARAMS = sanitizeParams({ seed: 's1', teamSize: 2, style: 'islands', turnSeconds: 30 });
const turn = (n: number, team: number): TurnRecord => ({
  n,
  team,
  from: n * 100,
  to: n * 100 + 100,
  cmds: [],
  hash: 'abcd0123',
});

function pair(): { a: MockOnline; b: MockOnline; c: MockOnline } {
  const db = kv();
  let x = 0.1;
  const rand = (): number => (x = (x * 7.31 + 0.13) % 1);
  return {
    a: new MockOnline({ db, identity: kv(), rand }),
    b: new MockOnline({ db, identity: kv(), rand }),
    c: new MockOnline({ db, identity: kv(), rand }),
  };
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return (e as OnlineError).code;
  }
  return 'ok';
};

describe('MockOnline', () => {
  it('creates, joins and alternates turns; the joiner moves first', async () => {
    const { a, b } = pair();
    const m = await a.createMatch(PARAMS, 'Ann');
    expect(m).toMatchObject({ status: 'open', myTeam: 1, nextTeam: -1, names: [null, 'Ann'] });
    expect(m.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const j = await b.joinMatch(m.code.toLowerCase(), 'Bob');
    expect(j).toMatchObject({ status: 'active', myTeam: 0, nextTeam: 0, names: ['Bob', 'Ann'] });
    expect(isMyTurn(j)).toBe(true);
    expect(opponentName(j)).toBe('Ann');
    expect(isMyTurn(await a.getMatch(m.id))).toBe(false);

    expect(await code(a.submitTurn(m.id, turn(0, 1), { nextTeam: 0, winner: null }))).toBe(
      'notYourTurn',
    );
    await b.submitTurn(m.id, turn(0, 0), { nextTeam: 1, winner: null });
    expect(await code(b.submitTurn(m.id, turn(1, 0), { nextTeam: 1, winner: null }))).toBe(
      'notYourTurn',
    );
    expect(await code(a.submitTurn(m.id, turn(3, 1), { nextTeam: 0, winner: null }))).toBe(
      'conflict',
    );
    const after = await a.submitTurn(m.id, turn(1, 1), { nextTeam: -1, winner: 1 });
    expect(after).toMatchObject({ status: 'finished', winner: 1, nextTeam: -1, turnCount: 2 });
    expect((await b.getTurns(m.id, 1)).map((t) => t.n)).toEqual([1]);
  });

  it('keeps matches private to their two players', async () => {
    const { a, b, c } = pair();
    const m = await a.createMatch(PARAMS, 'Ann');
    await b.joinMatch(m.code, 'Bob');
    expect(await code(c.joinMatch(m.code, 'Cy'))).toBe('notFound');
    expect(await code(c.getMatch(m.id))).toBe('notFound');
    expect(await code(c.getTurns(m.id, 0))).toBe('notFound');
    expect(await c.listMatches()).toEqual([]);
    expect((await a.listMatches()).map((x) => x.id)).toEqual([m.id]);
  });

  it('refuses joining your own match and unknown codes', async () => {
    const { a } = pair();
    const m = await a.createMatch(PARAMS, 'Ann');
    expect(await code(a.joinMatch(m.code, 'Ann'))).toBe('ownMatch');
    expect(await code(a.joinMatch('ZZZZZZ', 'Ann'))).toBe('notFound');
    expect(await code(a.joinMatch('nope', 'Ann'))).toBe('notFound');
  });

  it('resigning hands the win to the opponent; cancel removes an open match', async () => {
    const { a, b } = pair();
    const m = await a.createMatch(PARAMS, 'Ann');
    await b.joinMatch(m.code, 'Bob');
    const r = await b.resign(m.id);
    expect(r).toMatchObject({ status: 'finished', winner: 1, resigned: 0 });
    const open = await a.createMatch(PARAMS, 'Ann');
    await b.cancel(open.id);
    expect((await a.listMatches()).some((x) => x.id === open.id)).toBe(true);
    await a.cancel(open.id);
    expect((await a.listMatches()).some((x) => x.id === open.id)).toBe(false);
  });

  it('rematch: the first ask opens a match reserved for the opponent, the second joins it', async () => {
    const { a, b, c } = pair();
    const m = await a.createMatch(PARAMS, 'Ann');
    await b.joinMatch(m.code, 'Bob');
    expect(await code(a.rematch(m.id, PARAMS, 'Ann'))).toBe('conflict');
    await b.resign(m.id);

    const fresh = { ...PARAMS, seed: 's2' };
    const r = await a.rematch(m.id, fresh, 'Ann');
    expect(r).toMatchObject({ status: 'open', myTeam: 1, params: { seed: 's2' } });
    expect(await a.rematch(m.id, fresh, 'Ann')).toMatchObject({ id: r.id, status: 'open' });
    expect(await a.getMatch(m.id)).toMatchObject({ rematch: r.id, rematchBy: 1 });
    const seen = await b.getMatch(m.id);
    expect(rematchOffered(seen)).toBe(true);
    expect(rematchOffered(await a.getMatch(m.id))).toBe(false);
    // Only the old opponent can take the seat, even with the code.
    expect(await code(c.joinMatch(r.code, 'Cy'))).toBe('notFound');

    // The opponent's params are ignored: they join the offered match and move first.
    const j = await b.rematch(m.id, { ...PARAMS, seed: 'other' }, 'Bob');
    expect(j).toMatchObject({ id: r.id, status: 'active', myTeam: 0, nextTeam: 0 });
    expect(j.params.seed).toBe('s2');
    expect(j.names).toEqual(['Bob', 'Ann']);
    expect(await a.rematch(m.id, fresh, 'Ann')).toMatchObject({ id: r.id, status: 'active' });
    expect(await code(c.rematch(m.id, fresh, 'Cy'))).toBe('notFound');
  });

  it('cancelling an offered rematch lets either player offer again', async () => {
    const { a, b } = pair();
    const m = await a.createMatch(PARAMS, 'Ann');
    await b.joinMatch(m.code, 'Bob');
    await a.resign(m.id);
    const r = await a.rematch(m.id, PARAMS, 'Ann');
    await a.cancel(r.id);
    expect(await b.getMatch(m.id)).toMatchObject({ rematch: null, rematchBy: null });
    const again = await b.rematch(m.id, PARAMS, 'Bob');
    expect(again).toMatchObject({ status: 'open', myTeam: 1 });
    expect(await a.getMatch(m.id)).toMatchObject({ rematch: again.id, rematchBy: 0 });
  });

  it('cleans team names', () => {
    expect(cleanName('  Very long crew name here  ')).toBe('Very long crew n');
    expect(cleanName('a\u0007b\n')).toBe('ab');
    expect(cleanName('   ')).toBe('?');
  });
});

/** A fake Supabase: records requests and answers from a handler. */
function fakeFetch(handler: (path: string, body: unknown, auth: string) => [number, unknown]) {
  const calls: { path: string; body: unknown; auth: string }[] = [];
  const f = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = String(input).replace('https://x.supabase.co', '');
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : null;
    const auth = (init?.headers as Record<string, string>).Authorization ?? '';
    calls.push({ path, body, auth });
    const [status, out] = handler(path, body, auth);
    return Promise.resolve(new Response(JSON.stringify(out), { status }));
  };
  return { f: f as typeof fetch, calls };
}

const VIEW = {
  id: 'u1',
  code: 'ABCDEF',
  status: 'active',
  params: PARAMS,
  names: ['Bob', 'Ann'],
  myTeam: 0,
  turnCount: 0,
  nextTeam: 0,
  winner: null,
  resigned: null,
  updatedAt: 5,
};

describe('SupabaseOnline', () => {
  it('signs in anonymously once, keeps the session and calls the RPCs with it', async () => {
    const storage = createMemoryStorage();
    let signups = 0;
    const { f, calls } = fakeFetch((path) => {
      if (path === '/auth/v1/signup') {
        signups++;
        return [
          200,
          { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'me' } },
        ];
      }
      if (path === '/rest/v1/rpc/join_match') return [200, VIEW];
      if (path.startsWith('/rest/v1/turns')) return [200, [{ payload: turn(0, 0) }]];
      return [404, {}];
    });
    const s = new SupabaseOnline({
      url: 'https://x.supabase.co/',
      anonKey: 'ANON',
      storage,
      fetch: f,
      now: () => 1000,
    });
    expect(await s.signIn()).toBe('me');
    const m = await s.joinMatch('ABCDEF', 'Bob');
    expect(m).toMatchObject({ id: 'u1', myTeam: 0, status: 'active' });
    expect((await s.getTurns('u1', 0))[0]?.n).toBe(0);
    expect(signups).toBe(1);
    const rpc = calls.find((c) => c.path === '/rest/v1/rpc/join_match');
    expect(rpc).toMatchObject({ auth: 'Bearer AT', body: { code: 'ABCDEF', name: 'Bob' } });
    expect(calls.some((c) => c.path.includes('match_id=eq.u1&n=gte.0'))).toBe(true);
    expect(await storage.get(SUPABASE_SESSION_KEY)).toMatchObject({ userId: 'me' });

    // A new app launch reuses the stored identity.
    const again = new SupabaseOnline({
      url: 'https://x.supabase.co',
      anonKey: 'ANON',
      storage,
      fetch: f,
      now: () => 2000,
    });
    expect(await again.signIn()).toBe('me');
    expect(signups).toBe(1);
  });

  it('calls rematch_match and reads the rematch fields of a match', async () => {
    const { f, calls } = fakeFetch((path) => {
      if (path === '/auth/v1/signup')
        return [200, { access_token: 'AT', refresh_token: 'RT', user: { id: 'me' } }];
      if (path === '/rest/v1/rpc/rematch_match') return [200, { ...VIEW, status: 'open' }];
      if (path === '/rest/v1/rpc/get_match')
        return [200, { ...VIEW, status: 'finished', rematch: 'u2', rematchBy: 1 }];
      return [404, {}];
    });
    const s = new SupabaseOnline({
      url: 'https://x.supabase.co',
      anonKey: 'A',
      storage: createMemoryStorage(),
      fetch: f,
    });
    expect(await s.rematch('u0', PARAMS, 'Bob')).toMatchObject({ status: 'open', rematch: null });
    expect(calls.find((c) => c.path === '/rest/v1/rpc/rematch_match')?.body).toEqual({
      match_id: 'u0',
      params: PARAMS,
      name: 'Bob',
    });
    const old = await s.getMatch('u0');
    expect(old).toMatchObject({ rematch: 'u2', rematchBy: 1 });
    expect(rematchOffered(old)).toBe(true);
  });

  it('refreshes an expired session and keeps the same player', async () => {
    const storage = createMemoryStorage();
    await storage.set(SUPABASE_SESSION_KEY, {
      accessToken: 'OLD',
      refreshToken: 'RT',
      userId: 'me',
      expiresAt: 0,
    });
    const { f, calls } = fakeFetch((path) =>
      path.startsWith('/auth/v1/token')
        ? [200, { access_token: 'NEW', refresh_token: 'RT2', expires_in: 3600, user: { id: 'me' } }]
        : [500, {}],
    );
    const s = new SupabaseOnline({
      url: 'https://x.supabase.co',
      anonKey: 'A',
      storage,
      fetch: f,
      now: () => 10,
    });
    expect(await s.signIn()).toBe('me');
    expect(calls[0]?.body).toEqual({ refresh_token: 'RT' });
  });

  it('maps RPC exceptions and HTTP failures to error codes', () => {
    expect(errorCode(400, { message: 'notYourTurn' })).toBe('notYourTurn');
    expect(errorCode(404, { message: 'notFound' })).toBe('notFound');
    expect(errorCode(400, { message: 'conflict: x' })).toBe('conflict');
    expect(errorCode(401, {})).toBe('auth');
    expect(errorCode(500, null)).toBe('network');
  });

  it('turns a failed request into a network error', async () => {
    const f = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const s = new SupabaseOnline({
      url: 'https://x.supabase.co',
      anonKey: 'A',
      storage: createMemoryStorage(),
      fetch: f,
    });
    expect(await code(s.listMatches())).toBe('network');
  });
});

describe('selectOnline', () => {
  const storage = createMemoryStorage();
  it('uses Supabase when configured, the mock on the web, nothing fake on a device', () => {
    expect(
      selectOnline({ native: true, url: 'https://x.supabase.co', anonKey: 'k', storage }),
    ).toBeInstanceOf(SupabaseOnline);
    expect(selectOnline({ native: true, storage })).toBeInstanceOf(UnavailableOnline);
    expect(
      selectOnline({ native: false, storage, mockDb: kv(), mockIdentity: kv() }),
    ).toBeInstanceOf(MockOnline);
    expect(
      selectOnline({
        native: false,
        url: 'https://x.supabase.co',
        anonKey: 'k',
        storage,
        forceMock: true,
        mockDb: kv(),
        mockIdentity: kv(),
      }),
    ).toBeInstanceOf(MockOnline);
  });

  it('the unavailable service rejects every call', async () => {
    expect(await code(new UnavailableOnline().listMatches())).toBe('unavailable');
  });
});
