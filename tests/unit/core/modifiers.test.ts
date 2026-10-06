import { describe, expect, it } from 'vitest';
import { MAX_HP } from '../../../src/core/crates';
import { ONE } from '../../../src/core/fixed';
import { createMatch, step, teamAmmo } from '../../../src/core/match';
import { stepCrates } from '../../../src/core/crates';
import type { MatchState } from '../../../src/core/types';
import { flatMatch } from '../support/flat';

const TEAMS = [
  { name: 'A', units: ['a1', 'a2'] },
  { name: 'B', units: ['b1', 'b2'] },
];

/** Fire a bazooka straight up and return the apex height (px above the muzzle). */
function apex(s: MatchState): number {
  step(s, [{ t: 'fire', weapon: 'bazooka', angle: 900, power: 60 }]);
  const p = s.projectiles[0]!;
  const y0 = p.y;
  let top = y0;
  for (let i = 0; i < 400 && s.projectiles.length; i++) {
    top = Math.min(top, s.projectiles[0]!.y);
    step(s);
  }
  return (y0 - top) / ONE;
}

describe('physics modifiers', () => {
  it('lower gravity throws higher, higher gravity lower; default unchanged', () => {
    const normal = apex(flatMatch([[300], [900]]));
    const low = apex(flatMatch([[300], [900]], { config: { gravityPct: 50 } }));
    const high = apex(flatMatch([[300], [900]], { config: { gravityPct: 150 } }));
    expect(low).toBeGreaterThan(normal * 1.6);
    expect(high).toBeLessThan(normal * 0.8);
  });

  it('wind scale multiplies the drift and windEnabled:false keeps it calm', () => {
    const drift = (windScale: number): number => {
      const s = flatMatch([[300], [900]], { config: { windScale } });
      s.wind = 10;
      step(s, [{ t: 'fire', weapon: 'bazooka', angle: 900, power: 50 }]);
      const x0 = s.projectiles[0]!.x;
      for (let i = 0; i < 40; i++) step(s);
      return (s.projectiles[0]!.x - x0) / ONE;
    };
    expect(drift(200)).toBeGreaterThan(drift(100) * 1.8);
    const calm = createMatch({ seed: 'calm', teams: TEAMS, config: { windEnabled: false } });
    for (let i = 0; i < 6; i++) {
      expect(calm.wind).toBe(0);
      step(calm, [{ t: 'skip' }]);
      for (let k = 0; k < 800 && calm.phase !== 'aiming'; k++) step(calm);
    }
  });

  it('a start wind overrides only the first turn', () => {
    const s = createMatch({ seed: 'w', teams: TEAMS, startWind: -7 });
    expect(s.wind).toBe(-7);
    expect(createMatch({ seed: 'w', teams: TEAMS, startWind: 99 }).wind).toBe(10);
  });

  it('per-team HP, unit count and arsenal', () => {
    const s = createMatch({
      seed: 'teams',
      teams: [
        { name: 'A', units: ['a', 'b', 'c', 'd'], only: ['grenade'], ammo: { mine: 2 } },
        { name: 'B', units: ['x'], hp: 200, bot: true },
      ],
    });
    expect(s.units.filter((u) => u.team === 0)).toHaveLength(4);
    const champ = s.units.find((u) => u.team === 1)!;
    expect(champ.hp).toBe(200);
    expect(champ.maxHp).toBe(200);
    expect(s.teams[0]!.ammo.bazooka).toBe(0);
    expect(s.teams[0]!.ammo.grenade).toBe(-1);
    expect(s.teams[0]!.ammo.mine).toBe(2);
    expect(s.teams[1]!.ammo.bazooka).toBe(-1);
    expect(s.teams[1]!.bot).toBe(true);
    expect(teamAmmo({ name: 'x', units: [] }).cluster).toBe(3);
  });

  it('records the weapons each team fired without leaking through shallow clones', () => {
    const s = flatMatch([[300], [900]]);
    const clone = { ...s, teams: s.teams.map((t) => ({ ...t })) };
    step(clone, [{ t: 'fire', weapon: 'grenade', angle: 450, power: 40 }]);
    expect(clone.teams[0]!.used).toEqual(['grenade']);
    expect(s.teams[0]!.used).toEqual([]);
  });

  it('a health crate never lowers a champion below its HP (regression)', () => {
    const s = flatMatch([[300], [900]]);
    const u = s.units[0]!;
    u.hp = 190;
    u.maxHp = 200;
    s.crates.push({
      id: 1,
      kind: 'health',
      weapon: null,
      x: u.x,
      y: u.y,
      vy: 0,
      grounded: true,
    });
    stepCrates(s);
    expect(u.hp).toBe(200);
    expect(MAX_HP).toBeLessThan(200);
  });
});

describe('endOnTeamLoss', () => {
  it('ends a free-for-all as soon as the focus team is wiped out', () => {
    const run = (endOnTeamLoss: number): MatchState => {
      const s = flatMatch([[200], [500], [800]], { config: { endOnTeamLoss } });
      s.units[0]!.hp = 0;
      step(s, [{ t: 'skip' }]);
      for (let i = 0; i < 800 && s.activeTeam === 0 && s.phase !== 'over'; i++) step(s);
      return s;
    };
    const ended = run(0);
    expect(ended.phase).toBe('over');
    expect(ended.winner).toBe(-1);
    const goesOn = run(-1);
    expect(goesOn.phase).toBe('aiming');
    expect(goesOn.activeTeam).toBe(1);
  });
});
