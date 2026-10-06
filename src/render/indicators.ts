import { Graphics } from 'pixi.js';
import type { EdgeMarker } from './camera';

export interface ColoredMarker extends EdgeMarker {
  color: number;
}

/** Markers of the same color closer than this (screen px) are drawn as one arrow. */
const MERGE_PX = 18;

/** Drop markers that would sit on top of an earlier one of the same color. */
export function mergeMarkers(markers: readonly ColoredMarker[]): ColoredMarker[] {
  const out: ColoredMarker[] = [];
  for (const m of markers) {
    if (out.some((o) => o.color === m.color && Math.hypot(o.x - m.x, o.y - m.y) < MERGE_PX))
      continue;
    out.push(m);
  }
  return out;
}

/**
 * Screen-space arrows at the screen edge pointing at off-screen enemies (team-colored, with a dark
 * outline so they read on every theme). Pure view: the host computes the markers each frame.
 */
export class EdgeIndicators {
  readonly view = new Graphics();
  private time = 0;

  draw(markers: readonly ColoredMarker[], dt: number): void {
    const g = this.view;
    g.clear();
    if (markers.length === 0) {
      this.time = 0;
      return;
    }
    this.time += dt;
    // A gentle inward/outward bob draws the eye without flashing.
    const bob = Math.sin(this.time * 5) * 2.5;
    for (const m of mergeMarkers(markers)) {
      const cos = Math.cos(m.angle);
      const sin = Math.sin(m.angle);
      // Tip sits slightly inside the edge; the arrow body points back toward the screen center.
      const tipX = m.x - cos * (4 - bob);
      const tipY = m.y - sin * (4 - bob);
      const len = 16;
      const half = 10;
      const baseX = tipX - cos * len;
      const baseY = tipY - sin * len;
      const pts = [
        tipX,
        tipY,
        baseX - sin * half,
        baseY + cos * half,
        baseX + cos * 4,
        baseY + sin * 4,
        baseX + sin * half,
        baseY - cos * half,
      ];
      g.poly(pts).fill({ color: m.color, alpha: 0.95 }).stroke({ width: 2.5, color: 0x05040f });
    }
  }
}
