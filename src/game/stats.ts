import type { MatchEvent, Unit, WeaponId } from '../core/types';
import { WEAPON_IDS, WEAPONS } from '../core/weapons';

/**
 * Lifetime statistics of the player (team 0 in every offline mode: in pass & play that is the
 * phone's owner; online, the team the player holds). Recorded from match events by pure
 * helpers; only finished matches are committed.
 */
export type StatsMode = 'quick' | 'hotseat' | 'campaign' | 'daily' | 'online';
export const STATS_MODES: readonly StatsMode[] = [
  'quick',
  'campaign',
  'daily',
  'online',
  'hotseat',
];

export interface ModeStats {
  played: number;
  won: number;
}

export interface Stats {
  modes: Record<StatsMode, ModeStats>;
  /** Enemy craters knocked out on your turns. */
  kills: number;
  /** Your craters lost. */
  unitsLost: number;
  /** Attacking shots fired (utility tools such as teleport or girders are not shots). */
  shots: number;
  /** Shots that damaged at least one enemy. */
  hits: number;
  /** Biggest total enemy damage of a single shot. */
  bestShot: number;
  /** Times each weapon or tool was used. */
  weapons: Partial<Record<WeaponId, number>>;
  /** Current and best run of wins against bots. */
  winStreak: number;
  bestWinStreak: number;
}

export function createStats(): Stats {
  return {
    modes: {
      quick: { played: 0, won: 0 },
      hotseat: { played: 0, won: 0 },
      campaign: { played: 0, won: 0 },
      daily: { played: 0, won: 0 },
      online: { played: 0, won: 0 },
    },
    kills: 0,
    unitsLost: 0,
    shots: 0,
    hits: 0,
    bestShot: 0,
    weapons: {},
    winStreak: 0,
    bestWinStreak: 0,
  };
}

const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function sanitizeStats(raw: unknown): Stats {
  const r = obj(raw);
  const out = createStats();
  const modes = obj(r.modes);
  for (const m of STATS_MODES) {
    const v = obj(modes[m]);
    const played = count(v.played);
    out.modes[m] = { played, won: Math.min(played, count(v.won)) };
  }
  out.kills = count(r.kills);
  out.unitsLost = count(r.unitsLost);
  out.shots = count(r.shots);
  out.hits = Math.min(out.shots, count(r.hits));
  out.bestShot = count(r.bestShot);
  const weapons = obj(r.weapons);
  for (const w of WEAPON_IDS) {
    const n = count(weapons[w]);
    if (n > 0) out.weapons[w] = n;
  }
  out.winStreak = count(r.winStreak);
  out.bestWinStreak = Math.max(out.winStreak, count(r.bestWinStreak));
  return out;
}

/** Per-match counters, fed tick by tick with `tallyEvents`. */
export interface MatchTally {
  /** The player's team. */
  player: number;
  /** Team whose turn it is (follows `turnStart` events). */
  turnTeam: number;
  kills: number;
  unitsLost: number;
  shots: number;
  hits: number;
  bestShot: number;
  weapons: Partial<Record<WeaponId, number>>;
  /** Enemy damage of the attacking shot in flight, or null. */
  shot: number | null;
}

export function createTally(firstTeam: number, player = 0): MatchTally {
  return {
    player,
    turnTeam: firstTeam,
    kills: 0,
    unitsLost: 0,
    shots: 0,
    hits: 0,
    bestShot: 0,
    weapons: {},
    shot: null,
  };
}

function closeShot(t: MatchTally): void {
  if (t.shot === null) return;
  if (t.shot > 0) {
    t.hits++;
    t.bestShot = Math.max(t.bestShot, t.shot);
  }
  t.shot = null;
}

/**
 * Count one tick's events (mutates `t`). `units` maps a unit id to its team. A shot's damage is
 * every enemy hit from its `fired` event until the next shot or the end of the turn.
 */
export function tallyEvents(
  t: MatchTally,
  events: readonly MatchEvent[],
  units: readonly Pick<Unit, 'team'>[],
): MatchTally {
  const teamOf = (id: number): number => units[id]?.team ?? -1;
  const { player } = t;
  for (const e of events) {
    switch (e.type) {
      case 'turnStart':
        closeShot(t);
        t.turnTeam = e.team;
        break;
      case 'fired':
        if (teamOf(e.unit) !== player) break;
        closeShot(t);
        t.weapons[e.weapon] = (t.weapons[e.weapon] ?? 0) + 1;
        if (WEAPONS[e.weapon].damage > 0) {
          t.shots++;
          t.shot = 0;
        }
        break;
      case 'damage':
        if (t.shot !== null && t.turnTeam === player && teamOf(e.unit) !== player)
          t.shot += e.amount;
        break;
      case 'died':
      case 'drowned':
        if (teamOf(e.unit) === player) t.unitsLost++;
        else if (t.turnTeam === player) t.kills++;
        break;
      case 'gameOver':
        closeShot(t);
        break;
      default:
        break;
    }
  }
  return t;
}

export interface FinishedMatch {
  mode: StatsMode;
  /** The player's team won. */
  won: boolean;
  /** Played against at least one bot (counts toward the win streak). */
  vsBot: boolean;
  tally: MatchTally;
}

/** Add a finished match to the lifetime stats (mutates and returns `s`). */
export function recordMatch(s: Stats, m: FinishedMatch): Stats {
  const t = m.tally;
  closeShot(t);
  const mode = s.modes[m.mode];
  mode.played++;
  if (m.won) mode.won++;
  s.kills += t.kills;
  s.unitsLost += t.unitsLost;
  s.shots += t.shots;
  s.hits += t.hits;
  s.bestShot = Math.max(s.bestShot, t.bestShot);
  for (const [w, n] of Object.entries(t.weapons) as [WeaponId, number][])
    s.weapons[w] = (s.weapons[w] ?? 0) + n;
  if (m.vsBot) {
    s.winStreak = m.won ? s.winStreak + 1 : 0;
    s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
  }
  return s;
}

/** Hit accuracy in whole percent (0 when nothing was fired). */
export function accuracy(s: Pick<Stats, 'shots' | 'hits'>): number {
  return s.shots > 0 ? Math.round((100 * s.hits) / s.shots) : 0;
}

/** Most used weapon (ties: arsenal order), or null. */
export function favouriteWeapon(s: Pick<Stats, 'weapons'>): WeaponId | null {
  let best: WeaponId | null = null;
  let n = 0;
  for (const w of WEAPON_IDS) {
    const c = s.weapons[w] ?? 0;
    if (c > n) {
      best = w;
      n = c;
    }
  }
  return best;
}

export function totalPlayed(s: Stats): { played: number; won: number } {
  return STATS_MODES.reduce(
    (a, m) => ({ played: a.played + s.modes[m].played, won: a.won + s.modes[m].won }),
    { played: 0, won: 0 },
  );
}
