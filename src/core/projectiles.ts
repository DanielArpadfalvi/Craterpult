import { GRAVITY, UNIT_HIT_RADIUS, WIND_ACCEL, WORLD_MARGIN } from './constants';
import { explode } from './explosion';
import { fmul, fx, fxFloor, ONE } from './fixed';
import { isSolid, surfaceNormal } from './terrain';
import type { MatchState, Projectile } from './types';
import { unitCenter } from './units';
import { WEAPONS } from './weapons';

/** Ticks after launch during which a projectile cannot hit its own shooter. */
const OWNER_GRACE_TICKS = 12;
const BOUNCE_DAMPING = fx(0.5);
const PROJECTILE_RADIUS = 2;

/** Advance every projectile one tick; removes the ones that exploded or left the world. */
export function stepProjectiles(s: MatchState): void {
  const keep: Projectile[] = [];
  for (const p of s.projectiles) if (stepProjectile(s, p)) keep.push(p);
  s.projectiles = keep;
}

/** Returns false when the projectile is gone. */
function stepProjectile(s: MatchState, p: Projectile): boolean {
  const def = WEAPONS[p.weapon];
  p.age++;
  p.vy += GRAVITY;
  if (def.wind) p.vx += s.wind * WIND_ACCEL;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) / ONE));
  const sx = Math.trunc(p.vx / steps);
  const sy = Math.trunc(p.vy / steps);
  for (let i = 0; i < steps; i++) {
    const nx = p.x + sx;
    const ny = p.y + sy;
    const px = fxFloor(nx);
    const py = fxFloor(ny);
    if (px < -WORLD_MARGIN || px > s.terrain.width + WORLD_MARGIN || py > s.terrain.height) {
      return false;
    }
    if (py >= s.waterLevel) {
      s.events.push({ type: 'splash', x: px });
      return false;
    }
    const hitUnit = !def.bounces && hitsUnit(s, p, px, py);
    if (hitUnit || isSolid(s.terrain, px, py)) {
      if (def.bounces && !hitUnit) {
        bounce(s, p, px, py);
        break;
      }
      explode(s, px, py, def.blastRadius, def.damage, def.knockback);
      return false;
    }
    p.x = nx;
    p.y = ny;
  }
  if (p.fuse >= 0) {
    p.fuse--;
    if (p.fuse <= 0) {
      explode(s, fxFloor(p.x), fxFloor(p.y), def.blastRadius, def.damage, def.knockback);
      return false;
    }
  }
  return true;
}

function hitsUnit(s: MatchState, p: Projectile, px: number, py: number): boolean {
  const r = UNIT_HIT_RADIUS + PROJECTILE_RADIUS;
  for (const u of s.units) {
    if (!u.alive) continue;
    if (u.id === p.owner && p.age < OWNER_GRACE_TICKS) continue;
    const c = unitCenter(u);
    const dx = c.x - px;
    const dy = c.y - py;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

function bounce(s: MatchState, p: Projectile, px: number, py: number): void {
  const { nx, ny } = surfaceNormal(s.terrain, px, py);
  const len2 = nx * nx + ny * ny;
  if (len2 === 0) {
    p.vx = -p.vx;
    p.vy = -p.vy;
  } else {
    const dot = p.vx * nx + p.vy * ny;
    if (dot < 0) {
      p.vx -= Math.trunc((2 * dot * nx) / len2);
      p.vy -= Math.trunc((2 * dot * ny) / len2);
    }
  }
  p.vx = fmul(p.vx, BOUNCE_DAMPING);
  p.vy = fmul(p.vy, BOUNCE_DAMPING);
  // Nudge out of the ground so a resting grenade does not sink.
  if (len2 > 0) {
    const step = Math.max(Math.abs(nx), Math.abs(ny));
    p.x += Math.trunc((nx * ONE) / step);
    p.y += Math.trunc((ny * ONE) / step);
  } else {
    p.y -= ONE;
  }
  if (Math.abs(p.vx) + Math.abs(p.vy) > fx(0.8))
    s.events.push({ type: 'bounce', projectile: p.id });
}
