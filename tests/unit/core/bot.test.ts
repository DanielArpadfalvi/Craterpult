import { describe, expect, it } from 'vitest';
import { BotSearch, evaluate } from '../../../src/core/ai/bot';
import { createMatch, step } from '../../../src/core/match';
import { hashState } from '../../../src/core/replay';
import type { MatchState } from '../../../src/core/types';
import { flatMatch } from '../support/flat';

function playShot(s: MatchState, difficulty: 1 | 2 | 3 | 4 | 5): number {
  const search = new BotSearch(s, difficulty);
  const cmd = search.finish();
  const enemyHp = () =>
    s.units.filter((u) => u.team !== 0).reduce((n, u) => n + Math.max(0, u.hp), 0);
  const before = enemyHp();
  if (cmd) step(s, [cmd]);
  for (let i = 0; i < 900 && s.activeTeam === 0; i++)
    step(s, s.phase === 'aiming' && s.shotsLeft > 0 && cmd ? [cmd] : []);
  return before - enemyHp();
}

describe('bot', () => {
  it('scores a direct hit above a miss and penalizes hurting itself', () => {
    const s = flatMatch([[300], [500]]);
    const hit = evaluate(s, { t: 'fire', weapon: 'bazooka', angle: 100, power: 60 }, 0, 1);
    const miss = evaluate(s, { t: 'fire', weapon: 'bazooka', angle: 900, power: 100 }, 0, 1);
    const self = evaluate(s, { t: 'fire', weapon: 'bazooka', angle: 3500, power: 10 }, 0, 1);
    expect(hit).toBeGreaterThan(0);
    expect(miss).toBeLessThan(hit);
    expect(self).toBeLessThan(0);
  });

  it('does not change the real match while searching', () => {
    const s = flatMatch([[300], [600]]);
    const before = hashState(s);
    new BotSearch(s, 3).finish();
    expect(hashState(s)).toBe(before);
  });

  it('a hard bot hits a target across flat ground', () => {
    let dealt = 0;
    for (const x of [450, 650, 900]) {
      const s = flatMatch([[300], [x]]);
      dealt += playShot(s, 5);
    }
    expect(dealt).toBeGreaterThan(90);
  }, 20_000);

  it('a hard bot finds damaging shots on generated maps', () => {
    let hits = 0;
    for (const seed of ['b1', 'b2', 'b3', 'b4']) {
      const s = createMatch({
        seed,
        teams: [
          { name: 'A', units: ['a', 'b'] },
          { name: 'B', units: ['c', 'd'] },
        ],
      });
      s.wind = 0;
      if (playShot(s, 5) > 0) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(3);
  }, 20_000);

  it('is deterministic', () => {
    const a = new BotSearch(flatMatch([[300], [700]]), 3).finish();
    const b = new BotSearch(flatMatch([[300], [700]]), 3).finish();
    expect(a).toEqual(b);
  });
});
