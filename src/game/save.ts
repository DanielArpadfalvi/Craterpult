import type { Difficulty } from '../core/ai/bot';
import { MAP_STYLES, type MapStyle } from '../core/mapgen';
import { isLanguage } from '../i18n';
import { DEFAULT_PROFILE, sanitizeProfile, type Profile } from './profile';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings';
import { createStats, sanitizeStats, type Stats } from './stats';

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
export const SAVE_VERSION = 2;
/** Pre-v2 localStorage keys, moved into the save on first load. */
export const LEGACY_MUTE_KEY = 'craterpult:muted';
export const LEGACY_LANG_KEY = 'craterpult:lang';

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

/** Quick match choices from the menu. */
export interface QuickPrefs {
  difficulty: Difficulty;
  /** Craters per team (2–4). */
  teamSize: number;
  mapStyle: MapStyle | 'random';
}

export const DEFAULT_QUICK: Readonly<QuickPrefs> = {
  difficulty: 2,
  teamSize: 3,
  mapStyle: 'random',
};

export interface SaveData {
  version: number;
  settings: Settings;
  profile: Profile;
  quick: QuickPrefs;
  stats: Stats;
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
    settings: { ...DEFAULT_SETTINGS },
    profile: { ...DEFAULT_PROFILE },
    quick: { ...DEFAULT_QUICK },
    stats: createStats(),
    campaign: { stars: {} },
    daily: { days: {}, best: 0, streak: { current: 0, best: 0, last: '' } },
  };
}

type Raw = Record<string, unknown>;

/** Steps keyed by the version they upgrade *from* (e.g. `1: v1 → v2`). */
export const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  // v2: settings, team profile, quick match choices and stats join the save.
  1: (raw) => ({
    ...raw,
    settings: { ...DEFAULT_SETTINGS },
    profile: { ...DEFAULT_PROFILE },
    quick: { ...DEFAULT_QUICK },
    stats: createStats(),
  }),
};

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : def;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeQuick(raw: unknown): QuickPrefs {
  const r = isObj(raw) ? raw : {};
  const style = r.mapStyle;
  return {
    difficulty: int(r.difficulty, DEFAULT_QUICK.difficulty, 1, 5) as Difficulty,
    teamSize: int(r.teamSize, DEFAULT_QUICK.teamSize, 2, 4),
    mapStyle:
      style === 'random' || (MAP_STYLES as readonly unknown[]).includes(style)
        ? (style as QuickPrefs['mapStyle'])
        : DEFAULT_QUICK.mapStyle,
  };
}

function sanitize(raw: Raw): SaveData {
  const out = createDefaultSave();
  out.settings = sanitizeSettings(raw.settings);
  out.profile = sanitizeProfile(raw.profile);
  out.quick = sanitizeQuick(raw.quick);
  out.stats = sanitizeStats(raw.stats);
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

/**
 * Move the pre-v2 `craterpult:muted` / `craterpult:lang` values into the settings (mutates and
 * returns the save). Returns whether anything changed.
 */
export function importLegacyKeys(
  save: SaveData,
  legacy: { muted: string | null; lang: string | null },
): boolean {
  let changed = false;
  if (legacy.muted === '1' || legacy.muted === '0') {
    save.settings.sound = legacy.muted !== '1';
    changed = true;
  }
  if (isLanguage(legacy.lang)) {
    save.settings.language = legacy.lang;
    changed = true;
  }
  return changed;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
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
  migrateLegacyKeys();
  return cache;
}

function migrateLegacyKeys(): void {
  const read = (k: string): string | null => {
    try {
      return storage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  const legacy = { muted: read(LEGACY_MUTE_KEY), lang: read(LEGACY_LANG_KEY) };
  if (legacy.muted === null && legacy.lang === null) return;
  const draft = structuredClone(getSave());
  if (importLegacyKeys(draft, legacy)) updateSave(() => draft);
  try {
    storage?.removeItem?.(LEGACY_MUTE_KEY);
    storage?.removeItem?.(LEGACY_LANG_KEY);
  } catch {
    // Best effort: a leftover key is imported again (harmlessly) on the next load.
  }
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

/** "Reset progress": campaign, daily and stats start over; settings and the team are kept. */
export function resetProgress(save: SaveData): SaveData {
  const fresh = createDefaultSave();
  fresh.settings = { ...save.settings };
  fresh.profile = { ...save.profile };
  fresh.quick = { ...save.quick };
  return fresh;
}
