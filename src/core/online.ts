import { createMatch, step, type MatchSetup } from './match';
import type { MapStyle } from './mapgen';
import { hashState, type LoggedCommand } from './replay';
import type { Command, MatchState } from './types';

/**
 * Asynchronous online matches (M9): the server only stores the match parameters and each
 * finished turn (its command log and the resulting state hash). Every client rebuilds the
 * match by replaying the turns on the deterministic simulation and checks the hash after each
 * one, so a desync or a tampered turn is detected without any server-side simulation.
 */

/** Bumped whenever the simulation changes in a way that breaks old online matches. */
export const ONLINE_PROTOCOL = 1;

export const ONLINE_TEAMS = 2;
export const ONLINE_MAP_STYLES: readonly MapStyle[] = [
  'hills',
  'islands',
  'cavern',
  'towers',
  'flats',
];
/** Turn time choices (seconds) for online matches. */
export const ONLINE_TURN_SECONDS = [30, 45, 60] as const;
/**
 * Hard cap of a single turn's length. A turn ends by itself once the aim timer, the retreat
 * and the settling are over, so this only stops a malicious log from looping forever.
 */
export const MAX_TURN_TICKS = 60 * 60 * 6;

/** Everything both clients need to build the same match (stored by the server as-is). */
export interface OnlineParams {
  protocol: number;
  seed: string;
  /** Units per team (2–4). */
  teamSize: number;
  style: MapStyle;
  /** Aim time per turn in seconds. */
  turnSeconds: number;
}

/** One finished turn as it travels between the clients. */
export interface TurnRecord {
  /** 0-based turn index within the match. */
  n: number;
  /** Team that played it. */
  team: number;
  /** Tick at which the turn began (the match's tick when its `turnStart` happened). */
  from: number;
  /** Tick at which the next turn began or the match ended. */
  to: number;
  /** Commands with the tick they were applied on (`from` < tick ≤ `to`), in order. */
  cmds: LoggedCommand[];
  /** `hashState` right after tick `to`. */
  hash: string;
}

/** What a finished turn did to the match (the server stores it so lists need no replay). */
export interface TurnOutcome {
  /** Team whose turn is next, or -1 when the match is over. */
  nextTeam: number;
  /** Winning team (-1 = draw) once the match is over, else null. */
  winner: number | null;
}

export function sanitizeParams(p: Partial<OnlineParams> & { seed: string }): OnlineParams {
  const teamSize = Math.min(4, Math.max(2, Math.trunc(p.teamSize ?? 3)));
  const style = ONLINE_MAP_STYLES.includes(p.style as MapStyle) ? (p.style as MapStyle) : 'hills';
  const turnSeconds = (ONLINE_TURN_SECONDS as readonly number[]).includes(p.turnSeconds ?? 0)
    ? (p.turnSeconds as number)
    : 45;
  return {
    protocol: ONLINE_PROTOCOL,
    seed: String(p.seed).slice(0, 64),
    teamSize,
    style,
    turnSeconds,
  };
}

/** The match setup both clients build from the parameters (`names[i]` = team i). */
export function onlineSetup(params: OnlineParams, names: readonly string[]): MatchSetup {
  const p = sanitizeParams(params);
  return {
    seed: p.seed,
    map: { width: 1600, height: 900, waterLevel: 860, style: p.style },
    config: { turnTicks: p.turnSeconds * 60 },
    teams: Array.from({ length: ONLINE_TEAMS }, (_, i) => ({
      name: names[i] || `#${i + 1}`,
      units: Array.from({ length: p.teamSize }, (_, k) => `${String.fromCharCode(65 + k)}${i + 1}`),
    })),
  };
}

export function outcomeOf(s: MatchState): TurnOutcome {
  return s.phase === 'over'
    ? { nextTeam: -1, winner: s.winner ?? -1 }
    : { nextTeam: s.activeTeam, winner: null };
}

export type ReplayError = 'order' | 'team' | 'start' | 'ticks' | 'length' | 'end' | 'hash' | 'over';

export class OnlineReplayError extends Error {
  constructor(
    readonly code: ReplayError,
    /** Index of the offending turn. */
    readonly turn: number,
  ) {
    super(`online replay failed at turn ${turn}: ${code}`);
    this.name = 'OnlineReplayError';
  }
}

