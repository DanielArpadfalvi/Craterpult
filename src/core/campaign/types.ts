import type { Difficulty } from '../ai/bot';
import type { MapOptions } from '../mapgen';
import type { MatchConfig, WeaponId } from '../types';

/** A bonus-star condition (each one met adds a star on top of the win star). */
export type StarRule =
  /** Win using at most `max` of your own turns. */
  | { kind: 'turns'; max: number }
  /** Win without losing a single unit. */
  | { kind: 'noLosses' }
  /** Win with at least `min` total HP left on your team. */
  | { kind: 'hpLeft'; min: number }
  /** Fire nothing but this weapon. */
  | { kind: 'onlyWeapon'; weapon: WeaponId };

/** One side of a mission. */
export interface SquadSpec {
  units: number;
  /** Starting HP per unit (default 100). */
  hp?: number;
  /** Only these weapons are stocked. */
  only?: WeaponId[];
  /** Per-weapon starting rounds (after `only`). */
  ammo?: Partial<Record<WeaponId, number>>;
}

export interface Mission {
  /** Stable id used for saves and i18n keys (`c1-01` … `c3-10`). */
  id: string;
  chapter: 1 | 2 | 3;
  /** 1-based position within the chapter. */
  index: number;
  seed: string;
  map: MapOptions;
  player: SquadSpec;
  /** Every entry is a separate bot team (2+ entries = free-for-all). */
  enemies: SquadSpec[];
  bot: Difficulty;
  config?: Partial<MatchConfig>;
  startWind?: number;
  /** Two bonus-star rules: 1 star for the win, +1 per rule met. */
  stars: [StarRule, StarRule];
}
