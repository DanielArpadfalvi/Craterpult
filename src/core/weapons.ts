import type { WeaponId } from './types';

/**
 * How a weapon is aimed in the UI and what the fire command carries:
 * - `arc`: slingshot angle + power (projectiles)
 * - `direction`: slingshot angle only (power ignored)
 * - `target`: a world point
 * - `place`: no aiming; uses the unit's facing
 */
export type AimKind = 'arc' | 'direction' | 'target' | 'place';

/** What a projectile does in flight. */
export type Flight = 'impact' | 'bounce' | 'rest' | 'walker' | 'homing';

export interface WeaponDef {
  id: WeaponId;
  aim: AimKind;
  /** Projectile behavior (projectile weapons only). */
  flight?: Flight;
  /** Pushed sideways by the wind. */
  wind: boolean;
  /** Player-set fuse in seconds. */
  fuse: boolean;
  /** Fixed fuse in ticks (dynamite, crawler, mines once triggered); -1 = none. */
  fixedFuse: number;
  /** Shots per turn. */
  shots: number;
  blastRadius: number;
  damage: number;
  /** Knockback speed at the blast center (px/tick). */
  knockback: number;
  /** Hitscan / melee / tunnel range (px). */
  range: number;
  /** Launch speed scale in percent of the maximum (arc weapons). */
  speedPct: number;
  /** Gravity scale in percent. */
  gravityPct: number;
  /** On explosion, split into this many fragments of `fragment`. */
  fragments: number;
  fragment?: WeaponId;
  /** Starting rounds per team; -1 = unlimited. */
  ammo: number;
  /** First team turn (1-based, per team) on which the weapon can be used. */
  fromTurn: number;
  /** Ends the turn without retreat time (teleport). */
  noRetreat: boolean;
  /** Can be found in crates. */
  inCrates: boolean;
}

const BASE: Omit<WeaponDef, 'id' | 'aim'> = {
  wind: false,
  fuse: false,
  fixedFuse: -1,
  shots: 1,
  blastRadius: 0,
  damage: 0,
  knockback: 0,
  range: 0,
  speedPct: 100,
  gravityPct: 100,
  fragments: 0,
  ammo: -1,
  fromTurn: 1,
  noRetreat: false,
  inCrates: false,
};

function def(id: WeaponId, aim: AimKind, rest: Partial<WeaponDef>): WeaponDef {
  return { ...BASE, id, aim, ...rest };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bazooka: def('bazooka', 'arc', {
    flight: 'impact',
    wind: true,
    blastRadius: 34,
    damage: 48,
    knockback: 7,
  }),
  grenade: def('grenade', 'arc', {
    flight: 'bounce',
    fuse: true,
    blastRadius: 34,
    damage: 48,
    knockback: 7,
    speedPct: 90,
  }),
  shotgun: def('shotgun', 'direction', {
    shots: 2,
    blastRadius: 10,
    damage: 25,
    knockback: 3,
    range: 700,
  }),
  cluster: def('cluster', 'arc', {
    flight: 'bounce',
    fuse: true,
    blastRadius: 22,
    damage: 25,
    knockback: 5,
    speedPct: 90,
    fragments: 5,
    fragment: 'bomblet',
    ammo: 3,
    inCrates: true,
  }),
  bomblet: def('bomblet', 'arc', {
    flight: 'impact',
    blastRadius: 18,
    damage: 22,
    knockback: 4,
    ammo: 0,
  }),
  mortar: def('mortar', 'arc', {
    flight: 'impact',
    wind: true,
    blastRadius: 48,
    damage: 60,
    knockback: 8,
    speedPct: 70,
    gravityPct: 130,
    ammo: 2,
    inCrates: true,
  }),
  napalm: def('napalm', 'arc', {
    flight: 'impact',
    wind: true,
    blastRadius: 14,
    damage: 12,
    knockback: 2,
    fragments: 9,
    fragment: 'flame',
    ammo: 1,
    inCrates: true,
  }),
  flame: def('flame', 'arc', {
    flight: 'impact',
    wind: true,
    blastRadius: 8,
    damage: 7,
    knockback: 1,
    gravityPct: 60,
    ammo: 0,
  }),
  homing: def('homing', 'target', {
    flight: 'homing',
    blastRadius: 36,
    damage: 50,
    knockback: 7,
    ammo: 1,
    fromTurn: 3,
    inCrates: true,
  }),
  airstrike: def('airstrike', 'target', {
    blastRadius: 26,
    damage: 30,
    knockback: 5,
    fragments: 5,
    fragment: 'missile',
    ammo: 1,
    fromTurn: 3,
    inCrates: true,
  }),
  missile: def('missile', 'arc', {
    flight: 'impact',
    blastRadius: 26,
    damage: 30,
    knockback: 5,
    ammo: 0,
  }),
  dynamite: def('dynamite', 'place', {
    flight: 'rest',
    fixedFuse: 5 * 60,
    blastRadius: 60,
    damage: 75,
    knockback: 9,
    ammo: 1,
    inCrates: true,
  }),
  mine: def('mine', 'place', {
    flight: 'rest',
    blastRadius: 32,
    damage: 45,
    knockback: 7,
    ammo: 2,
    inCrates: true,
  }),
  crawler: def('crawler', 'place', {
    flight: 'walker',
    fixedFuse: 7 * 60,
    blastRadius: 50,
    damage: 70,
    knockback: 8,
    ammo: 1,
    fromTurn: 2,
    inCrates: true,
  }),
  punch: def('punch', 'place', {
    damage: 30,
    knockback: 8,
    range: 16,
  }),
  drill: def('drill', 'direction', {
    blastRadius: 9,
    range: 90,
    ammo: 2,
    inCrates: true,
  }),
  girder: def('girder', 'target', {
    range: 72,
    ammo: 2,
    inCrates: true,
  }),
  teleport: def('teleport', 'target', {
    ammo: 2,
    noRetreat: true,
    inCrates: true,
  }),
  quake: def('quake', 'place', {
    damage: 10,
    knockback: 4,
    ammo: 1,
    fromTurn: 4,
    inCrates: true,
  }),
};

/** Weapons a player can pick (fragments are internal), in menu order. */
export const WEAPON_IDS: WeaponId[] = [
  'bazooka',
  'grenade',
  'shotgun',
  'cluster',
  'mortar',
  'napalm',
  'homing',
  'airstrike',
  'dynamite',
  'mine',
  'crawler',
  'punch',
  'drill',
  'girder',
  'teleport',
  'quake',
];

export const CRATE_WEAPONS: WeaponId[] = WEAPON_IDS.filter((w) => WEAPONS[w].inCrates);

export const DEFAULT_FUSE_SECONDS = 3;
