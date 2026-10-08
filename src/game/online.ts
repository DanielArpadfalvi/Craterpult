import type { MapStyle } from '../core/mapgen';
import {
  normalizeInviteCode,
  ONLINE_MAP_STYLES,
  ONLINE_TURN_SECONDS,
  sanitizeParams,
  type TurnOutcome,
  type TurnRecord,
} from '../core/online';
import {
  OnlineError,
  type OnlineErrorCode,
  type OnlineMatch,
  type OnlineService,
} from '../net/types';
import type { JsonValue, Storage } from '../platform/types';
import { joinUrl } from './links';
import type { UiState } from './state';
import type { Store } from './store';

/** Online lobby and in-match status shown by the UI (M9). */
export interface OnlineUi {
  /** The build has an online backend. */
  available: boolean;
  /** The match list is loading. */
  loading: boolean;
  /** Creating / joining / resigning. */
  busy: boolean;
  error: OnlineErrorCode | null;
  matches: OnlineMatch[];
  /** Id of the invite just created (its code card is shown on top). */
  invite: string | null;
  /** Code typed (or opened from an invite link) in the join field. */
  joinCode: string;
  /** New-match options. */
  teamSize: number;
  style: MapStyle;
  turnSeconds: number;
  /** The match being played, or null. */
  matchId: string | null;
  opponent: string;
  /** Watching the opponent's turn. */
  replaying: boolean;
  /** A finished turn is on its way to the server. */
  sending: number;
  /** Desync reason of the match being played, or null. */
  desync: string | null;
  /** Id of the match whose "resign" was tapped once (tap again to confirm). */
  confirmResign: string | null;
}

export const INITIAL_ONLINE: OnlineUi = {
  available: false,
  loading: false,
  busy: false,
  error: null,
  matches: [],
  invite: null,
  joinCode: '',
  teamSize: 3,
  style: 'hills',
  turnSeconds: 45,
  matchId: null,
  opponent: '',
  replaying: false,
  sending: 0,
  desync: null,
  confirmResign: null,
};

/** Finished turns waiting to reach the server (kept across restarts). */
export const OUTBOX_KEY = 'craterpult.online.outbox';
const RETRY_MS = 8000;

interface Outgoing {
  matchId: string;
  turn: TurnRecord;
  outcome: TurnOutcome;
}

export interface OnlineActions {
  /** Open the online screen (optionally with an invite code filled in). */
  openOnline(code?: string): void;
  onlineRefresh(): Promise<void>;
  onlineOptions(patch: Partial<Pick<OnlineUi, 'teamSize' | 'style' | 'turnSeconds'>>): void;
  onlineCreate(): Promise<void>;
  onlineSetCode(code: string): void;
  onlineJoin(): Promise<void>;
  onlineOpen(id: string): Promise<void>;
  onlineCancel(id: string): Promise<void>;
  onlineResign(id: string): Promise<void>;
  /** Win a match whose opponent ran out of reply time. */
  onlineClaimTimeout(id: string): Promise<void>;
  /** Offer a rematch of a finished match, or take up the opponent's offer (then play it). */
  onlineRematch(id: string): Promise<void>;
  onlineShare(id: string): Promise<void>;
  onlineDismissInvite(): void;
}

