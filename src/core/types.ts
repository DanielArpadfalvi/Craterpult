import type { RngState } from './rng';
import type { Rect, Terrain } from './terrain';

export type WeaponId = 'bazooka' | 'grenade' | 'shotgun';

export interface Unit {
  id: number;
  team: number;
  name: string;
  /** Feet position (fixed point): x is the body center, y the lowest body pixel row. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  hp: number;
  alive: boolean;
  /** -1 left, 1 right. */
  facing: -1 | 1;
  /** Damage taken since the start of the current turn (shown when the turn settles). */
  pendingDamage: number;
}

export interface Team {
  id: number;
  name: string;
  /** Rounds left per weapon; -1 = unlimited. */
  ammo: Record<WeaponId, number>;
  /** Index into this team's units of the unit that plays next. */
  nextUnit: number;
  /** True when a bot plays this team (the sim itself treats every team alike). */
  bot: boolean;
}

export interface Projectile {
  id: number;
  weapon: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks until it explodes on its own; -1 = impact fuse. */
  fuse: number;
  owner: number;
  age: number;
}

export type Phase = 'aiming' | 'firing' | 'retreat' | 'settling' | 'over';

export type Command =
  | { t: 'move'; dir: -1 | 0 | 1 }
  | { t: 'jump' }
  | { t: 'backflip' }
  | { t: 'fire'; weapon: WeaponId; angle: number; power: number; fuse?: number }
  | { t: 'skip' };

export type MatchEvent =
  | { type: 'turnStart'; team: number; unit: number; wind: number }
  | { type: 'fired'; unit: number; weapon: WeaponId }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'carved'; rect: Rect }
  | { type: 'damage'; unit: number; amount: number }
  | { type: 'bounce'; projectile: number }
  | { type: 'shot'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'jumped'; unit: number }
  | { type: 'landed'; unit: number; damage: number }
  | { type: 'splash'; x: number }
  | { type: 'drowned'; unit: number }
  | { type: 'died'; unit: number }
  | { type: 'gameOver'; winner: number };

export interface MatchConfig {
  /** Ticks of aiming per turn. */
  turnTicks: number;
  retreatTicks: number;
  unitHp: number;
}

export interface MatchState {
  seed: string;
  config: MatchConfig;
  tick: number;
  rng: RngState;
  terrain: Terrain;
  /** World y (pixels) of the water surface; anything below drowns. */
  waterLevel: number;
  /** Wind strength −10…10 (integer). */
  wind: number;
  teams: Team[];
  units: Unit[];
  projectiles: Projectile[];
  nextProjectileId: number;
  phase: Phase;
  activeTeam: number;
  activeUnit: number;
  turnNumber: number;
  /** Aiming ticks left in this turn. */
  turnTicksLeft: number;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  /** Shots left for multi-shot weapons in this turn. */
  shotsLeft: number;
  /** Weapon fired this turn (follow-up shots must use the same one). */
  turnWeapon: WeaponId | null;
  /** Held horizontal input of the active unit. */
  moveDir: -1 | 0 | 1;
  /** Winning team id, -1 for a draw, null while playing. */
  winner: number | null;
  /** Events of the last step (cleared at the start of each step). */
  events: MatchEvent[];
}
