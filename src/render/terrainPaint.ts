import { AIR, METAL, ROCK, type Rect } from '../core/terrain';
import { PALETTE } from './palette';

/** Pack 0xRRGGBB + alpha into the little-endian ABGR word used by ImageData's Uint32 view. */
export function abgr(rgb: number, alpha = 255): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const SOIL = abgr(PALETTE.soil);
const SOIL_LINE = abgr(PALETTE.soilLine);
const SOIL_EDGE = abgr(PALETTE.soilEdge);
const SOIL_EDGE_SOFT = abgr(mix(PALETTE.soilEdge, PALETTE.soil, 0.55));
const ROCK_C = abgr(PALETTE.rock);
const ROCK_LINE = abgr(PALETTE.rockLine);
const ROCK_EDGE = abgr(PALETTE.rockEdge);
const METAL_C = abgr(PALETTE.metal);
const METAL_EDGE = abgr(PALETTE.metalEdge);
const CLEAR = 0;

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Paint the terrain cells inside `rect` (clamped to the map) into `out` (one ABGR word per cell):
 * a bright neon rim on surfaces, a softer second rim, and a diagonal line pattern inside.
 */
export function paintTerrain(
  cells: Uint8Array,
  width: number,
  height: number,
  out: Uint32Array,
  rect: Rect = { x: 0, y: 0, w: width, h: height },
): void {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(width, rect.x + rect.w);
  const y1 = Math.min(height, rect.y + rect.h);
  const air = (x: number, y: number): boolean =>
    x < 0 || x >= width || y < 0 ? true : y >= height ? false : cells[y * width + x] === AIR;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const m = cells[i] as number;
      if (m === AIR) {
        out[i] = CLEAR;
        continue;
      }
      const rim1 = air(x, y - 1) || air(x - 1, y) || air(x + 1, y) || air(x, y + 1);
      const rim2 =
        !rim1 &&
        (air(x, y - 2) ||
          air(x - 2, y) ||
          air(x + 2, y) ||
          air(x, y + 2) ||
          air(x - 1, y - 1) ||
          air(x + 1, y - 1));
      if (m === METAL) {
        out[i] = rim1 ? METAL_EDGE : (x >> 2) % 2 === 0 ? METAL_C : SOIL_LINE;
      } else if (m === ROCK) {
        out[i] = rim1 ? ROCK_EDGE : (x * 3 + y * 5) % 23 === 0 ? ROCK_LINE : ROCK_C;
      } else {
        out[i] = rim1 ? SOIL_EDGE : rim2 ? SOIL_EDGE_SOFT : (x + y) % 16 === 0 ? SOIL_LINE : SOIL;
      }
    }
  }
}

/** Grow a rect by `n` cells on every side (rims of neighbors change after a carve). */
export function inflate(r: Rect, n: number): Rect {
  return { x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n };
}
