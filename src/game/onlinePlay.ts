import { createMatch, step, type MatchSetup } from '../core/match';
import {
  applyTurn,
  OnlineReplayError,
  outcomeOf,
  TurnRecorder,
  type PartialTurn,
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
  /** The local player's first command of turn `started`: tell the server the turn is on. */
  started?: number;
  /** A received turn did not reproduce: the match cannot go on. */
  desync?: ReplayError;
}

/** How a local turn left half-way is picked up again when the match is reopened. */
export interface OnlineResume {
  /** The turn as far as this device recorded it before leaving, or null. */
  partial: PartialTurn | null;
  /** The server already knows the player began the current turn. */
  started: boolean;
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
  /** Turn whose start was reported (first local command), or -1. */
  private startedN = -1;
  private justStarted = false;
  /** The current turn is forfeited: skip it as soon as aiming begins. */
  private forced = false;
  /** How the current local turn was picked up by `start` (see {@link OnlineResume}). */
  resumed: 'fresh' | 'continued' | 'forfeited' = 'fresh';
  /** A turn that a continued partial turn already finished (send it). */
  pendingSubmit: { turn: TurnRecord; outcome: TurnOutcome } | null = null;

  constructor(
    readonly setup: MatchSetup,
    readonly myTeam: number,
  ) {}

  /** Rebuild the match from `turns`; an unseen last turn of the opponent is queued to watch. */
  start(turns: readonly TurnRecord[], resume?: OnlineResume): MatchState {
    const s = createMatch(this.setup);
    const last = turns[turns.length - 1];
    // Our turn already began after that one: it was watched, go straight back to our turn.
    const own = resume?.partial?.team === this.myTeam ? resume.partial : null;
    const begun = !!resume && (resume.started || own?.n === turns.length);
    const watch = last && last.team !== this.myTeam && !begun ? 1 : 0;
    try {
      for (let i = 0; i < turns.length - watch; i++) applyTurn(s, turns[i] as TurnRecord, i);
    } catch (e) {
      this.broken = e instanceof OnlineReplayError ? e.code : 'hash';
    }
    this.done = turns.length - watch;
    if (watch) this.queue.push(last as TurnRecord);
    this.beginIfLocal(s);
    if (resume && this.recorder.active && !watch) this.resume(s, resume);
    return s;
  }

  /**
   * Leaving during your own turn must not let you play it again: the turn recorded on this
   * device continues where it stopped; without it, a turn the server saw begin is forfeited.
   */
  private resume(s: MatchState, r: OnlineResume): void {
    const p = r.partial;
    if (p && p.team === this.myTeam && p.n === this.done && p.from === s.tick) {
      this.resumed = 'continued';
      this.startedN = this.done;
      let i = 0;
      while (s.tick < p.upTo && s.phase !== 'over' && this.recorder.active) {
        const tick = s.tick + 1;
        const cmds: Command[] = [];
        while (i < p.cmds.length && (p.cmds[i] as LoggedCommand).tick === tick)
          cmds.push((p.cmds[i++] as LoggedCommand).cmd);
        this.recorder.log(s, cmds);
        step(s, cmds);
        const turn = this.recorder.finish(s);
        if (turn) {
          this.done++;
          this.pendingSubmit = { turn, outcome: outcomeOf(s) };
          this.beginIfLocal(s);
        }
      }
    } else if (r.started) {
      this.resumed = 'forfeited';
      this.startedN = this.done;
      this.forced = true;
    }
  }

  /** The local turn recorded so far, once it has begun (null before the first command). */
  partial(s: MatchState): PartialTurn | null {
    const p = this.recorder.partial(s);
    return p && this.startedN === p.n ? p : null;
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
    return this.remote !== null || this.queue.length > 0;
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
      let cmds: readonly Command[] = local;
      if (this.forced) {
        cmds = s.phase === 'aiming' ? [{ t: 'skip' }] : [];
        if (cmds.length) this.forced = false;
      }
      if (cmds.length > 0 && this.startedN !== this.done) {
        this.startedN = this.done;
        this.justStarted = true;
      }
      this.recorder.log(s, cmds);
      return [...cmds];
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
    const started = this.justStarted ? { started: this.startedN } : {};
    this.justStarted = false;
    const turn = this.recorder.finish(s);
    if (!turn) return started;
    this.done++;
    this.beginIfLocal(s);
    return { ...started, submit: { turn, outcome: outcomeOf(s) } };
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
