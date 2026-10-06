import { scaledGravity, UNIT_HIT_RADIUS, WIND_ACCEL, WORLD_MARGIN } from './constants';
import { explode } from './explosion';
import { flen, fmul, fx, fxFloor, ONE } from './fixed';
import { isSolid, surfaceNormal } from './terrain';
import type { MatchState, Projectile, WeaponId } from './types';
import { unitCenter } from './units';
import { WEAPONS } from './weapons';

/** Ticks after launch during which a projectile cannot hit its own shooter. */
const OWNER_GRACE_TICKS = 12;
const BOUNCE_DAMPING = fx(0.5);
const PROJECTILE_RADIUS = 2;
/** Mines arm after this many ticks and then trigger on a unit within MINE_TRIGGER_PX. */
export const MINE_ARM_TICKS = 90;
export const MINE_TRIGGER_PX = 22;
const MINE_FUSE_TICKS = 50;
const HOMING_DELAY_TICKS = 24;
const HOMING_ACCEL = fx(0.45);
const HOMING_MAX_SPEED = fx(8);
const WALKER_SPEED = fx(0.8);
const WALKER_CLIMB = 7;
const WALKER_HOP_VY = fx(-3.6);
/** The crawler ignores its owner long enough to walk away from them. */
const CRAWLER_OWNER_GRACE_TICKS = 120;

export function spawnProjectile(
  s: MatchState,
  weapon: WeaponId,
  x: number,
  y: number,
  vx: number,
  vy: number,
  owner: number,
  fuse = -1,
  extra: Partial<Pick<Projectile, 'dir' | 'tx' | 'ty'>> = {},
): Projectile {
  const p: Projectile = {
    id: s.nextProjectileId++,
    weapon,
    x,
    y,
    vx,
    vy,
    fuse,
    owner,
    age: 0,
    resting: false,
    dir: extra.dir ?? 0,
    tx: extra.tx ?? 0,
    ty: extra.ty ?? 0,
  };
  s.projectiles.push(p);
  return p;
}

/** Advance every projectile one tick; removes the ones that exploded or left the world. */
export function stepProjectiles(s: MatchState): void {
  // Explosions may spawn fragments mid-loop: iterate over a snapshot, keep survivors + newcomers.
  const current = s.projectiles;
  const gone = new Set<number>();
  for (const p of current) if (!stepProjectile(s, p)) gone.add(p.id);
  s.projectiles = s.projectiles.filter((p) => !gone.has(p.id));
}

/** Returns false when the projectile is gone. */
function stepProjectile(s: MatchState, p: Projectile): boolean {
  const def = WEAPONS[p.weapon];
  p.age++;

  if (p.weapon === 'mine' && p.fuse < 0 && p.age >= MINE_ARM_TICKS && mineTriggered(s, p)) {
    p.fuse = MINE_FUSE_TICKS;
    s.events.push({ type: 'mineTriggered', projectile: p.id });
  }

  if (p.resting) {
    const px = fxFloor(p.x);
    const py = fxFloor(p.y);
    if (def.flight === 'walker') {
      walk(s, p);
      // Walking into anyone (other than its owner right after release) sets it off.
      const cx = fxFloor(p.x);
      const cy = fxFloor(p.y) - 3;
      if (hitsUnit(s, p, cx, cy, CRAWLER_OWNER_GRACE_TICKS)) {
        detonate(s, p, cx, cy);
        return false;
      }
    } else if (!isSolid(s.terrain, px, py + 1)) {
      p.resting = false;
    }
  }

  if (!p.resting) {
    const g = scaledGravity(s.config.gravityPct);
    p.vy += Math.trunc((g * def.gravityPct) / 100);
    if (def.wind) p.vx += Math.trunc((s.wind * WIND_ACCEL * s.config.windScale) / 100);
    if (def.flight === 'homing' && p.age > HOMING_DELAY_TICKS) steer(p, g);
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
      const explodesOnUnits = def.flight === 'impact' || def.flight === 'homing';
      const hitUnit = explodesOnUnits && hitsUnit(s, p, px, py);
      if (hitUnit || isSolid(s.terrain, px, py)) {
        if (explodesOnUnits) {
          detonate(s, p, px, py);
          return false;
        }
        if (def.flight === 'bounce') bounce(s, p, px, py);
        else settle(p);
        break;
      }
      p.x = nx;
      p.y = ny;
    }
  }

  if (p.fuse >= 0) {
    p.fuse--;
    if (p.fuse <= 0) {
      detonate(s, p, fxFloor(p.x), fxFloor(p.y));
      return false;
    }
  }
  return true;
}

