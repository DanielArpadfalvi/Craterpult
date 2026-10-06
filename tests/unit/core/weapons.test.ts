import { describe, expect, it } from 'vitest';
import { fxFloor, ONE } from '../../../src/core/fixed';
import { activeUnit, canFire, step } from '../../../src/core/match';
import { MINE_ARM_TICKS } from '../../../src/core/projectiles';
import { AIR, materialAt, METAL } from '../../../src/core/terrain';
import type { Command, MatchEvent, MatchState } from '../../../src/core/types';
import { flatMatch, GROUND_Y } from '../support/flat';

/** Step until `pred` holds; collects every event on the way. */
function run(s: MatchState, pred: () => boolean, max = 3000): MatchEvent[] {
  const all: MatchEvent[] = [];
  for (let i = 0; i < max && !pred(); i++) {
    step(s);
    all.push(...s.events);
  }
  return all;
}

function fire(s: MatchState, c: Omit<Extract<Command, { t: 'fire' }>, 't'>): MatchEvent[] {
  step(s, [{ t: 'fire', ...c }]);
  return [...s.events];
}

const unlockAll = (s: MatchState) => {
  s.teamTurns = s.teamTurns.map(() => 10);
};

describe('weapons', () => {
  it('cluster bomb splits into bomblets that each explode', () => {
    const s = flatMatch([[300], [900]]);
    fire(s, { weapon: 'cluster', angle: 600, power: 45, fuse: 1 });
    const ev = run(s, () => s.phase !== 'firing');
    expect(ev.filter((e) => e.type === 'explosion').length).toBe(6);
    expect(s.teams[0]!.ammo.cluster).toBe(2);
  });

  it('mortar digs a bigger crater than the bazooka', () => {
    const a = flatMatch([[300], [1200]]);
    const b = flatMatch([[300], [1200]]);
    fire(a, { weapon: 'bazooka', angle: 450, power: 50 });
    fire(b, { weapon: 'mortar', angle: 450, power: 70 });
    const ea = run(a, () => a.phase !== 'firing').find((e) => e.type === 'explosion');
    const eb = run(b, () => b.phase !== 'firing').find((e) => e.type === 'explosion');
    expect(
      eb && eb.type === 'explosion' && ea && ea.type === 'explosion' && eb.radius > ea.radius,
    ).toBe(true);
  });

  it('napalm rains flames', () => {
    const s = flatMatch([[300], [900]]);
    fire(s, { weapon: 'napalm', angle: 600, power: 50 });
    const ev = run(s, () => s.phase !== 'firing');
    expect(ev.filter((e) => e.type === 'explosion').length).toBeGreaterThanOrEqual(8);
  });

  it('the seeker steers onto its target', () => {
    const s = flatMatch([[300], [700]]);
    unlockAll(s);
    const target = s.units[1]!;
    fire(s, { weapon: 'homing', tx: 700, ty: GROUND_Y - 6 });
    run(s, () => s.phase !== 'firing');
    expect(target.hp).toBeLessThan(80);
  });

  it('air strike drops five missiles around the target', () => {
    const s = flatMatch([[300], [800]]);
    unlockAll(s);
    fire(s, { weapon: 'airstrike', tx: 800, ty: 0 });
    expect(s.projectiles.filter((p) => p.weapon === 'missile').length).toBe(5);
    const ev = run(s, () => s.phase !== 'firing');
    const blasts = ev.filter((e) => e.type === 'explosion');
    expect(blasts.length).toBe(5);
    for (const b of blasts)
      if (b.type === 'explosion') expect(Math.abs(b.x - 800)).toBeLessThan(70);
    expect(s.units[1]!.hp).toBeLessThan(100);
  });

  it('dynamite rests on the ground and explodes after five seconds', () => {
    const s = flatMatch([[300], [900]]);
    const u = activeUnit(s)!;
    fire(s, { weapon: 'dynamite' });
    let at = -1;
    run(s, () => {
      if (s.events.some((e) => e.type === 'explosion')) at = s.tick;
      return at > 0;
    });
    expect(at).toBe(1 + 5 * 60 - 1);
    expect(u.hp).toBeLessThan(100); // the thrower stood still next to it
  });

  it('a mine arms first, then goes off when a unit is near', () => {
    const s = flatMatch([[300], [335]], { config: { turnTicks: 20 * 60 } });
    activeUnit(s)!.facing = 1;
    fire(s, { weapon: 'mine' });
    const mine = s.projectiles[0]!;
    let triggeredAt = -1;
    run(s, () => {
      if (s.events.some((e) => e.type === 'mineTriggered')) triggeredAt = mine.age;
      return triggeredAt > 0;
    });
    expect(triggeredAt).toBe(MINE_ARM_TICKS);
    run(s, () => s.events.some((e) => e.type === 'explosion'));
    expect(s.units[1]!.hp).toBeLessThan(100);
  });

  it('an idle mine does not hold up the turn', () => {
    const s = flatMatch([[300], [900]]);
    const u = activeUnit(s)!;
    u.facing = -1;
    fire(s, { weapon: 'mine' });
    // Move the thrower away before the mine arms.
    u.x = 600 * ONE;
    run(s, () => s.activeTeam === 1 && s.phase === 'aiming');
    expect(s.projectiles.some((p) => p.weapon === 'mine')).toBe(true);
  });

  it('the crawler walks toward the enemy and blows up', () => {
    const s = flatMatch([[300], [420]]);
    unlockAll(s);
    activeUnit(s)!.facing = 1;
    fire(s, { weapon: 'crawler' });
    run(s, () => s.projectiles.length === 0 || s.events.some((e) => e.type === 'explosion'));
    expect(s.units[1]!.hp).toBeLessThan(60);
  });

  it('punch launches the unit in front', () => {
    const s = flatMatch([[300], [312]]);
    const target = s.units[1]!;
    fire(s, { weapon: 'punch' });
    expect(target.hp).toBe(70);
    expect(target.grounded).toBe(false);
    expect(target.vx).toBeGreaterThan(0);
  });

  it('drill bores a tunnel', () => {
    const s = flatMatch([[300], [900]]);
    fire(s, { weapon: 'drill', angle: 3150 }); // down-right
    expect(materialAt(s.terrain, 330, GROUND_Y + 25)).toBe(AIR);
  });

  it('girder places metal, but not on top of units', () => {
    const s = flatMatch([[300], [900]]);
    fire(s, { weapon: 'girder', tx: 300, ty: GROUND_Y - 8 });
    expect(s.phase).toBe('aiming');
    expect(s.teams[0]!.ammo.girder).toBe(2);
    fire(s, { weapon: 'girder', tx: 500, ty: 400, angle: 0 });
    expect(materialAt(s.terrain, 500, 400)).toBe(METAL);
    expect(materialAt(s.terrain, 530, 400)).toBe(METAL);
    expect(s.teams[0]!.ammo.girder).toBe(1);
  });

  it('teleport moves the unit and ends the turn without retreat', () => {
    const s = flatMatch([[300], [900]]);
    const u = activeUnit(s)!;
    fire(s, { weapon: 'teleport', tx: 1200, ty: 300 });
    expect(fxFloor(u.x)).toBe(1200);
    expect(s.phase).toBe('settling');
    run(s, () => u.grounded);
    expect(fxFloor(u.y)).toBe(GROUND_Y - 1);
    // Into solid ground is refused.
    const s2 = flatMatch([[300], [900]]);
    fire(s2, { weapon: 'teleport', tx: 600, ty: GROUND_Y + 50 });
    expect(s2.phase).toBe('aiming');
  });

  it('earthquake hurts and shakes everyone', () => {
    const s = flatMatch([[300], [900]]);
    unlockAll(s);
    fire(s, { weapon: 'quake' });
    expect(s.units.every((u) => u.hp === 90 && !u.grounded)).toBe(true);
  });

  it('late weapons are locked early and limited ammo runs out', () => {
    const s = flatMatch([[300], [900]]);
    expect(canFire(s, 'airstrike')).toBe(false);
    expect(canFire(s, 'bazooka')).toBe(true);
    s.teams[0]!.ammo.dynamite = 0;
    expect(canFire(s, 'dynamite')).toBe(false);
  });
});

