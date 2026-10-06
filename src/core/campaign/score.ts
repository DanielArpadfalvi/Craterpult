import type { MatchSetup } from '../match';
import type { MatchState } from '../types';
import type { Mission, SquadSpec, StarRule } from './types';

/** Team 0 is always the player in a mission. */
export const PLAYER_TEAM = 0;

function squad(name: string, spec: SquadSpec, bot: boolean, team: number) {
  return {
    name,
    units: Array.from(
      { length: spec.units },
      (_, i) => `${String.fromCharCode(65 + i)}${team + 1}`,
    ),
    bot,
    ...(spec.hp !== undefined ? { hp: spec.hp } : {}),
    ...(spec.only ? { only: spec.only } : {}),
    ...(spec.ammo ? { ammo: spec.ammo } : {}),
  };
}

/** The match setup of a mission; `names[i]` is team i's display name (player first). */
export function missionSetup(mission: Mission, names: readonly string[]): MatchSetup {
  return {
    seed: mission.seed,
    map: mission.map,
    teams: [
      squad(names[0] ?? 'P', mission.player, false, 0),
      ...mission.enemies.map((e, i) => squad(names[i + 1] ?? `E${i + 1}`, e, true, i + 1)),
    ],
    config: { ...mission.config, endOnTeamLoss: PLAYER_TEAM },
    ...(mission.startWind !== undefined ? { startWind: mission.startWind } : {}),
  };
}

/** Facts about the player's result that star rules look at. */
export interface MissionStats {
  won: boolean;
  /** Player turns played. */
  turns: number;
  unitsLost: number;
  hpLeft: number;
  weaponsUsed: readonly string[];
}

export function missionStats(s: MatchState): MissionStats {
  const mine = s.units.filter((u) => u.team === PLAYER_TEAM);
  return {
    won: s.phase === 'over' && s.winner === PLAYER_TEAM,
    turns: s.teamTurns[PLAYER_TEAM] ?? 0,
    unitsLost: mine.filter((u) => !u.alive || u.hp <= 0).length,
    hpLeft: mine.reduce((n, u) => n + (u.alive ? Math.max(0, u.hp) : 0), 0),
    weaponsUsed: s.teams[PLAYER_TEAM]?.used ?? [],
  };
}

export function ruleMet(rule: StarRule, st: MissionStats): boolean {
  switch (rule.kind) {
    case 'turns':
      return st.turns <= rule.max;
    case 'noLosses':
      return st.unitsLost === 0;
    case 'hpLeft':
      return st.hpLeft >= rule.min;
    case 'onlyWeapon':
      return st.weaponsUsed.every((w) => w === rule.weapon);
  }
}

/** Stars earned in a finished match: 0 = not won, 1 for the win, +1 per bonus rule met. */
export function scoreMission(s: MatchState, mission: Mission): number {
  const st = missionStats(s);
  if (!st.won) return 0;
  return 1 + mission.stars.filter((r) => ruleMet(r, st)).length;
}
