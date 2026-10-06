import { UNIT_HIT_RADIUS } from './constants';
import { fx, isqrt, ONE } from './fixed';
import { carveCircle } from './terrain';
import type { MatchState } from './types';
import { launchUnit, unitCenter } from './units';

/**
 * Blast at integer pixel (x, y): carves a crater, damages and knocks back units in range
 * (linear falloff from the center).
 */
export function explode(
  s: MatchState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  knockback: number,
): void {
  s.events.push({ type: 'explosion', x, y, radius });
  const rect = carveCircle(s.terrain, x, y, radius);
  if (rect) s.events.push({ type: 'carved', rect });
  const reach = radius + UNIT_HIT_RADIUS;
  for (const u of s.units) {
    if (!u.alive) continue;
    const c = unitCenter(u);
    const dx = c.x - x;
    const dy = c.y - y;
    const d = isqrt(dx * dx + dy * dy);
    if (d >= reach) continue;
    const falloff = reach - d;
    const dmg = Math.floor((damage * falloff) / reach);
    if (dmg > 0) {
      u.hp -= dmg;
      u.pendingDamage += dmg;
      s.events.push({ type: 'damage', unit: u.id, amount: dmg });
    }
    // Knockback away from the blast, always with some lift.
    const speed = Math.floor((fx(knockback) * falloff) / reach);
    const len = Math.max(1, d);
    const vx = Math.trunc((speed * dx) / len);
    const vy = Math.min(Math.trunc((speed * dy) / len), -Math.floor(speed / 2));
    launchUnit(u, vx, vy);
  }
  // Loose explosives get tossed; a blast sets off nearby mines.
  for (const p of s.projectiles) {
    if (!p.resting) continue;
    const px = Math.floor(p.x / ONE);
    const py = Math.floor(p.y / ONE);
    const dx = px - x;
    const dy = py - y;
    const d = isqrt(dx * dx + dy * dy);
    if (d >= reach) continue;
    const speed = Math.floor((fx(knockback) * (reach - d)) / reach);
    const len = Math.max(1, d);
    p.resting = false;
    p.vx = Math.trunc((speed * dx) / len);
    p.vy = Math.min(Math.trunc((speed * dy) / len), -Math.floor(speed / 2));
    if (p.weapon === 'mine' && (p.fuse < 0 || p.fuse > 20)) p.fuse = 20;
  }
}