/** Explode `p` at (x, y) and spawn its fragments. */
export function detonate(s: MatchState, p: Projectile, x: number, y: number): void {
  const def = WEAPONS[p.weapon];
  explode(s, x, y, def.blastRadius, def.damage, def.knockback);
  if (def.fragments > 0 && def.fragment) {
    const n = def.fragments;
    for (let i = 0; i < n; i++) {
      const spread = i - (n - 1) / 2;
      const vx = Math.trunc(spread * fx(p.weapon === 'napalm' ? 0.9 : 1.3));
      const vy = -fx(3) - fx(0.4) * (i % 2) - Math.abs(Math.trunc(spread * fx(0.2)));
      spawnProjectile(s, def.fragment, x * ONE, (y - 4) * ONE, vx, vy, p.owner);
    }
  }
}

function mineTriggered(s: MatchState, p: Projectile): boolean {
  const px = fxFloor(p.x);
  const py = fxFloor(p.y);
  const r2 = MINE_TRIGGER_PX * MINE_TRIGGER_PX;
  return s.units.some((u) => {
    if (!u.alive) return false;
    const c = unitCenter(u);
    return (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py) <= r2;
  });
}

function hitsUnit(
  s: MatchState,
  p: Projectile,
  px: number,
  py: number,
  grace = OWNER_GRACE_TICKS,
): boolean {
  const r = UNIT_HIT_RADIUS + PROJECTILE_RADIUS;
  for (const u of s.units) {
    if (!u.alive) continue;
    if (u.id === p.owner && p.age < grace) continue;
    const c = unitCenter(u);
    const dx = c.x - px;
    const dy = c.y - py;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

function settle(p: Projectile): void {
  p.vx = 0;
  p.vy = 0;
  p.resting = true;
}

/** Accelerate toward the target and cap the speed. */
function steer(p: Projectile, gravity: number): void {
  const dx = p.tx * ONE - p.x;
  const dy = p.ty * ONE - p.y;
  const d = Math.max(1, flen(Math.trunc(dx / 256), Math.trunc(dy / 256)) * 256);
  p.vx += Math.trunc((HOMING_ACCEL * dx) / d);
  p.vy += Math.trunc((HOMING_ACCEL * dy) / d) - gravity;
  const sp = flen(p.vx, p.vy);
  if (sp > HOMING_MAX_SPEED) {
    p.vx = Math.trunc((p.vx * HOMING_MAX_SPEED) / sp);
    p.vy = Math.trunc((p.vy * HOMING_MAX_SPEED) / sp);
  }
}

/** Crawler on the ground: walk, climb small steps, hop over walls, turn back if stuck. */
function walk(s: MatchState, p: Projectile): void {
  const t = s.terrain;
  const px = fxFloor(p.x);
  const py = fxFloor(p.y);
  const dir = p.dir === 0 ? 1 : p.dir;
  const nx = p.x + dir * WALKER_SPEED;
  const npx = fxFloor(nx);
  if (npx !== px) {
    let ny = -1;
    for (let c = 0; c <= WALKER_CLIMB; c++) {
      if (!isSolid(t, npx, py - c) && !isSolid(t, npx, py - c - 4)) {
        ny = py - c;
        break;
      }
    }
    if (ny < 0) {
      // Wall: hop; a second wall in a row turns it around.
      p.resting = false;
      p.vx = dir * fx(1);
      p.vy = WALKER_HOP_VY;
      // Hopping at the same wall again: turn around (tx remembers the last hop x).
      if (Math.abs(px - p.tx) < 3) {
        p.dir = dir === 1 ? -1 : 1;
        p.vx = -p.vx;
      }
      p.tx = px;
      return;
    }
    p.x = nx;
    p.y = ny * ONE;
  } else {
    p.x = nx;
  }
  if (!isSolid(t, fxFloor(p.x), fxFloor(p.y) + 1)) {
    // Step down small drops, otherwise fall.
    for (let d = 1; d <= 4; d++) {
      if (isSolid(t, fxFloor(p.x), fxFloor(p.y) + d + 1)) {
        p.y += d * ONE;
        return;
      }
    }
    p.resting = false;
    p.vx = dir * (WALKER_SPEED >> 1);
    p.vy = 0;
  }
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
