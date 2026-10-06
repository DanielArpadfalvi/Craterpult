import {
  GRAVITY,
  MAX_CLIMB,
  MAX_SNAP_DOWN,
  SAFE_FALL_SPEED,
  UNIT_HALF_WIDTH,
  UNIT_HEIGHT,
  WALK_SPEED,
  WORLD_MARGIN,
} from './constants';
import { fmul, fx, fxFloor, ONE } from './fixed';
import { isSolid, type Terrain } from './terrain';
import type { MatchEvent, Unit } from './types';

/** True if a unit body with feet at integer pixel (px, py) overlaps terrain. */
export function bodyCollides(t: Terrain, px: number, py: number): boolean {
  for (let dy = 0; dy < UNIT_HEIGHT; dy += 3) {
    if (
      isSolid(t, px - UNIT_HALF_WIDTH, py - dy) ||
      isSolid(t, px, py - dy) ||
      isSolid(t, px + UNIT_HALF_WIDTH, py - dy)
    )
      return true;
  }
  return isSolid(t, px, py - UNIT_HEIGHT + 1);
}

/** True if there is solid ground directly under the feet. */
export function standsOn(t: Terrain, px: number, py: number): boolean {
  return (
    isSolid(t, px, py + 1) ||
    isSolid(t, px - UNIT_HALF_WIDTH + 1, py + 1) ||
    isSolid(t, px + UNIT_HALF_WIDTH - 1, py + 1)
  );
}

/** Body center (integer pixels), used for hits. */
export function unitCenter(u: Unit): { x: number; y: number } {
  return { x: fxFloor(u.x), y: fxFloor(u.y) - (UNIT_HEIGHT >> 1) };
}

export function launchUnit(u: Unit, vx: number, vy: number): void {
  u.vx = vx;
  u.vy = vy;
  u.grounded = false;
}

/**
 * Walk one tick in `dir` (−1/1) on the ground: climbs steps up to MAX_CLIMB, snaps down small
 * drops, starts falling off ledges. Returns true if the unit moved.
 */
export function walk(t: Terrain, u: Unit, dir: -1 | 1): boolean {
  u.facing = dir;
  if (!u.grounded) return false;
  const px = fxFloor(u.x);
  const py = fxFloor(u.y);
  const nx = u.x + dir * WALK_SPEED;
  const npx = fxFloor(nx);
  if (npx === px) {
    u.x = nx;
    return true;
  }
  let ny = -1;
  for (let climb = 0; climb <= MAX_CLIMB; climb++) {
    if (!bodyCollides(t, npx, py - climb)) {
      ny = py - climb;
      break;
    }
  }
  if (ny < 0) return false;
  u.x = nx;
  // Snap down onto ground just below, otherwise fall.
  for (let drop = 0; drop <= MAX_SNAP_DOWN; drop++) {
    if (standsOn(t, npx, ny + drop)) {
      u.y = (ny + drop) * ONE;
      return true;
    }
  }
  u.y = ny * ONE;
  launchUnit(u, dir * (WALK_SPEED >> 1), 0);
  return true;
}

/**
 * Integrate an airborne unit for one tick (gravity, terrain collision, landing with fall damage,
 * drowning). Grounded units only re-check their footing.
 */
export function stepUnit(t: Terrain, u: Unit, waterLevel: number, events: MatchEvent[]): void {
  if (!u.alive) return;
  if (u.grounded) {
    if (!standsOn(t, fxFloor(u.x), fxFloor(u.y))) launchUnit(u, 0, 0);
    else return;
  }
  u.vy += GRAVITY;
  // Sub-step so that no axis moves more than one pixel per step.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(u.vx), Math.abs(u.vy)) / ONE));
  const sx = Math.trunc(u.vx / steps);
  const sy = Math.trunc(u.vy / steps);
  for (let i = 0; i < steps; i++) {
    // Horizontal.
    if (sx !== 0) {
      const nx = u.x + sx;
      const px = fxFloor(nx);
      const py = fxFloor(u.y);
      if (!bodyCollides(t, px, py)) u.x = nx;
      else if (!bodyCollides(t, px, py - 1)) {
        u.x = nx;
        u.y -= ONE;
      } else {
        u.vx = -fmul(u.vx, fx(0.3));
      }
    }
    // Vertical.
    if (sy !== 0) {
      const ny = u.y + sy;
      const px = fxFloor(u.x);
      const py = fxFloor(ny);
      if (!bodyCollides(t, px, py)) {
        u.y = ny;
      } else if (sy > 0) {
        land(u, events);
        break;
      } else {
        u.vy = 0;
      }
    }
  }
  const px = fxFloor(u.x);
  if (
    fxFloor(u.y) - (UNIT_HEIGHT >> 1) >= waterLevel ||
    px < -WORLD_MARGIN ||
    px > t.width + WORLD_MARGIN
  ) {
    u.alive = false;
    u.hp = 0;
    u.grounded = false;
    events.push({ type: 'drowned', unit: u.id });
  }
}

function land(u: Unit, events: MatchEvent[]): void {
  let damage = 0;
  if (u.vy > SAFE_FALL_SPEED) damage = Math.min(40, fxFloor(fmul(u.vy - SAFE_FALL_SPEED, fx(8))));
  u.y = fxFloor(u.y) * ONE;
  u.vx = 0;
  u.vy = 0;
  u.grounded = true;
  if (damage > 0) {
    u.hp -= damage;
    u.pendingDamage += damage;
    events.push({ type: 'damage', unit: u.id, amount: damage });
  }
  events.push({ type: 'landed', unit: u.id, damage });
}
