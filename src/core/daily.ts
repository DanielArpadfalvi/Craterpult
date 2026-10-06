import type { Difficulty } from './ai/bot';
import { missionStats } from './campaign/score';
import type { MatchSetup, TeamSetup } from './match';
import { MAP_STYLES, type MapStyle } from './mapgen';
import { createRng, pick } from './rng';
import type { MatchConfig, MatchState } from './types';

/** One rule twist per day, chosen from the date seed. */
export type DailyModifier = 'lowGravity' | 'hurricane' | 'grenadesOnly' | 'champions' | 'crateRain';

export const DAILY_MODIFIERS: DailyModifier[] = [
  'lowGravity',
  'hurricane',
  'grenadesOnly',
  'champions',
  'crateRain',
];

export const DAILY_BOT: Difficulty = 3;
export const DAILY_WIN_BONUS = 1000;
export const DAILY_TURN_COST = 10;

/** Core seed of a daily challenge; `dateKey` (`YYYY-MM-DD`) is computed by the game layer. */
export function dailySeed(dateKey: string): string {
  return `daily:${dateKey}`;
}

export interface DailyPlan {
  seed: string;
  modifier: DailyModifier;
  style: MapStyle;
}

export function dailyPlan(seed: string): DailyPlan {
  const rng = createRng(`plan:${seed}`);
  const modifier = pick(rng, DAILY_MODIFIERS);
  const style = pick(rng, MAP_STYLES);
  return { seed, modifier, style };
}

/** The match of the day: you (team 0) against one medium bot team, plus the modifier. */
export function dailySetup(seed: string, names: readonly string[]): MatchSetup {
  const plan = dailyPlan(seed);
  const config: Partial<MatchConfig> = { endOnTeamLoss: 0 };
  let units = 3;
  const extra: Partial<TeamSetup> = {};
  switch (plan.modifier) {
    case 'lowGravity':
      config.gravityPct = 55;
      break;
    case 'hurricane':
      config.windScale = 260;
      break;
    case 'grenadesOnly':
      extra.only = ['grenade'];
      config.crateChance = 0;
      break;
    case 'champions':
      units = 1;
      extra.hp = 200;
      break;
    case 'crateRain':
      config.crateChance = 100;
      break;
  }
  const team = (i: number): TeamSetup => ({
    name: names[i] ?? `T${i}`,
    units: Array.from({ length: units }, (_, k) => `${String.fromCharCode(65 + k)}${i + 1}`),
    bot: i === 1,
    ...extra,
  });
  return {
    seed,
    teams: [team(0), team(1)],
    config,
    map: { width: 1600, height: 900, waterLevel: 860, style: plan.style },
  };
}

/** Score of a finished daily match: win bonus + HP left − turns used (never below 0). */
export function dailyScore(s: MatchState): number {
  const st = missionStats(s);
  return Math.max(0, (st.won ? DAILY_WIN_BONUS : 0) + st.hpLeft - DAILY_TURN_COST * st.turns);
}
