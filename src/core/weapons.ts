import type { WeaponId } from './types';

export interface WeaponDef {
  id: WeaponId;
  kind: 'projectile' | 'hitscan';
  /** Pushed sideways by the wind. */
  wind: boolean;
  /** Bounces off terrain instead of exploding on impact. */
  bounces: boolean;
  /** Player-set fuse in seconds (bouncing weapons). */
  fuse: boolean;
  /** Shots per turn. */
  shots: number;
  blastRadius: number;
  damage: number;
  /** Knockback speed at the blast center (px/tick). */
  knockback: number;
  /** Hitscan range (px). */
  range: number;
  /** Starting rounds per team; -1 = unlimited. */
  ammo: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bazooka: {
    id: 'bazooka',
    kind: 'projectile',
    wind: true,
    bounces: false,
    fuse: false,
    shots: 1,
    blastRadius: 34,
    damage: 48,
    knockback: 7,
    range: 0,
    ammo: -1,
  },
  grenade: {
    id: 'grenade',
    kind: 'projectile',
    wind: false,
    bounces: true,
    fuse: true,
    shots: 1,
    blastRadius: 34,
    damage: 48,
    knockback: 7,
    range: 0,
    ammo: -1,
  },
  shotgun: {
    id: 'shotgun',
    kind: 'hitscan',
    wind: false,
    bounces: false,
    fuse: false,
    shots: 2,
    blastRadius: 10,
    damage: 25,
    knockback: 3,
    range: 700,
    ammo: -1,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const DEFAULT_FUSE_SECONDS = 3;
