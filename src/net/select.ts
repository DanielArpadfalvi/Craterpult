import type { Storage } from '../platform/types';
import { MockOnline, type KeyValue } from './mock';
import { SupabaseOnline } from './supabase';
import { OnlineError, type OnlineService } from './types';

/** Online play is not configured in this build (no backend URL/key): every call fails. */
export class UnavailableOnline implements OnlineService {
  readonly available = false;
  private fail<T>(): Promise<T> {
    return Promise.reject(new OnlineError('unavailable'));
  }
  signIn = (): Promise<string> => this.fail();
  createMatch = (): Promise<never> => this.fail();
  joinMatch = (): Promise<never> => this.fail();
  listMatches = (): Promise<never> => this.fail();
  getMatch = (): Promise<never> => this.fail();
  getTurns = (): Promise<never> => this.fail();
  submitTurn = (): Promise<never> => this.fail();
  resign = (): Promise<never> => this.fail();
  cancel = (): Promise<void> => this.fail();
  registerPushToken = (): Promise<void> => this.fail();
}

export interface SelectOnlineOptions {
  native: boolean;
  /** Build-time backend config (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). */
  url?: string;
  anonKey?: string;
  storage: Storage;
  /** Web only: force the in-browser mock even when a backend is configured (`?mockOnline`). */
  forceMock?: boolean;
  /** Mock backends (default: localStorage shared, sessionStorage per tab). */
  mockDb?: KeyValue;
  mockIdentity?: KeyValue;
}

/**
 * Supabase when the build has a backend; on the web without one (development, e2e) the
 * localStorage mock; on a device without one, "unavailable" (never a fake server).
 */
export function selectOnline(o: SelectOnlineOptions): OnlineService {
  const configured = !!o.url && !!o.anonKey;
  if (configured && !(o.forceMock && !o.native))
    return new SupabaseOnline({
      url: o.url as string,
      anonKey: o.anonKey as string,
      storage: o.storage,
    });
  if (o.native) return new UnavailableOnline();
  const db = o.mockDb ?? globalThis.localStorage;
  const identity = o.mockIdentity ?? globalThis.sessionStorage;
  return db && identity ? new MockOnline({ db, identity }) : new UnavailableOnline();
}

/** Build-time backend config from the Vite env. */
export function onlineEnv(): { url?: string; anonKey?: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    url: env.VITE_SUPABASE_URL || undefined,
    anonKey: env.VITE_SUPABASE_ANON_KEY || undefined,
  };
}
