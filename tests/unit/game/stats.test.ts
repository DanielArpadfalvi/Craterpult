import { describe, expect, it } from 'vitest';
import { step } from '../../../src/core/match';
import type { MatchEvent, MatchState } from '../../../src/core/types';
import {
  accuracy,
  createStats,
  createTally,
  favouriteWeapon,
  recordMatch,
  sanitizeStats,
  tallyEvents,
  totalPlayed,
} from '../../../src/game/stats';
import { flatMatch } from '../support/flat';

/** Units 0–1 are the player's (team 0), 2–3 the enemy's. */
const UNITS = [{ team: 0 }, { team: 0 }, { team: 1 }, { team: 1 }];

function runUntil(s: MatchState, pred: () => boolean, onTick: () => void, max = 5000): void {
  for (let i = 0; i < max && !pred(); i++) {
    step(s);
    onTick();
  }
}

describe('stats tally', () => {
  it('counts shots, hits, the biggest shot and kills on the player turn', () => {
    const t = createTally(0);
    const ev: MatchEvent[] = [
      { type: 'fired', unit: 0, weapon: 'bazooka' },
      { type: 'damage', unit: 2, amount: 30 },
      { type: 'damage', unit: 3, amount: 25 },
      // Self damage does not count toward the shot.
      { type: 'damage', unit: 1, amount: 10 },
      { type: 'died', unit: 3 },
      { type: 'turnStart', team: 1, unit: 2, wind: 0 },
    ];
    tallyEvents(t, ev, UNITS);
    expect(t).toMatchObject({ shots: 1, hits: 1, bestShot: 55, kills: 1, unitsLost: 0 });
    expect(t.weapons).toEqual({ bazooka: 1 });
  });

  it('a miss counts as a shot without a hit; utility tools are not shots', () => {
    const t = createTally(0);
    tallyEvents(
      t,
      [
        { type: 'fired', unit: 0, weapon: 'teleport' },
        { type: 'fired', unit: 0, weapon: 'grenade' },
        { type: 'explosion', x: 1, y: 1, radius: 30 },
      ],
      UNITS,
    );
    tallyEvents(t, [{ type: 'turnStart', team: 1, unit: 2, wind: 0 }], UNITS);
    expect(t).toMatchObject({ shots: 1, hits: 0, bestShot: 0 });
    expect(t.weapons).toEqual({ teleport: 1, grenade: 1 });
  });

  it('ignores the enemy turn, but counts the player craters lost on it', () => {
    const t = createTally(1);
    tallyEvents(
      t,
      [
        { type: 'fired', unit: 2, weapon: 'bazooka' },
        { type: 'damage', unit: 0, amount: 100 },
        { type: 'damage', unit: 3, amount: 5 },
        { type: 'died', unit: 0 },
        { type: 'drowned', unit: 3 },
      ],
      UNITS,
    );
    expect(t).toMatchObject({ shots: 0, hits: 0, kills: 0, unitsLost: 1 });
  });

  it('each shot of a multi-shot weapon is scored on its own', () => {
    const t = createTally(0);
    tallyEvents(
      t,
      [
        { type: 'fired', unit: 0, weapon: 'shotgun' },
        { type: 'damage', unit: 2, amount: 25 },
        { type: 'fired', unit: 0, weapon: 'shotgun' },
        { type: 'gameOver', winner: 0 },
      ],
      UNITS,
    );
    expect(t).toMatchObject({ shots: 2, hits: 1, bestShot: 25 });
  });

  it('records a real shotgun turn from the simulation', () => {
    const s = flatMatch([[300], [420]]);
    const t = createTally(s.activeTeam);
    const tick = () => tallyEvents(t, s.events, s.units);
    step(s, [{ t: 'fire', weapon: 'shotgun', angle: 0, power: 100 }]);
    tick();
    runUntil(s, () => s.phase === 'aiming', tick);
    step(s, [{ t: 'fire', weapon: 'shotgun', angle: 0, power: 100 }]);
    tick();
    runUntil(s, () => s.activeTeam === 1, tick);
    expect(t).toMatchObject({ shots: 2, hits: 2, bestShot: 25, kills: 0, turnTeam: 1 });
  });
});

describe('lifetime stats', () => {
  it('adds finished matches per mode and tracks the win streak vs bots', () => {
    const s = createStats();
    const tally = () => ({ ...createTally(0), shots: 4, hits: 3, kills: 2, bestShot: 40 });
    recordMatch(s, { mode: 'quick', won: true, vsBot: true, tally: tally() });
    recordMatch(s, { mode: 'campaign', won: true, vsBot: true, tally: tally() });
    expect(s.winStreak).toBe(2);
    // Pass & play does not touch the streak.
    recordMatch(s, { mode: 'hotseat', won: false, vsBot: false, tally: tally() });
    expect(s.winStreak).toBe(2);
    recordMatch(s, { mode: 'daily', won: false, vsBot: true, tally: tally() });
    expect(s.winStreak).toBe(0);
    expect(s.bestWinStreak).toBe(2);
    expect(s.modes.quick).toEqual({ played: 1, won: 1 });
    expect(s.modes.hotseat).toEqual({ played: 1, won: 0 });
    expect(totalPlayed(s)).toEqual({ played: 4, won: 2 });
    expect(s.kills).toBe(8);
    expect(accuracy(s)).toBe(75);
    expect(s.bestShot).toBe(40);
  });

  it('closes a shot still open when the match ends', () => {
    const s = createStats();
    const t = createTally(0);
    tallyEvents(t, [{ type: 'fired', unit: 0, weapon: 'mortar' }], UNITS);
    tallyEvents(t, [{ type: 'damage', unit: 2, amount: 60 }], UNITS);
    recordMatch(s, { mode: 'quick', won: true, vsBot: true, tally: t });
    expect(s).toMatchObject({ shots: 1, hits: 1, bestShot: 60 });
  });

  it('picks the favourite weapon and handles empty stats', () => {
    const s = createStats();
    expect(favouriteWeapon(s)).toBeNull();
    expect(accuracy(s)).toBe(0);
    s.weapons = { grenade: 3, bazooka: 3, mortar: 1 };
    expect(favouriteWeapon(s)).toBe('bazooka');
  });

  it('sanitizes stored stats', () => {
    const s = sanitizeStats({
      modes: { quick: { played: 2, won: 5 }, daily: 'x' },
      kills: -3,
      shots: 2,
      hits: 9,
      weapons: { bazooka: 2, nope: 4, grenade: 0 },
      winStreak: 4,
      bestWinStreak: 1,
    });
    expect(s.modes.quick).toEqual({ played: 2, won: 2 });
    expect(s.modes.daily).toEqual({ played: 0, won: 0 });
    expect(s.kills).toBe(0);
    expect(s.hits).toBe(2);
    expect(s.weapons).toEqual({ bazooka: 2 });
    expect(s.bestWinStreak).toBe(4);
    expect(sanitizeStats(null)).toEqual(createStats());
  });
});
