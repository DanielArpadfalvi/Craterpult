import { describe, expect, it } from 'vitest';
import { step } from '../../../src/core/match';
import { onlineSetup, sanitizeParams, type TurnRecord } from '../../../src/core/online';
import { hashState } from '../../../src/core/replay';
import type { Command, MatchState } from '../../../src/core/types';
import { OnlinePlay } from '../../../src/game/onlinePlay';

const SETUP = onlineSetup(
  sanitizeParams({ seed: 'op-1', teamSize: 2, style: 'flats', turnSeconds: 30 }),
  ['Joiner', 'Creator'],
);

/** One client: its OnlinePlay and live match, stepped like the game loop. */
function client(myTeam: number, turns: TurnRecord[]) {
  const play = new OnlinePlay(SETUP, myTeam);
  const s = play.start(turns);
  return { play, s };
}

/**
 * Run the loop until the client needs the opponent (or the match ends). `input(k)` is the local
 * input on the k-th tick of our turn. Returns the submitted turns.
 */
function run(
  c: { play: OnlinePlay; s: MatchState },
  input: (k: number) => Command[] = () => [],
  maxTicks = 20000,
): { sent: TurnRecord[]; remoteDone: number } {
  const sent: TurnRecord[] = [];
  let remoteDone = 0;
  let k = 0;
  for (let i = 0; i < maxTicks; i++) {
    if (c.s.phase === 'over') break;
    if (c.play.waiting(c.s) && sent.length > 0) break;
    const local = c.play.isLocal(c.s.activeTeam) ? input(++k) : [];
    const cmds = c.play.beforeStep(c.s, local);
    if (!cmds) break;
    step(c.s, cmds);
    const r = c.play.afterStep(c.s);
    if (r.desync) throw new Error(`desync ${r.desync}`);
    if (r.remoteDone) remoteDone++;
    if (r.submit) {
      sent.push(r.submit.turn);
      k = 0;
    }
  }
  return { sent, remoteDone };
}

const fire = (k: number): Command[] =>
  k === 10 ? [{ t: 'fire', weapon: 'grenade', angle: 600, power: 55, fuse: 2 }] : [];

describe('OnlinePlay', () => {
  it('the joiner plays first and waits; the creator watches that turn and replies', () => {
    const joiner = client(0, []);
    expect(joiner.play.waiting(joiner.s)).toBe(false);
    const a = run(joiner, fire);
    expect(a.sent.map((t) => [t.n, t.team])).toEqual([[0, 0]]);
    expect(joiner.play.waiting(joiner.s)).toBe(true);
    expect(joiner.play.nextIndex).toBe(1);

    // The creator opens the match: the joiner's turn is queued to be watched, not applied.
    const creator = client(1, a.sent);
    expect(creator.s.tick).toBe(0);
    expect(creator.play.waiting(creator.s)).toBe(false);
    const b = run(creator, fire);
    expect(b.remoteDone).toBe(1);
    expect(b.sent.map((t) => [t.n, t.team])).toEqual([[1, 1]]);

    // Back on the joiner's phone the reply arrives while waiting and is played back.
    joiner.play.enqueue([...a.sent, ...b.sent]);
    expect(joiner.play.waiting(joiner.s)).toBe(false);
    const c = run(joiner, () => [{ t: 'skip' }]);
    expect(c.remoteDone).toBe(1);
    expect(c.sent[0]?.n).toBe(2);
    expect(hashState(joiner.s)).toBe(c.sent[0]?.hash);
  });

  it('rebuilding from all turns gives the same state as playing them live', () => {
    const joiner = client(0, []);
    const t0 = run(joiner, fire).sent;
    const creator = client(1, t0);
    const t1 = run(creator, fire).sent;
    joiner.play.enqueue(t1);
    const t2 = run(joiner, fire).sent;
    const all = [...t0, ...t1, ...t2];
    // The joiner's own latest turn is applied directly (nothing to watch).
    const reopened = client(0, all);
    expect(reopened.play.waiting(reopened.s)).toBe(true);
    expect(hashState(reopened.s)).toBe(hashState(joiner.s));
  });

  it('fast-forwards the opponent turn on "skip replay"', () => {
    const joiner = client(0, []);
    const sent = run(joiner, fire).sent;
    const creator = client(1, sent);
    expect(creator.play.waiting(creator.s)).toBe(false);
    creator.play.fastForward(creator.s, step);
    expect(creator.s.tick).toBe(sent[0]?.to);
    expect(creator.s.activeTeam).toBe(1);
  });

  it('flags a forged turn as a desync instead of playing on', () => {
    const joiner = client(0, []);
    const [t0] = run(joiner, fire).sent as [TurnRecord];
    const creator = client(1, [{ ...t0, hash: 'ffffffff' }]);
    expect(() => run(creator)).toThrow(/desync hash/);
    const other = client(1, [{ ...t0, team: 1 }]);
    expect(() => run(other)).toThrow(/desync team/);
  });

  it('a broken history found while rebuilding is reported', () => {
    const joiner = client(0, []);
    const t0 = run(joiner, fire).sent;
    const creator = client(1, t0);
    const t1 = run(creator, fire).sent;
    const bad = client(1, [{ ...(t0[0] as TurnRecord), hash: '00000000' }, ...t1]);
    expect(bad.play.desync).toBe('hash');
  });

  it('ignores duplicate and own turns when polling', () => {
    const joiner = client(0, []);
    const sent = run(joiner, fire).sent;
    joiner.play.enqueue(sent);
    expect(joiner.play.waiting(joiner.s)).toBe(true);
  });
});
