import { describe, expect, it } from 'vitest';
import { fxFloor } from '../../../src/core/fixed';
import { activeUnit, canFire, createMatch, step } from '../../../src/core/match';
import { createRecorder, hashState, replay, stepLogged } from '../../../src/core/replay';
import { SETTLE_MAX_TICKS, UNIT_HALF_WIDTH } from '../../../src/core/constants';
import { AIR, fillRect, isSolid } from '../../../src/core/terrain';
import type { Command, MatchState } from '../../../src/core/types';
import { flatMatch, GROUND_Y } from '../support/flat';

const TEAMS = [
  { name: 'A', units: ['a1', 'a2', 'a3'] },
  { name: 'B', units: ['b1', 'b2', 'b3'] },
];

function runUntil(s: MatchState, pred: () => boolean, max = 5000): void {
  for (let i = 0; i < max && !pred(); i++) step(s);
}

describe('createMatch', () => {
  it('places every unit on dry ground and starts team 0', () => {
    const s = createMatch({ seed: 'spawn', teams: TEAMS });
    expect(s.phase).toBe('aiming');
    expect(s.activeTeam).toBe(0);
    expect(activeUnit(s)?.team).toBe(0);
    for (const u of s.units) {
      expect(u.alive).toBe(true);
      expect(u.grounded).toBe(true);
      expect(fxFloor(u.y)).toBeLessThan(s.waterLevel);
      expect(isSolid(s.terrain, fxFloor(u.x), fxFloor(u.y))).toBe(false);
    }
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = createMatch({ seed: 'same', teams: TEAMS });
    const b = createMatch({ seed: 'same', teams: TEAMS });
    const c = createMatch({ seed: 'other', teams: TEAMS });
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(c));
  });
});