describe('crates and sudden death', () => {
  it('a health crate falls and heals the unit that touches it', () => {
    const s = flatMatch([[300], [900]], { config: { turnTicks: 60 * 60 } });
    const u = activeUnit(s)!;
    u.hp = 50;
    s.crates.push({
      id: 1,
      kind: 'health',
      weapon: null,
      x: 330 * ONE,
      y: 100 * ONE,
      vy: 0,
      grounded: false,
    });
    run(s, () => s.crates[0]?.grounded === true);
    step(s, [{ t: 'move', dir: 1 }]);
    const ev = run(s, () => s.crates.length === 0, 600);
    expect(ev.some((e) => e.type === 'crateCollected')).toBe(true);
    expect(u.hp).toBe(75);
  });

  it('a weapon crate adds a round', () => {
    const s = flatMatch([[300], [900]]);
    s.crates.push({
      id: 1,
      kind: 'weapon',
      weapon: 'mortar',
      x: 300 * ONE,
      y: 300 * ONE,
      vy: 0,
      grounded: false,
    });
    run(s, () => s.crates.length === 0, 600);
    expect(s.teams[0]!.ammo.mortar).toBe(3);
  });

  it('the water rises every turn once sudden death starts', () => {
    const s = flatMatch([[300], [900]], {
      config: { suddenDeathTurn: 1, waterRise: 20, turnTicks: 30 },
    });
    const before = s.waterLevel;
    const ev = run(s, () => s.activeTeam === 1 && s.phase === 'aiming');
    expect(ev.some((e) => e.type === 'waterRise')).toBe(true);
    expect(s.waterLevel).toBe(before - 20);
  });

  it('rising water drowns units standing still on the ground (regression: stalemates)', () => {
    const s = flatMatch([[300], [900]], {
      config: { suddenDeathTurn: 1, waterRise: 20, turnTicks: 30 },
    });
    expect(s.units.every((u) => u.grounded)).toBe(true);
    // Water just below the feet: the next rise covers the units' middles.
    s.waterLevel = GROUND_Y + 2;
    const ev = run(s, () => s.phase === 'over', 600);
    expect(ev.filter((e) => e.type === 'drowned')).toHaveLength(2);
    expect(s.units.every((u) => !u.alive)).toBe(true);
  });
});
