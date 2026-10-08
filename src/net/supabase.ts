import type { OnlineParams, TurnOutcome, TurnRecord } from '../core/online';
import type { Storage } from '../platform/types';
import { OnlineError, type OnlineErrorCode, type OnlineMatch, type OnlineService } from './types';

/** Where the anonymous session (access + refresh token) is kept between launches. */
export const SUPABASE_SESSION_KEY = 'craterpult.online.session';

interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  /** Access token expiry, ms since the epoch. */
  expiresAt: number;
}

export interface SupabaseOnlineOptions {
  /** Project URL, e.g. https://xyz.supabase.co */
  url: string;
  /** Public anon (publishable) key. */
  anonKey: string;
  storage: Storage;
  fetch?: typeof fetch;
  now?: () => number;
}

type Json = Record<string, unknown>;

/**
 * The online backend on Supabase, spoken over plain HTTP (Auth + PostgREST RPC) so the app
 * needs no SDK: anonymous sign-in once per install, then the RPCs of
 * `supabase/migrations/*_online.sql`.
 */
export class SupabaseOnline implements OnlineService {
  readonly available = true;
  private session: Session | null = null;
  private loading: Promise<Session> | null = null;
  private readonly base: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly o: SupabaseOnlineOptions) {
    this.base = o.url.replace(/\/+$/, '');
    this.http = o.fetch ?? ((input, init) => fetch(input, init));
    this.now = o.now ?? (() => Date.now());
  }

  private async request(path: string, init: RequestInit, token?: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.http(`${this.base}${path}`, {
        ...init,
        headers: {
          apikey: this.o.anonKey,
          Authorization: `Bearer ${token ?? this.o.anonKey}`,
          'Content-Type': 'application/json',
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch {
      throw new OnlineError('network');
    }
    const text = await res.text();
    const body: unknown = text ? safeJson(text) : null;
    if (!res.ok) throw new OnlineError(errorCode(res.status, body), errorMessage(body));
    return body;
  }

  private async auth(path: string, body: Json): Promise<Session> {
    const r = (await this.request(`/auth/v1/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { id?: string };
    } | null;
    if (!r?.access_token || !r.refresh_token || !r.user?.id) throw new OnlineError('auth');
    const s: Session = {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      userId: r.user.id,
      expiresAt: this.now() + (r.expires_in ?? 3600) * 1000,
    };
    await this.o.storage.set(SUPABASE_SESSION_KEY, { ...s });
    return s;
  }

  /** A valid session: the cached one, a refreshed one, or a new anonymous user. */
  private async ensureSession(): Promise<Session> {
    const s = this.session;
    if (s && s.expiresAt - this.now() > 60_000) return s;
    this.loading ??= (async () => {
      try {
        const stored =
          s ?? ((await this.o.storage.get(SUPABASE_SESSION_KEY)) as Session | undefined) ?? null;
        if (stored && stored.expiresAt - this.now() > 60_000) return stored;
        if (stored) {
          try {
            return await this.auth('token?grant_type=refresh_token', {
              refresh_token: stored.refreshToken,
            });
          } catch (e) {
            // An expired or revoked refresh token: only a network error keeps the old identity.
            if (e instanceof OnlineError && e.code === 'network') throw e;
          }
        }
        return await this.auth('signup', { data: {} });
      } finally {
        this.loading = null;
      }
    })();
    this.session = await this.loading;
    return this.session;
  }

  private async rpc<T>(fn: string, args: Json = {}): Promise<T> {
    const s = await this.ensureSession();
    return (await this.request(
      `/rest/v1/rpc/${fn}`,
      { method: 'POST', body: JSON.stringify(args) },
      s.accessToken,
    )) as T;
  }

  async signIn(): Promise<string> {
    return (await this.ensureSession()).userId;
  }

  async createMatch(params: OnlineParams, name: string): Promise<OnlineMatch> {
    return toMatch(await this.rpc('create_match', { params, name }));
  }

  async joinMatch(code: string, name: string): Promise<OnlineMatch> {
    return toMatch(await this.rpc('join_match', { code, name }));
  }

  async listMatches(): Promise<OnlineMatch[]> {
    const rows = await this.rpc<unknown[]>('my_matches');
    return (Array.isArray(rows) ? rows : []).map(toMatch);
  }

  async getMatch(id: string): Promise<OnlineMatch> {
    return toMatch(await this.rpc('get_match', { match_id: id }));
  }

  async getTurns(id: string, from: number): Promise<TurnRecord[]> {
    const s = await this.ensureSession();
    const q = `match_id=eq.${encodeURIComponent(id)}&n=gte.${Math.max(0, Math.trunc(from))}`;
    const rows = (await this.request(
      `/rest/v1/turns?select=payload&${q}&order=n.asc`,
      { method: 'GET' },
      s.accessToken,
    )) as { payload: TurnRecord }[] | null;
    return (rows ?? []).map((r) => r.payload);
  }

  async submitTurn(id: string, turn: TurnRecord, outcome: TurnOutcome): Promise<OnlineMatch> {
    return toMatch(
      await this.rpc('submit_turn', {
        match_id: id,
        turn,
        next_team: outcome.nextTeam,
        winner: outcome.winner,
      }),
    );
  }

  async resign(id: string): Promise<OnlineMatch> {
    return toMatch(await this.rpc('resign_match', { match_id: id }));
  }

  async rematch(id: string, params: OnlineParams, name: string): Promise<OnlineMatch> {
    return toMatch(await this.rpc('rematch_match', { match_id: id, params, name }));
  }

  async startTurn(id: string, n: number): Promise<void> {
    await this.rpc('start_turn', { match_id: id, n });
  }

  async claimTimeout(id: string): Promise<OnlineMatch> {
    return toMatch(await this.rpc('claim_timeout', { match_id: id }));
  }

  async deleteMyData(): Promise<void> {
    await this.rpc('delete_my_data');
    // The account is gone: forget its session so the next call signs in afresh.
    this.session = null;
    await this.o.storage.remove(SUPABASE_SESSION_KEY);
  }

  async cancel(id: string): Promise<void> {
    await this.rpc('cancel_match', { match_id: id });
  }

  async registerPushToken(token: string, platform: 'android' | 'ios', lang: string): Promise<void> {
    await this.rpc('register_push_token', { token, platform, lang });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; msg?: unknown; error_description?: unknown };
    const m = b.message ?? b.msg ?? b.error_description;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

const KNOWN: readonly OnlineErrorCode[] = [
  'notFound',
  'full',
  'ownMatch',
  'notYourTurn',
  'conflict',
  'protocol',
  'auth',
];

/** Map an HTTP failure to an error code (the RPCs raise exceptions named after the codes). */
export function errorCode(status: number, body: unknown): OnlineErrorCode {
  const m = errorMessage(body) ?? '';
  const named = KNOWN.find((k) => m === k || m.startsWith(`${k}:`));
  if (named) return named;
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  return 'network';
}

function toMatch(raw: unknown): OnlineMatch {
  const r = (raw ?? {}) as Partial<OnlineMatch>;
  if (typeof r.id !== 'string' || !r.params) throw new OnlineError('protocol');
  return {
    id: r.id,
    code: String(r.code ?? ''),
    status: r.status === 'active' || r.status === 'finished' ? r.status : 'open',
    params: r.params,
    names: Array.isArray(r.names) ? r.names.map((n) => (typeof n === 'string' ? n : null)) : [],
    myTeam: r.myTeam === 0 ? 0 : 1,
    turnCount: Number(r.turnCount ?? 0),
    nextTeam: Number(r.nextTeam ?? -1),
    winner: r.winner === null || r.winner === undefined ? null : Number(r.winner),
    resigned: r.resigned === null || r.resigned === undefined ? null : Number(r.resigned),
    opponentGone: r.opponentGone === true,
    startedTurn:
      r.startedTurn === null || r.startedTurn === undefined ? null : Number(r.startedTurn),
    timedOut: r.timedOut === null || r.timedOut === undefined ? null : Number(r.timedOut),
    updatedAt: Number(r.updatedAt ?? 0),
    rematch: typeof r.rematch === 'string' ? r.rematch : null,
    rematchBy: r.rematchBy === null || r.rematchBy === undefined ? null : Number(r.rematchBy),
  };
}
