import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../../src/core/match';
import {
  applyTurn,
  makeInviteCode,
  MAX_TURN_TICKS,
  normalizeInviteCode,
  OnlineReplayError,
  onlineSetup,
  outcomeOf,
  replayTurns,
  sanitizeParams,
  TurnRecorder,
  type OnlineParams,
  type TurnRecord,
} from '../../../src/core/online';
import { hashState } from '../../../src/core/replay';
import type { Command, MatchState } from '../../../src/core/types';

const PARAMS: OnlineParams = sanitizeParams({
  seed: 'online-1',
  teamSize: 2,
  style: 'hills',
  turnSeconds: 30,
});
const SETUP = onlineSetup(PARAMS, ['Ann', 'Bob']);

/** Play the current turn live (like the game loop): `plan(tickInTurn)` gives the commands. */
function playLive(
  s: MatchState,
  rec: TurnRecorder,
  n: number,
  plan: (k: number) => Command[],
): TurnRecord {
  rec.beginTurn(s, n);
  for (let k = 1; k < MAX_TURN_TICKS; k++) {
    const cmds = plan(k);
    rec.log(s, cmds);
    step(s, cmds);
    const done = rec.finish(s);
    if (done) return done;
  }
  throw new Error('turn never ended');
}

const shoot =
  (angle: number, power: number) =>
  (k: number): Command[] =>
    k === 5
      ? [{ t: 'move', dir: 1 }]
      : k === 20
        ? [{ t: 'move', dir: 0 }]
        : k === 30
          ? [{ t: 'fire', weapon: 'bazooka', angle, power }]
          : [];

function threeTurns(): { live: MatchState; turns: TurnRecord[] } {
  const live = createMatch(SETUP);
  const rec = new TurnRecorder();
  const turns = [
    playLive(live, rec, 0, shoot(450, 70)),
    playLive(live, rec, 1, shoot(1350, 60)),
    playLive(live, rec, 2, (k) => (k === 3 ? [{ t: 'skip' }] : [])),
  ];
  return { live, turns };
}

describe('online params', () => {
  it('clamps and defaults untrusted parameters', () => {
    const p = sanitizeParams({
      seed: 'x'.repeat(100),
      teamSize: 9,
      style: 'moon' as never,
      turnSeconds: 7,
    });
    expect(p.seed).toHaveLength(64);
    expect(p.teamSize).toBe(4);
    expect(p.style).toBe('hills');
    expect(p.turnSeconds).toBe(45);
  });

  it('builds the same two-team setup on every client', () => {
    expect(onlineSetup(PARAMS, ['Ann', 'Bob'])).toEqual(SETUP);
    expect(SETUP.teams.map((t) => t.units.length)).toEqual([2, 2]);
    expect(SETUP.config?.turnTicks).toBe(30 * 60);
    expect(SETUP.teams.some((t) => t.bot)).toBe(false);
  });
});

describe('online turns', () => {
  it('records turns live and the other client rebuilds the exact state', () => {
    const { live, turns } = threeTurns();
    expect(turns.map((t) => t.team)).toEqual([0, 1, 0]);
    expect(turns[1]?.from).toBe(turns[0]?.to);
    expect(turns[0]?.cmds.length).toBe(3);
    const remote = replayTurns(SETUP, turns);
    expect(hashState(remote)).toBe(hashState(live));
    expect(outcomeOf(remote)).toEqual({ nextTeam: 1, winner: null });
  });

  it('applies turns one at a time (the opponent watching each new turn)', () => {
    const { live, turns } = threeTurns();
    const s = createMatch(SETUP);
    turns.forEach((t, i) => applyTurn(s, t, i));
    expect(hashState(s)).toBe(hashState(live));
  });

  it('a turn without commands ends by the turn timer', () => {
    const s = createMatch(SETUP);
    const rec = new TurnRecorder();
    const t = playLive(s, rec, 0, () => []);
    expect(t.cmds).toEqual([]);
    expect(t.to - t.from).toBeGreaterThanOrEqual(30 * 60);
    expect(replayTurns(SETUP, [t]).activeTeam).toBe(1);
  });

  const reject = (turns: TurnRecord[], code: string): void => {
    try {
      replayTurns(SETUP, turns);
    } catch (e) {
      expect(e).toBeInstanceOf(OnlineReplayError);
      expect((e as OnlineReplayError).code).toBe(code);
      return;
    }
    throw new Error('expected a rejection');
  };

  it('rejects a tampered command (the state no longer matches)', () => {
    const { turns } = threeTurns();
    const t0 = turns[0] as TurnRecord;
    const cmds = t0.cmds.map((c) =>
      c.cmd.t === 'fire' ? { tick: c.tick, cmd: { ...c.cmd, power: 95 } } : c,
    );
    // A different shot changes the hash, or even when the turn ends.
    expect(() => replayTurns(SETUP, [{ ...t0, cmds }])).toThrow(OnlineReplayError);
  });

  it('rejects a forged hash, wrong team, wrong order and wrong start', () => {
    const { turns } = threeTurns();
    const [t0, t1] = turns as [TurnRecord, TurnRecord];
    reject([{ ...t0, hash: '00000000' }], 'hash');
    reject([{ ...t0, team: 1 }], 'team');
    reject([t1], 'order');
    reject([{ ...t0, from: 3 }], 'start');
    reject([{ ...t0, to: t0.to + 1 }], 'end');
  });

  it('rejects commands outside the turn or out of order', () => {
    const { turns } = threeTurns();
    const t0 = turns[0] as TurnRecord;
    reject([{ ...t0, cmds: [...t0.cmds, { tick: t0.to + 5, cmd: { t: 'skip' } }] }], 'ticks');
    reject([{ ...t0, cmds: [...t0.cmds].reverse() }], 'ticks');
  });

  it('reports the end of the match as the outcome', () => {
    const s = createMatch(SETUP);
    s.phase = 'over';
    s.winner = 1;
    expect(outcomeOf(s)).toEqual({ nextTeam: -1, winner: 1 });
  });

  it('the recorder ignores ticks without a running turn', () => {
    const s = createMatch(SETUP);
    const rec = new TurnRecorder();
    rec.log(s, [{ t: 'skip' }]);
    expect(rec.finish(s)).toBeNull();
    rec.beginTurn(s, 0);
    expect(rec.active).toBe(true);
    rec.cancel();
    expect(rec.active).toBe(false);
  });
});

describe('invite codes', () => {
  it('makes six unambiguous characters', () => {
    let x = 0;
    const code = makeInviteCode(() => (x = (x + 0.37) % 1));
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(normalizeInviteCode(code.toLowerCase().replace(/(...)/, '$1-'))).toBe(code);
  });

  it('rejects codes with look-alike or missing characters', () => {
    expect(normalizeInviteCode('ABC10O')).toBe('');
    expect(normalizeInviteCode('ABCDE')).toBe('');
    expect(normalizeInviteCode(' abc def ')).toBe('ABCDEF');
  });
});