/**
 * Play one turn's commands on `s` (which must be at the turn's start) until the next turn
 * begins or the match ends. Returns the end tick. Commands are matched by tick; any command
 * outside the turn makes it invalid.
 */
function playTurn(s: MatchState, cmds: readonly LoggedCommand[], n: number): number {
  const turn = s.turnNumber;
  const from = s.tick;
  let i = 0;
  while (s.phase !== 'over' && s.turnNumber === turn) {
    if (s.tick - from >= MAX_TURN_TICKS) throw new OnlineReplayError('length', n);
    const next = s.tick + 1;
    const batch: Command[] = [];
    while (i < cmds.length && (cmds[i] as LoggedCommand).tick === next) {
      batch.push((cmds[i++] as LoggedCommand).cmd);
    }
    if (i < cmds.length && (cmds[i] as LoggedCommand).tick < next)
      throw new OnlineReplayError('ticks', n);
    step(s, batch);
  }
  if (i !== cmds.length) throw new OnlineReplayError('ticks', n);
  return s.tick;
}

/**
 * Apply one received turn to a match that is at the start of that turn, verifying everything a
 * client can check. Throws {@link OnlineReplayError} (and leaves `s` in an undefined state) if
 * the turn does not fit.
 */
export function applyTurn(s: MatchState, turn: TurnRecord, expectedN: number): void {
  if (turn.n !== expectedN) throw new OnlineReplayError('order', expectedN);
  if (s.phase === 'over') throw new OnlineReplayError('over', expectedN);
  if (turn.team !== s.activeTeam) throw new OnlineReplayError('team', expectedN);
  if (turn.from !== s.tick) throw new OnlineReplayError('start', expectedN);
  const end = playTurn(s, turn.cmds, expectedN);
  if (end !== turn.to) throw new OnlineReplayError('end', expectedN);
  if (hashState(s) !== turn.hash) throw new OnlineReplayError('hash', expectedN);
}

/** Rebuild a match from its setup and every turn so far (verified). */
export function replayTurns(setup: MatchSetup, turns: readonly TurnRecord[]): MatchState {
  const s = createMatch(setup);
  turns.forEach((t, i) => applyTurn(s, t, i));
  return s;
}

/** The local player's turn so far, kept on the device so leaving mid-turn cannot undo it. */
export interface PartialTurn {
  n: number;
  team: number;
  /** Tick at which the turn began. */
  from: number;
  cmds: LoggedCommand[];
  /** The match had been stepped up to this tick. */
  upTo: number;
}

/**
 * Records the local player's turn while the live game loop steps the match. Call `beginTurn`
 * when the turn starts, `log` for every tick's commands *before* stepping, and `finish` once
 * the step that started the next turn (or ended the match) has run.
 */
export class TurnRecorder {
  private cur: {
    n: number;
    team: number;
    turn: number;
    from: number;
    cmds: LoggedCommand[];
  } | null = null;

  get active(): boolean {
    return this.cur !== null;
  }

  beginTurn(s: MatchState, n: number): void {
    this.cur = { n, team: s.activeTeam, turn: s.turnNumber, from: s.tick, cmds: [] };
  }

  log(s: MatchState, cmds: readonly Command[]): void {
    if (!this.cur) return;
    for (const cmd of cmds) this.cur.cmds.push({ tick: s.tick + 1, cmd });
  }

  /** The finished turn, or null when the match is still in the recorded turn. */
  finish(s: MatchState): TurnRecord | null {
    const c = this.cur;
    if (!c) return null;
    if (s.phase !== 'over' && s.turnNumber === c.turn) return null;
    this.cur = null;
    return { n: c.n, team: c.team, from: c.from, to: s.tick, cmds: c.cmds, hash: hashState(s) };
  }

  /** The turn recorded so far (with the match at `s`), or null outside a local turn. */
  partial(s: MatchState): PartialTurn | null {
    const c = this.cur;
    return c ? { n: c.n, team: c.team, from: c.from, cmds: [...c.cmds], upTo: s.tick } : null;
  }

  cancel(): void {
    this.cur = null;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Normalize a typed invite code (case, spaces, dashes); '' if it cannot be a code. */
export function normalizeInviteCode(raw: string): string {
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  return c.length === 6 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : '';
}

/** Six characters from `CODE_ALPHABET` (no 0/O/1/I) picked by `rand` (0 ≤ x < 1). */
export function makeInviteCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
