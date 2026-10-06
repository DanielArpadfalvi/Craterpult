import { ONE } from '../../../src/core/fixed';
import { createMatch, type MatchSetup } from '../../../src/core/match';
import { createTerrain, fillRect, SOIL } from '../../../src/core/terrain';
import type { MatchState } from '../../../src/core/types';

export const GROUND_Y = 500;

/**
 * A two-team match on flat ground (top at GROUND_Y) with units placed at the given x positions
 * (team 0 first). Wind is zeroed; team 0's first unit is active.
 */
export function flatMatch(xs: number[][], setup: Partial<MatchSetup> = {}): MatchState {
  const s = createMatch({
    seed: 'flat',
    teams: xs.map((units, i) => ({ name: `T${i}`, units: units.map((_, j) => `u${i}${j}`) })),
    ...setup,
  });
  const t = createTerrain(s.terrain.width, s.terrain.height);
  fillRect(t, 0, GROUND_Y, t.width, t.height - GROUND_Y, SOIL);
  s.terrain = t;
  let id = 0;
  xs.forEach((units, team) =>
    units.forEach((x) => {
      const u = s.units[id++]!;
      u.team = team;
      u.x = x * ONE + (ONE >> 1);
      u.y = (GROUND_Y - 1) * ONE;
      u.vx = 0;
      u.vy = 0;
      u.grounded = true;
      u.facing = 1;
    }),
  );
  s.wind = 0;
  s.activeTeam = 0;
  s.activeUnit = s.units.find((u) => u.team === 0)!.id;
  return s;
}