describe('turns', () => {
  it('walks, jumps and hands the turn over when the timer runs out', () => {
    const s = flatMatch([[200], [600]], { config: { turnTicks: 120 } });
    const u = activeUnit(s)!;
    const x0 = u.x;
    step(s, [{ t: 'move', dir: 1 }]);
    runUntil(s, () => s.tick >= 30);
    expect(u.x).toBeGreaterThan(x0);
    step(s, [{ t: 'move', dir: 0 }, { t: 'jump' }]);
    expect(u.grounded).toBe(false);
    runUntil(s, () => u.grounded);
    expect(fxFloor(u.y)).toBe(GROUND_Y - 1);
    runUntil(s, () => s.activeTeam === 1);
    expect(s.phase).toBe('aiming');
    expect(activeUnit(s)?.team).toBe(1);
  });

  it('a bazooka shot damages and knocks back the target, then the other team plays', () => {
    const s = flatMatch([[300], [500]]);
    const target = s.units[1]!;
    // Flat shot at the target (40 % power, slightly upward).
    step(s, [{ t: 'fire', weapon: 'bazooka', angle: 100, power: 60 }]);
    expect(s.phase).toBe('firing');
    let exploded = false;
    runUntil(s, () => {
      if (s.events.some((e) => e.type === 'explosion')) exploded = true;
      return s.activeTeam === 1 && s.phase === 'aiming';
    });
    expect(exploded).toBe(true);
    expect(target.hp).toBeLessThan(100);
    expect(target.hp).toBeGreaterThan(0);
    expect(activeUnit(s)?.id).toBe(target.id);
  });

  it('the shotgun fires twice per turn and only the same weapon may follow up', () => {
    const s = flatMatch([[300], [420]]);
    step(s, [{ t: 'fire', weapon: 'shotgun', angle: 0, power: 100 }]);
    runUntil(s, () => s.phase === 'aiming');
    expect(s.activeTeam).toBe(0);
    expect(canFire(s, 'bazooka')).toBe(false);
    expect(canFire(s, 'shotgun')).toBe(true);
    step(s, [{ t: 'fire', weapon: 'shotgun', angle: 0, power: 100 }]);
    runUntil(s, () => s.phase === 'retreat');
    expect(s.units[1]!.hp).toBe(100 - 2 * 25);
  });

  it('a bot team skips the retreat wait after its shot', () => {
    const s = flatMatch([[300], [500]], {
      teams: [
        { name: 'T0', units: ['u00'], bot: true },
        { name: 'T1', units: ['u10'] },
      ],
    });
    step(s, [{ t: 'fire', weapon: 'bazooka', angle: 100, power: 60 }]);
    const phases = new Set<string>();
    runUntil(s, () => {
      phases.add(s.phase);
      return s.activeTeam === 1;
    });
    expect(phases.has('retreat')).toBe(false);
  });

  it('a unit resting only on its outermost column settles (regression: 10 s turn ends)', () => {
    const s = flatMatch([[300], [900]], { config: { turnTicks: 30 } });
    const u = activeUnit(s)!;
    // Dig away the ground under the unit except one pixel column under its right edge.
    const px = fxFloor(u.x);
    const left = px - UNIT_HALF_WIDTH - 2;
    fillRect(s.terrain, left, GROUND_Y, px + UNIT_HALF_WIDTH - left, 40, AIR);
    step(s);
    expect(u.grounded).toBe(true);
    let settlingTicks = 0;
    runUntil(s, () => {
      if (s.phase === 'settling') settlingTicks++;
      return s.activeTeam === 1;
    });
    expect(settlingTicks).toBeLessThan(SETTLE_MAX_TICKS / 2);
  });

  it('a grenade bounces and explodes after its fuse', () => {
    const s = flatMatch([[300], [700]]);
    step(s, [{ t: 'fire', weapon: 'grenade', angle: 450, power: 40, fuse: 2 }]);
    let explodedAt = -1;
    let bounced = false;
    runUntil(s, () => {
      if (s.events.some((e) => e.type === 'bounce')) bounced = true;
      if (s.events.some((e) => e.type === 'explosion')) explodedAt = s.tick;
      return explodedAt > 0;
    });
    expect(bounced).toBe(true);
    // Fired on tick 1 (the fuse already burns that tick): two seconds later.
    expect(explodedAt).toBe(120);
  });

  it('units knocked into the water drown and the last team standing wins', () => {
    const s = flatMatch([[300], [500]]);
    const target = s.units[1]!;
    target.hp = 10;
    step(s, [{ t: 'fire', weapon: 'bazooka', angle: 100, power: 60 }]);
    runUntil(s, () => s.phase === 'over');
    expect(s.phase).toBe('over');
    expect(target.alive).toBe(false);
    expect(s.winner).toBe(0);
  });

  it('falling far hurts and ends the turn', () => {
    const s = flatMatch([[300], [900]]);
    const u = activeUnit(s)!;
    u.y = (GROUND_Y - 260) * 65536;
    u.grounded = false;
    runUntil(s, () => u.grounded);
    expect(u.hp).toBeLessThan(100);
    step(s);
    expect(s.phase).toBe('settling');
  });
});

describe('replay', () => {
  it('reproduces the exact state from setup + command log', () => {
    const setup = { seed: 'replay-1', teams: TEAMS };
    const s = createMatch(setup);
    const rec = createRecorder(setup);
    const script: Record<number, Command[]> = {
      1: [{ t: 'move', dir: 1 }],
      20: [{ t: 'move', dir: 0 }],
      25: [{ t: 'jump' }],
      90: [{ t: 'fire', weapon: 'grenade', angle: 600, power: 55, fuse: 3 }],
    };
    for (let i = 1; i <= 900; i++) {
      stepLogged(s, rec, script[i] ?? []);
      // Second team: bazooka as soon as it is their turn.
      if (s.activeTeam === 1 && s.phase === 'aiming' && s.phaseTicks === 10) {
        stepLogged(s, rec, [{ t: 'fire', weapon: 'bazooka', angle: 1300, power: 70 }]);
      }
    }
    const again = replay(setup, rec.log, s.tick);
    expect(again.tick).toBe(s.tick);
    expect(hashState(again)).toBe(hashState(s));
  });
});
