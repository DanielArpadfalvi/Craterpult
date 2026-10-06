import { fx } from './fixed';

/** Downward acceleration per tick² (px, fixed). */
export const GRAVITY = fx(0.15);
/** Horizontal acceleration per tick² per wind step (px, fixed). */
export const WIND_ACCEL = fx(0.0035);
/** Launch speed at 100 % power (px/tick, fixed). */
export const MAX_LAUNCH_SPEED = fx(14);

export const UNIT_HALF_WIDTH = 3;
export const UNIT_HEIGHT = 10;
/** Radius used for projectile / blast hits, centered on the body. */
export const UNIT_HIT_RADIUS = 6;
export const WALK_SPEED = fx(0.6);
export const MAX_CLIMB = 5;
export const MAX_SNAP_DOWN = 5;
export const JUMP_VX = fx(2.2);
export const JUMP_VY = fx(-3.8);
export const BACKFLIP_VX = fx(-1);
export const BACKFLIP_VY = fx(-5.6);
/** Landing speed above which units take fall damage. */
export const SAFE_FALL_SPEED = fx(6);
/** Units this far outside the world sides are lost. */
export const WORLD_MARGIN = 64;

/** Ticks the turn waits for the world to come to rest before handing over. */
export const SETTLE_MIN_TICKS = 45;
export const SETTLE_MAX_TICKS = 600;

export const DEFAULT_CONFIG = {
  turnTicks: 45 * 60,
  retreatTicks: 3 * 60,
  unitHp: 100,
};
