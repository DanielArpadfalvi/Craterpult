import { createMatch, type MatchSetup } from '../core/match';
import {
  applyTurn,
  OnlineReplayError,
  outcomeOf,
  TurnRecorder,
  type ReplayError,
  type TurnOutcome,
  type TurnRecord,
} from '../core/online';
import { hashState, type LoggedCommand } from '../core/replay';
import type { Command, MatchState } from '../core/types';

/** What happened in the step just taken (see {@link OnlinePlay.afterStep}). */
export interface OnlineStepResult {
  /** The local player finished a turn: send it. */
  submit?: { turn: TurnRecord; outcome: TurnOutcome };
  /** The opponent's turn just finished playing back. */
  remoteDone?: boolean;
  /** A received turn did not reproduce: the match cannot go on. */
  desync?: ReplayError;
}

/**
 * Drives one online match inside the live game loop: the local player's turns are recorded
 * command by command, the opponent's turns are played back tick by tick (so the player watches
 * them) and verified when they end. The match is rebuilt from the stored turns on open; the
 * opponent's latest turn is kept back to be watched.
 */
export class OnlinePlay {
  /** Turns fully applied to the live match. */
  private done = 0;
  private readonly queue: TurnRecord[] = [];
  private remote: { turn: TurnRecord; i: number; turnNumber: number } | null = null;
  private readonly recorder = new TurnRecorder();
  private broken: ReplayError | null = null;

  constructor(
    readonly setup: MatchSetup,
    readonly myTeam: number,
  ) {}

  /** Rebuild the match from `turns`; an unseen last turn of the opponent is queued to watch. */
  start(turns: readonly TurnRecord[]): MatchState {
    const s = createMatch(this.setup);
    const last = turns[turns.length - 1];
    const watch = last && last.team !== this.myTeam ? 1 : 0;
    try {
      for (let i = 0; i < turns.length - watch; i++) applyTurn(s, turns[i] as TurnRecord, i);
    } catch (e) {
      this.broken = e instanceof OnlineReplayError ? e.code : 'hash';
    }
    this.done = turns.length - watch;
    if (watch) this.queue.push(last as TurnRecord);
    this.beginIfLocal(s);
    return s;
  }

  /** Index of the next turn the server does not have yet from us / we have not seen. */
  get nextIndex(): number {
    return this.done + this.queue.length + (this.remote ? 1 : 0);
  }

  get desync(): ReplayError | null {
    return this.broken;
  }

  /** The opponent's turn is being played back. */
  get replaying(): boolean {
    return this.remote !== null;
  }

  /** Is `team` the one holding this phone? */
  isLocal(team: number): boolean {
    return team === this.myTeam;
  }

  /** Newly fetched turns (duplicates and our own are ignored). */
  enqueue(turns: readonly TurnRecord[]): void {
    for (const t of turns) {
      if (t.n === this.nextIndex && t.team !== this.myTeam) this.queue.push(t);
    }
  }

  /** The opponent has to move but their turn has not arrived yet. */
  waiting(s: MatchState): boolean {
    return (
      !this.broken &&
      s.phase !== 'over' &&
      !this.isLocal(s.activeTeam) &&
      !this.remote &&
      this.queue.length === 0
    );
  }

  /**
   * Commands to apply on the next tick: the local input during our turn (recorded), the
   * recorded input during the opponent's, or null when the step must wait.
   */
  beforeStep(s: MatchState, local: readonly Command[]): Command[] | null {
    if (this.broken || s.phase === 'over') return [];
    if (this.isLocal(s.activeTeam)) {
      this.recorder.log(s, local);
      return [...local];
    }
    if (!this.remote) {
      const next = this.queue.shift();
      if (!next) return null;
      if (next.n !== this.done || next.team !== s.activeTeam || next.from !== s.tick) {
        this.broken =
          next.n !== this.done ? 'order' : next.team !== s.activeTeam ? 'team' : 'start';
        return [];
      }
      this.remote = { turn: next, i: 0, turnNumber: s.turnNumber };
    }
    const r = this.remote;
    const cmds: Command[] = [];
    const tick = s.tick + 1;
    while (r.i < r.turn.cmds.length && (r.turn.cmds[r.i] as LoggedCommand).tick === tick)
      cmds.push((r.turn.cmds[r.i++] as LoggedCommand).cmd);
    if (r.i < r.turn.cmds.length && (r.turn.cmds[r.i] as LoggedCommand).tick < tick)
      this.broken = 'ticks';
    else if (s.tick - r.turn.from > r.turn.to - r.turn.from) this.broken = 'end';
    return cmds;
  }

  afterStep(s: MatchState): OnlineStepResult {
    if (this.broken) return { desync: this.broken };
    const r = this.remote;
    if (r) {
      if (s.phase !== 'over' && s.turnNumber === r.turnNumber) return {};
      this.remote = null;
      if (r.i !== r.turn.cmds.length) this.broken = 'ticks';
      else if (s.tick !== r.turn.to) this.broken = 'end';
      else if (hashState(s) !== r.turn.hash) this.broken = 'hash';
      if (this.broken) return { desync: this.broken };
      this.done++;
      this.beginIfLocal(s);
      return { remoteDone: true };
    }
    const turn = this.recorder.finish(s);
    if (!turn) return {};
    this.done++;
    this.beginIfLocal(s);
    return { submit: { turn, outcome: outcomeOf(s) } };
  }

  /** Play every queued opponent turn at once (the "skip replay" button). */
  fastForward(s: MatchState, step: (s: MatchState, cmds: Command[]) => void): void {
    let guard = 0;
    while ((this.remote || this.queue.length) && !this.broken && guard++ < 1e6) {
      const cmds = this.beforeStep(s, []);
      if (!cmds) break;
      step(s, cmds);
      this.afterStep(s);
    }
  }

  private beginIfLocal(s: MatchState): void {
    if (s.phase !== 'over' && this.isLocal(s.activeTeam) && !this.broken)
      this.recorder.beginTurn(s, this.done);
  }
}
