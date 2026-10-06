import {
  makeInviteCode,
  normalizeInviteCode,
  ONLINE_PROTOCOL,
  sanitizeParams,
  type OnlineParams,
  type TurnOutcome,
  type TurnRecord,
} from '../core/online';
import { OnlineError, type OnlineMatch, type OnlineService } from './types';

/** Synchronous key-value backend (localStorage / sessionStorage, or a Map in tests). */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MOCK_ONLINE_KEY = 'craterpult.mockOnline.v1';
export const MOCK_PLAYER_KEY = 'craterpult.mockOnline.player';

interface Row {
  id: string;
  code: string;
  status: OnlineMatch['status'];
  params: OnlineParams;
  players: (string | null)[];
  names: (string | null)[];
  turnCount: number;
  nextTeam: number;
  winner: number | null;
  resigned: number | null;
  updatedAt: number;
}

interface Db {
  seq: number;
  matches: Record<string, Row>;
  turns: Record<string, TurnRecord[]>;
}

export interface MockOnlineOptions {
  /** Shared "server" (localStorage: every tab of the browser sees the same matches). */
  db: KeyValue;
  /** Where this client's player id lives (sessionStorage: each tab is another player). */
  identity: KeyValue;
  now?: () => number;
  rand?: () => number;
}

/**
 * In-browser stand-in for the online backend with the same rules as the SQL functions in
 * `supabase/migrations`. Two tabs (or two Playwright pages of one context) play each other.
 */
export class MockOnline implements OnlineService {
  readonly available = true;
  private readonly now: () => number;
  private readonly rand: () => number;

  constructor(private readonly o: MockOnlineOptions) {
    this.now = o.now ?? (() => Date.now());
    this.rand = o.rand ?? (() => Math.random());
  }

  private load(): Db {
    try {
      const raw = this.o.db.getItem(MOCK_ONLINE_KEY);
      if (raw) return JSON.parse(raw) as Db;
    } catch {
      // A broken mock database starts over.
    }
    return { seq: 0, matches: {}, turns: {} };
  }

  private save(db: Db): void {
    this.o.db.setItem(MOCK_ONLINE_KEY, JSON.stringify(db));
  }

  private me(): string {
    let id = this.o.identity.getItem(MOCK_PLAYER_KEY);
    if (!id) {
      id = `p-${Math.floor(this.rand() * 1e9).toString(36)}-${this.now().toString(36)}`;
      this.o.identity.setItem(MOCK_PLAYER_KEY, id);
    }
    return id;
  }

  private view(r: Row): OnlineMatch {
    const me = this.me();
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      params: r.params,
      names: [...r.names],
      myTeam: Math.max(0, r.players.indexOf(me)),
      turnCount: r.turnCount,
      nextTeam: r.nextTeam,
      winner: r.winner,
      resigned: r.resigned,
      updatedAt: r.updatedAt,
    };
  }

  private member(db: Db, id: string): Row {
    const r = db.matches[id];
    if (!r || !r.players.includes(this.me())) throw new OnlineError('notFound');
    return r;
  }

  signIn(): Promise<string> {
    return Promise.resolve(this.me());
  }

  createMatch(params: OnlineParams, name: string): Promise<OnlineMatch> {
    const db = this.load();
    let code = makeInviteCode(this.rand);
    while (Object.values(db.matches).some((m) => m.code === code && m.status === 'open'))
      code = makeInviteCode(this.rand);
    const id = `m${++db.seq}`;
    const row: Row = {
      id,
      code,
      status: 'open',
      params: sanitizeParams(params),
      players: [null, this.me()],
      names: [null, cleanName(name)],
      turnCount: 0,
      nextTeam: -1,
      winner: null,
      resigned: null,
      updatedAt: this.now(),
    };
    db.matches[id] = row;
    db.turns[id] = [];
    this.save(db);
    return Promise.resolve(this.view(row));
  }

  joinMatch(code: string, name: string): Promise<OnlineMatch> {
    const db = this.load();
    const c = normalizeInviteCode(code);
    const row = Object.values(db.matches).find((m) => m.code === c && m.status === 'open');
    if (!c || !row) return Promise.reject(new OnlineError('notFound'));
    if (row.players.includes(this.me())) return Promise.reject(new OnlineError('ownMatch'));
    if (row.params.protocol !== ONLINE_PROTOCOL) return Promise.reject(new OnlineError('protocol'));
    row.players[0] = this.me();
    row.names[0] = cleanName(name);
    row.status = 'active';
    row.nextTeam = 0;
    row.updatedAt = this.now();
    this.save(db);
    return Promise.resolve(this.view(row));
  }

  listMatches(): Promise<OnlineMatch[]> {
    const me = this.me();
    return Promise.resolve(
      Object.values(this.load().matches)
        .filter((m) => m.players.includes(me))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((m) => this.view(m)),
    );
  }

  getMatch(id: string): Promise<OnlineMatch> {
    try {
      return Promise.resolve(this.view(this.member(this.load(), id)));
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }

  getTurns(id: string, from: number): Promise<TurnRecord[]> {
    try {
      const db = this.load();
      this.member(db, id);
      return Promise.resolve((db.turns[id] ?? []).filter((t) => t.n >= from));
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }

  submitTurn(id: string, turn: TurnRecord, outcome: TurnOutcome): Promise<OnlineMatch> {
    try {
      const db = this.load();
      const row = this.member(db, id);
      const seat = row.players.indexOf(this.me());
      if (row.status !== 'active' || row.nextTeam !== seat || turn.team !== seat)
        throw new OnlineError('notYourTurn');
      if (turn.n !== row.turnCount) throw new OnlineError('conflict');
      (db.turns[id] ??= []).push(turn);
      row.turnCount++;
      applyOutcome(row, outcome);
      row.updatedAt = this.now();
      this.save(db);
      return Promise.resolve(this.view(row));
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }

  resign(id: string): Promise<OnlineMatch> {
    try {
      const db = this.load();
      const row = this.member(db, id);
      const seat = row.players.indexOf(this.me());
      if (row.status !== 'active') throw new OnlineError('conflict');
      row.status = 'finished';
      row.resigned = seat;
      row.winner = 1 - seat;
      row.nextTeam = -1;
      row.updatedAt = this.now();
      this.save(db);
      return Promise.resolve(this.view(row));
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }

  cancel(id: string): Promise<void> {
    const db = this.load();
    const row = db.matches[id];
    if (row && row.status === 'open' && row.players[1] === this.me()) {
      delete db.matches[id];
      delete db.turns[id];
      this.save(db);
    }
    return Promise.resolve();
  }

  registerPushToken(): Promise<void> {
    return Promise.resolve();
  }
}

function applyOutcome(row: Row, o: TurnOutcome): void {
  if (o.winner !== null || o.nextTeam < 0) {
    row.status = 'finished';
    row.winner = o.winner ?? -1;
    row.nextTeam = -1;
  } else {
    row.nextTeam = o.nextTeam === 0 ? 0 : 1;
  }
}

/** Team names are shown to the other player: trimmed, single-line, at most 16 characters. */
export function cleanName(name: string): string {
  const n = [...name]
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, 16);
  return n || '?';
}