export interface OnlineDeps {
  store: Store<UiState>;
  service: OnlineService;
  storage: Storage;
  /** The player's team name, shown to the opponent. */
  playerName(): string;
  /** A fresh match seed. */
  seed(): string;
  /** Start (or resume) playing a match from its stored turns. */
  play(match: OnlineMatch, turns: TurnRecord[]): void;
  /** Share an invite text; resolves how it went. */
  share(text: string): Promise<'shared' | 'copied' | 'failed'>;
  toast(text: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
}

export interface OnlineController {
  actions: OnlineActions;
  /** Queue a finished local turn and send it (retried until the server has it). */
  submit(matchId: string, turn: TurnRecord, outcome: TurnOutcome): Promise<void>;
  /** New turns of a match from index `from` (empty on errors). */
  fetchTurns(matchId: string, from: number): Promise<TurnRecord[]>;
  /** Retry turns that could not be sent yet. */
  flush(): Promise<void>;
  /** True the first time a finished match is reported (stats are recorded once per match). */
  firstFinish(matchId: string): Promise<boolean>;
}

/** Finished online matches already counted in the stats. */
export const RECORDED_KEY = 'craterpult.online.recorded';

/**
 * The invite code in an app link (`craterpult://join/ABCDEF`) or a web link
 * (`…/join.html?code=ABCDEF`, `…/?join=ABCDEF`); '' when there is none.
 */
export function inviteCodeFromUrl(url: string): string {
  const m =
    /^craterpult:\/\/join\/([A-Za-z0-9-]+)/.exec(url) ??
    /[?&](?:code|join)=([A-Za-z0-9-]+)/.exec(url);
  return m ? normalizeInviteCode(m[1] as string) : '';
}

const errorOf = (e: unknown): OnlineErrorCode => (e instanceof OnlineError ? e.code : 'network');

export function createOnline(d: OnlineDeps): OnlineController {
  const { store, service } = d;
  const ui = (): OnlineUi => store.get().online;
  const patch = (p: Partial<OnlineUi>): void => store.set({ online: { ...ui(), ...p } });
  patch({ available: service.available });

  let outbox: Outgoing[] | null = null;
  const loadOutbox = async (): Promise<Outgoing[]> => {
    if (!outbox) {
      const raw = await d.storage.get<JsonValue>(OUTBOX_KEY);
      outbox = Array.isArray(raw) ? (raw as unknown as Outgoing[]) : [];
    }
    return outbox;
  };
  const saveOutbox = async (): Promise<void> => {
    await d.storage.set(OUTBOX_KEY, (outbox ?? []) as unknown as JsonValue);
    patch({ sending: outbox?.length ?? 0 });
  };

  let flushing: Promise<void> | null = null;
  async function flushOnce(): Promise<void> {
    const box = await loadOutbox();
    while (box.length > 0) {
      const o = box[0] as Outgoing;
      try {
        const m = await service.submitTurn(o.matchId, o.turn, o.outcome);
        upsert(m);
      } catch (e) {
        const code = errorOf(e);
        // Only a lost connection is worth retrying; anything else means the server will never
        // take this turn (already stored, match resigned, …).
        if (code === 'network' || code === 'auth') {
          await saveOutbox();
          throw e;
        }
      }
      box.shift();
      await saveOutbox();
    }
  }
  let retry: ReturnType<typeof setTimeout> | null = null;
  const flush = (): Promise<void> => {
    flushing ??= flushOnce()
      .catch((e: unknown) => {
        // Keep trying in the background while turns are waiting to be sent.
        retry ??= setTimeout(() => {
          retry = null;
          void flush().catch(() => undefined);
        }, RETRY_MS);
        throw e;
      })
      .finally(() => (flushing = null));
    return flushing;
  };

  /** Replace (or add) a match in the list. */
  function upsert(m: OnlineMatch): void {
    const list = ui().matches.filter((x) => x.id !== m.id);
    patch({ matches: [m, ...list].sort((a, b) => b.updatedAt - a.updatedAt) });
  }

  async function guard<T>(fn: () => Promise<T>, busy = true): Promise<T | undefined> {
    if (busy) patch({ busy: true, error: null });
    try {
      return await fn();
    } catch (e) {
      patch({ error: errorOf(e) });
      return undefined;
    } finally {
      if (busy) patch({ busy: false });
    }
  }

  const actions: OnlineActions = {
    openOnline(code) {
      const joinCode = code ? normalizeInviteCode(code) || code.toUpperCase().slice(0, 8) : '';
      store.set({ sheet: 'online' });
      patch({ error: null, confirmResign: null, ...(code ? { joinCode } : {}) });
      void actions.onlineRefresh();
    },
    async onlineRefresh() {
      if (!service.available) return;
      patch({ loading: true, error: null });
      try {
        await flush().catch(() => undefined);
        patch({ matches: await service.listMatches() });
      } catch (e) {
        patch({ error: errorOf(e) });
      } finally {
        patch({ loading: false });
      }
    },
    onlineOptions(p) {
      const next = { ...ui(), ...p };
      patch({
        teamSize: Math.min(4, Math.max(2, Math.trunc(next.teamSize))),
        style: ONLINE_MAP_STYLES.includes(next.style) ? next.style : 'hills',
        turnSeconds: (ONLINE_TURN_SECONDS as readonly number[]).includes(next.turnSeconds)
          ? next.turnSeconds
          : 45,
      });
    },
    async onlineCreate() {
      const o = ui();
      const m = await guard(() =>
        service.createMatch(
          sanitizeParams({
            seed: d.seed(),
            teamSize: o.teamSize,
            style: o.style,
            turnSeconds: o.turnSeconds,
          }),
          d.playerName(),
        ),
      );
      if (m) {
        upsert(m);
        patch({ invite: m.id });
      }
    },
    onlineSetCode(code) {
      patch({ joinCode: code.toUpperCase().slice(0, 8), error: null });
    },
    async onlineJoin() {
      const code = normalizeInviteCode(ui().joinCode);
      if (!code) {
        patch({ error: 'notFound' });
        return;
      }
      const m = await guard(() => service.joinMatch(code, d.playerName()));
      if (m) {
        upsert(m);
        patch({ joinCode: '' });
        await actions.onlineOpen(m.id);
      }
    },
    async onlineOpen(id) {
      const r = await guard(async () => {
        await flush().catch(() => undefined);
        const [m, turns] = await Promise.all([service.getMatch(id), service.getTurns(id, 0)]);
        return { m, turns };
      });
      if (!r) return;
      upsert(r.m);
      if (r.m.status === 'open') {
        patch({ invite: r.m.id });
        return;
      }
      d.play(r.m, r.turns);
    },
    async onlineCancel(id) {
      await guard(() => service.cancel(id));
      patch({
        matches: ui().matches.filter((m) => m.id !== id),
        invite: ui().invite === id ? null : ui().invite,
      });
    },
    async onlineResign(id) {
      if (ui().confirmResign !== id) {
        patch({ confirmResign: id });
        return;
      }
      patch({ confirmResign: null });
      const m = await guard(() => service.resign(id));
      if (m) upsert(m);
    },
    async onlineClaimTimeout(id) {
      const m = await guard(() => service.claimTimeout(id));
      if (m) upsert(m);
      // Too early after all (the server's clock decides): show the fresh state.
      else void actions.onlineRefresh();
    },
    async onlineRematch(id) {
      const old = ui().matches.find((x) => x.id === id);
      const params = sanitizeParams({ ...(old?.params ?? {}), seed: d.seed() });
      const m = await guard(async () => {
        // Our last turn may still be on its way: the server needs the match finished first.
        await flush().catch(() => undefined);
        return service.rematch(id, params, d.playerName());
      });
      if (!m) return;
      upsert(m);
      if (old && old.rematch === null)
        upsert({ ...old, rematch: m.id, rematchBy: old.myTeam, updatedAt: m.updatedAt });
      if (m.status === 'open') {
        store.set({ sheet: 'online' });
        patch({ invite: m.id });
        return;
      }
      await actions.onlineOpen(m.id);
    },
    async onlineShare(id) {
      const m = ui().matches.find((x) => x.id === id);
      if (!m) return;
      const how = await d.share(d.t('online.shareMessage', { code: m.code, url: joinUrl(m.code) }));
      if (how === 'copied') d.toast(d.t('online.copied'));
    },
    onlineDismissInvite() {
      patch({ invite: null });
    },
  };

  return {
    actions,
    async submit(matchId, turn, outcome) {
      const box = await loadOutbox();
      box.push({ matchId, turn, outcome });
      await saveOutbox();
      try {
        await flush();
        d.toast(d.t('online.sent'));
      } catch {
        d.toast(d.t('online.sendFailed'));
      }
    },
    async fetchTurns(matchId, from) {
      try {
        return await service.getTurns(matchId, from);
      } catch {
        return [];
      }
    },
    flush,
    async firstFinish(matchId) {
      const raw = await d.storage.get<JsonValue>(RECORDED_KEY);
      const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
      if (ids.includes(matchId)) return false;
      await d.storage.set(RECORDED_KEY, [matchId, ...ids].slice(0, 200));
      return true;
    },
  };
}
