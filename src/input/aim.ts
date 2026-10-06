/**
 * Slingshot aiming: the player drags back from their unit; the shot goes the opposite way.
 * Works in screen pixels; returns the core's integer deci-degree angle and 0–100 power.
 */

export const MAX_DRAG_PX = 140;
/** Below this power a release cancels the shot instead of firing. */
export const MIN_FIRE_POWER = 8;

export interface Aim {
  /** Deci-degrees, 0 = right, counter-clockwise (screen up = 900). */
  angle: number;
  /** 0–100. */
  power: number;
}

export function aimFromDrag(
  unitX: number,
  unitY: number,
  px: number,
  py: number,
  maxDrag = MAX_DRAG_PX,
): Aim {
  const dx = unitX - px;
  const dy = unitY - py;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { angle: 0, power: 0 };
  let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return {
    angle: (Math.round(deg * 10) % 3600) + 0, // + 0 turns -0 into 0
    power: Math.round(Math.min(1, len / maxDrag) * 100),
  };
}

/**
 * Preview points of a ballistic shot (no wind) for the first `ticks` ticks, in world pixels
 * relative to the launch point. Float math is fine here: it only draws dots.
 */
export function previewArc(
  aim: Aim,
  maxSpeed: number,
  gravity: number,
  ticks: number,
  every = 3,
): { x: number; y: number }[] {
  const rad = (aim.angle / 10) * (Math.PI / 180);
  const speed = (maxSpeed * Math.max(5, aim.power)) / 100;
  const vx = Math.cos(rad) * speed;
  let vy = -Math.sin(rad) * speed;
  let x = 0;
  let y = 0;
  const pts: { x: number; y: number }[] = [];
  for (let i = 1; i <= ticks; i++) {
    vy += gravity;
    x += vx;
    y += vy;
    if (i % every === 0) pts.push({ x, y });
  }
  return pts;
}
