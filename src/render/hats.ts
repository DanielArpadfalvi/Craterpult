import type { Graphics } from 'pixi.js';

/**
 * Hats on top of a unit's head (y ≈ -11). The first four are the team shapes (teams also differ by
 * hat for color-blind players); the rest are cosmetic unlocks.
 */
export const HAT_STYLES = [
  'circle',
  'diamond',
  'triangle',
  'square',
  'crown',
  'horns',
  'halo',
] as const;
export type HatStyle = (typeof HAT_STYLES)[number];

/** Draw `hat` into `g` in the unit's local coordinates. */
export function drawHat(g: Graphics, hat: HatStyle, color: number): void {
  switch (hat) {
    case 'circle':
      g.circle(0, -13.5, 2.2).fill(color);
      break;
    case 'diamond':
      g.poly([0, -16.5, 2.5, -13.5, 0, -10.8, -2.5, -13.5]).fill(color);
      break;
    case 'triangle':
      g.poly([0, -16.5, 2.8, -11.5, -2.8, -11.5]).fill(color);
      break;
    case 'square':
      g.rect(-2.2, -15.8, 4.4, 4.4).fill(color);
      break;
    case 'crown':
      g.poly([-4, -10.6, -4, -15.5, -2, -13, 0, -16.5, 2, -13, 4, -15.5, 4, -10.6]).fill(color);
      g.circle(0, -12.4, 0.8).fill(0x05040f);
      break;
    case 'horns':
      g.poly([-4.6, -10.6, -5.6, -16, -2.4, -11]).fill(color);
      g.poly([4.6, -10.6, 5.6, -16, 2.4, -11]).fill(color);
      break;
    case 'halo':
      g.ellipse(0, -15.5, 4.6, 1.6).stroke({ width: 1.3, color });
      break;
  }
}
