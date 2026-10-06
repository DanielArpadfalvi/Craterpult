/**
 * Versioned save game, persisted as one JSON document in localStorage (`craterpult:save`).
 *
 * - Bump `SAVE_VERSION` when the shape changes and add a step to `MIGRATIONS` that turns version
 *   N-1 data into version N (steps run oldest first).
 * - After migrating, every field is sanitized against its default, so damaged or hand-edited data
 *   still loads; unknown fields are dropped, invalid ones fall back to defaults.
 * - Unreadable data (not JSON, not an object, newer than this build) starts a fresh save; the raw
 *   text is parked under `SAVE_BACKUP_KEY`.
 */

export const SAVE_KEY = 'craterpult:save';
export const SAVE_BACKUP_KEY = 'craterpult:save.corrupt';
export const SAVE_VERSION = 1;

export interface DailyDay {
  /** Score of the official attempt (0 until finished). */
  score: number;
  won: boolean;
  /** The official attempt was started (it is spent at start). */
  official: boolean;
  /** The official attempt was finished. */
  done: boolean;
  /** Best practice score of that day. */
  practiceBest: number;
}

export interface DailyStreak {
  current: number;
  best: number;
  /** `YYYY-MM-DD` of the last official attempt ('' = never). */
  last: string;
}

export interface SaveData {
  version: number;
  campaign: {
    /** Best stars (1–3) per mission id; missing = not completed. */
    stars: Record<string, number>;
  };
  daily: {
    /** Recent days, keyed by `YYYY-MM-DD`. */
    days: Record<string, DailyDay>;
    /** Best official score ever. */
    best: number;
    streak: DailyStreak;
  };
}

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    campaign: { stars: {} },
    daily: { days: {}, best: 0, streak: { current: 0, best: 0, last: '' } },
  };
}

type Raw = Record<string, unknown>;

/** Steps keyed by the version they upgrade *from* (e.g. `1: v1 → v2`). */
export const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {};

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : def;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(raw: Raw): SaveData {
  const out = createDefaultSave();
  const camp = isObj(raw.campaign) ? raw.campaign : {};
  if (isObj(camp.stars)) {
    for (const [id, v] of Object.entries(camp.stars)) {
      const n = int(v, 0, 0, 3);
      if (n > 0 && id.length < 32) out.campaign.stars[id] = n;
    }
  }
  const daily = isObj(raw.daily) ? raw.daily : {};
  if (isObj(daily.days)) {
    for (const [day, v] of Object.entries(daily.days)) {
      if (!DATE_RE.test(day) || !isObj(v)) continue;
      out.daily.days[day] = {
        score: int(v.score, 0),
        won: v.won === true,
        official: v.official === true,
        done: v.done === true,
        practiceBest: int(v.practiceBest, 0),
      };
    }
  }
  out.daily.best = int(daily.best, 0);
  const st = isObj(daily.streak) ? daily.streak : {};
  out.daily.streak = {
    current: int(st.current, 0),
    best: int(st.best, 0),
    last: typeof st.last === 'string' && DATE_RE.test(st.last) ? st.last : '',
  };
  out.daily.streak.best = Math.max(out.daily.streak.best, out.daily.streak.current);
  return out;
}

/** Parse stored JSON text into a valid save; null when the data cannot be used at all. */
export function parseSave(text: string | null): SaveData | null {
  if (text === null) return createDefaultSave();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw)) return null;
  let version = int(raw.version, 0);
  if (version < 1 || version > SAVE_VERSION) return null;
  let data: Raw = raw;
  try {
    while (version < SAVE_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) return null;
      data = step(data);
      version++;
    }
  } catch {
    return null;
  }
  return sanitize(data);
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let cache: SaveData | null = null;
let storage: KeyValueStorage | null = null;
const listeners = new Set<(s: SaveData) => void>();

/** Load (once) and return the save. Pass a storage to (re)load from it (tests). */
export function loadSave(from?: KeyValueStorage | null): SaveData {
  if (cache && from === undefined) return cache;
  storage = from === undefined ? defaultStorage() : from;
  let text: string | null;
  try {
    text = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    text = null;
  }
  const parsed = parseSave(text);
  if (!parsed) {
    try {
      if (text !== null) storage?.setItem(SAVE_BACKUP_KEY, text);
    } catch {
      // Ignore: the backup is best effort.
    }
  }
  cache = parsed ?? createDefaultSave();
  return cache;
}

export function getSave(): SaveData {
  return cache ?? loadSave();
}

/**
 * Change the save: `fn` gets a deep copy to mutate (or returns a replacement). The result is
 * written through and announced to listeners.
 */
export function updateSave(fn: (draft: SaveData) => SaveData | void): SaveData {
  const draft = structuredClone(getSave());
  const next = fn(draft) ?? draft;
  next.version = SAVE_VERSION;
  cache = next;
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: keep playing with the in-memory save.
  }
  for (const l of listeners) l(next);
  return next;
}

export function onSaveChange(fn: (s: SaveData) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
