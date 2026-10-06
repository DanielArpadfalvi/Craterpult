import { describe, expect, it } from 'vitest';
import {
  DAILY_MODIFIERS,
  DAILY_TURN_COST,
  DAILY_WIN_BONUS,
  dailyPlan,
  dailyScore,
  dailySeed,
  dailySetup,
} from '../../../src/core/daily';
import { createMatch } from '../../../src/core/match';
import { hashState } from '../../../src/core/replay';

describe('daily challenge', () => {
  it('is deterministic per date and varies across dates', () => {
    const a = dailyPlan(dailySeed('2026-10-06'));
    expect(dailyPlan(dailySeed('2026-10-06'))).toEqual(a);
    const mods = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      mods.add(dailyPlan(dailySeed(`2026-02-${String(d).padStart(2, '0')}`)).modifier);
    }
    expect(mods.size).toBe(DAILY_MODIFIERS.length);
    const s1 = createMatch(dailySetup(dailySeed('2026-10-06'), ['A', 'B']));
    const s2 = createMatch(dailySetup(dailySeed('2026-10-06'), ['A', 'B']));
    expect(hashState(s1)).toBe(hashState(s2));
  });

  it('applies the modifier to the setup', () => {
    for (let d = 1; d <= 28; d++) {
      const seed = dailySeed(`2026-03-${String(d).padStart(2, '0')}`);
      const setup = dailySetup(seed, ['A', 'B']);
      const mod = dailyPlan(seed).modifier;
      expect(setup.teams[1]!.bot).toBe(true);
      expect(setup.teams[0]!.bot).toBe(false);
      if (mod === 'champions') expect(setup.teams[0]).toMatchObject({ hp: 200, units: ['A1'] });
      if (mod === 'grenadesOnly') expect(setup.teams[0]!.only).toEqual(['grenade']);
      if (mod === 'lowGravity') expect(setup.config?.gravityPct).toBeLessThan(100);
      if (mod === 'hurricane') expect(setup.config?.windScale).toBeGreaterThan(100);
      if (mod === 'crateRain') expect(setup.config?.crateChance).toBe(100);
    }
  });

  it('scores win bonus + HP left − turns used, never negative', () => {
    const s = createMatch(dailySetup(dailySeed('2026-10-06'), ['A', 'B']));
    const hp = s.units.filter((u) => u.team === 0).reduce((n, u) => n + u.hp, 0);
    s.phase = 'over';
    s.winner = 0;
    s.teamTurns[0] = 4;
    expect(dailyScore(s)).toBe(DAILY_WIN_BONUS + hp - 4 * DAILY_TURN_COST);
    s.winner = 1;
    for (const u of s.units) if (u.team === 0) u.alive = false;
    s.teamTurns[0] = 30;
    expect(dailyScore(s)).toBe(0);
  });
});
