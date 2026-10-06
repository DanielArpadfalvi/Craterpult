import type { RngState } from './rng';
import type { Rect, Terrain } from './terrain';

export type WeaponId =
  | 'bazooka'
  | 'grenade'
  | 'shotgun'
  | 'cluster'
  | 'bomblet'
  | 'mortar'
  | 'napalm'
  | 'flame'
  | 'homing'
  | 'airstrike'
  | 'missile'
  | 'dynamite'
  | 'mine'
  | 'crawler'
  | 'punch'
  | 'drill'
  | 'girder'
  | 'teleport'
  | 'quake';

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
  /** Ticks until it explodes on its own; -1 = no timer. */
  fuse: number;
  owner: number;
  age: number;
  /** Resting on the ground (dynamite, mines). */
  resting: boolean;
  /** Walker direction (crawler) or 0. */
  dir: -1 | 0 | 1;
  /** Homing target (integer world px). */
  tx: number;
  ty: number;
}

export interface Crate {
  id: number;
  kind: 'health' | 'weapon';
  weapon: WeaponId | null;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
}

export type Phase = 'aiming' | 'firing' | 'retreat' | 'settling' | 'over';

export type Command =
  | { t: 'move'; dir: -1 | 0 | 1 }
  | { t: 'jump' }
  | { t: 'backflip' }
  | {
      t: 'fire';
      weapon: WeaponId;
      /** Deci-degrees (arc / direction weapons). */
      angle?: number;
      /** 0–100 (arc weapons). */
      power?: number;
      /** Seconds (fuse weapons). */
      fuse?: number;
      /** Integer world point (target weapons). */
      tx?: number;
      ty?: number;
    }
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
  | { type: 'teleported'; unit: number }
  | { type: 'girder'; rect: Rect }
  | { type: 'quake' }
  | { type: 'mineTriggered'; projectile: number }
  | { type: 'crateDropped'; crate: number }
  | {
      type: 'crateCollected';
      crate: number;
      unit: number;
      kind: 'health' | 'weapon';
      weapon: WeaponId | null;
    }
  | { type: 'waterRise'; level: number }
  | { type: 'gameOver'; winner: number };

export interface MatchConfig {
  /** Ticks of aiming per turn. */
  turnTicks: number;
  retreatTicks: number;
  unitHp: number;
  /** Chance (0–100) of a crate dropping at each turn start after the first round. */
  crateChance: number;
  /** Turn number from which the water rises every turn (0 = never). */
  suddenDeathTurn: number;
  /** Water rise per turn during sudden death (px). */
  waterRise: number;
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
  crates: Crate[];
  nextCrateId: number;
  phase: Phase;
  activeTeam: number;
  activeUnit: number;
  turnNumber: number;
  /** Turns played per team (index = team id), counting the current one. */
  teamTurns: number[];
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
