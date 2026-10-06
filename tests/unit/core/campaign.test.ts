import { describe, expect, it } from 'vitest';
import { BotSearch } from '../../../src/core/ai/bot';
import {
  CHAPTERS,
  chapterMissions,
  missionById,
  missionSetup,
  MISSIONS,
  nextMission,
  scoreMission,
  type Mission,
} from '../../../src/core/campaign';
import { fxFloor } from '../../../src/core/fixed';
import { createMatch, step } from '../../../src/core/match';
import type { MatchState } from '../../../src/core/types';
import { bodyCollides } from '../../../src/core/units';

const NAMES = ['You', 'Bots A', 'Bots B'];

function finished(m: Mission, edit: (s: MatchState) => void): MatchState {
  const s = createMatch(missionSetup(m, NAMES));
  edit(s);
  s.phase = 'over';
  return s;
}

describe('campaign data', () => {
  it('has 30 unique missions, 10 per chapter, with a rising bot curve', () => {
    expect(MISSIONS).toHaveLength(30);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(30);
    expect(new Set(MISSIONS.map((m) => m.seed)).size).toBe(30);
    for (const c of CHAPTERS) {
      const ms = chapterMissions(c);
      expect(ms.map((m) => m.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    expect(MISSIONS[0]!.bot).toBe(1);
    expect(MISSIONS[29]!.bot).toBe(5);
    for (let i = 1; i < MISSIONS.length; i++) {
      expect(MISSIONS[i]!.bot).toBeGreaterThanOrEqual(MISSIONS[i - 1]!.bot);
    }
    expect(missionById('c2-05')?.chapter).toBe(2);
    expect(nextMission('c1-10')?.id).toBe('c2-01');
    expect(nextMission('c3-10')).toBeUndefined();
  });

  it.each(MISSIONS.map((m) => [m.id, m] as const))(
    '%s creates a fair start: everyone on dry land, clear of terrain',
    (_id, m) => {
      const s = createMatch(missionSetup(m, NAMES));
      expect(s.teams).toHaveLength(1 + m.enemies.length);
      expect(s.units.filter((u) => u.team === 0)).toHaveLength(m.player.units);
      expect(s.teams[0]!.bot).toBe(false);
      expect(s.teams.slice(1).every((t) => t.bot)).toBe(true);
      expect(s.activeTeam).toBe(0);
      for (const u of s.units) {
        expect(u.alive).toBe(true);
        expect(u.grounded).toBe(true);
        expect(fxFloor(u.y)).toBeLessThan(s.waterLevel - 20);
        expect(bodyCollides(s.terrain, fxFloor(u.x), fxFloor(u.y))).toBe(false);
      }
      // Everyone stays put through the first settle (no spawn on a crumbling ledge into water).
      const cmds = [{ t: 'skip' as const }];
      step(s, cmds);
      for (let i = 0; i < 700 && s.activeTeam === 0; i++) step(s);
      expect(s.units.every((u) => u.alive)).toBe(true);
    },
  );
});

describe('scoreMission', () => {
  const m = missionById('c1-01')!; // stars: turns <= 5, no losses

  it('gives 0 stars for a loss and 1–3 for a win by the rules', () => {
    const lost = finished(m, (s) => {
      s.winner = 1;
    });
    expect(scoreMission(lost, m)).toBe(0);
    const perfect = finished(m, (s) => {
      s.winner = 0;
      s.teamTurns[0] = 3;
    });
    expect(scoreMission(perfect, m)).toBe(3);
    const slow = finished(m, (s) => {
      s.winner = 0;
      s.teamTurns[0] = 9;
    });
    expect(scoreMission(slow, m)).toBe(2);
    const slowAndHurt = finished(m, (s) => {
      s.winner = 0;
      s.teamTurns[0] = 9;
      const u = s.units.find((x) => x.team === 0)!;
      u.alive = false;
      u.hp = 0;
    });
    expect(scoreMission(slowAndHurt, m)).toBe(1);
  });

  it('checks HP left and single-weapon rules', () => {
    const hp = missionById('c1-02')!; // turns <= 6, hp >= 220
    const low = finished(hp, (s) => {
      s.winner = 0;
      s.teamTurns[0] = 2;
      for (const u of s.units) if (u.team === 0) u.hp = 50;
    });
    expect(scoreMission(low, hp)).toBe(2);
    const only = missionById('c1-05')!; // only bazooka, no losses
    const mixed = finished(only, (s) => {
      s.winner = 0;
      s.teams[0]!.used = ['bazooka', 'grenade'];
    });
    expect(scoreMission(mixed, only)).toBe(2);
    const pure = finished(only, (s) => {
      s.winner = 0;
      s.teams[0]!.used = ['bazooka'];
    });
    expect(scoreMission(pure, only)).toBe(3);
  });

  it('a strong bot on the player side damages the enemy in the opening missions', () => {
    for (const id of ['c1-01', 'c1-02']) {
      const s = createMatch(missionSetup(missionById(id)!, NAMES));
      const enemyHp = () =>
        s.units.filter((u) => u.team !== 0).reduce((n, u) => n + Math.max(0, u.hp), 0);
      const before = enemyHp();
      // Up to two player turns; the enemy just skips.
      for (let turn = 0; turn < 2 && enemyHp() === before; turn++) {
        const cmd = new BotSearch(s, 5).finish();
        step(s, cmd ? [cmd] : [{ t: 'skip' }]);
        for (let i = 0; i < 1500 && s.activeTeam === 0; i++)
          step(s, s.phase === 'aiming' && s.shotsLeft > 0 && cmd ? [cmd] : []);
        for (let i = 0; i < 1500 && s.activeTeam !== 0 && s.phase !== 'over'; i++)
          step(s, s.phase === 'aiming' ? [{ t: 'skip' }] : []);
      }
      expect(enemyHp(), id).toBeLessThan(before);
    }
  }, 20_000);
});
