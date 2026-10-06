import { AIR, METAL, ROCK, type Rect } from '../core/terrain';
import { mix } from './color';
import { CLASSIC_TERRAIN, type SoilPattern, type TerrainColors } from './themes';

/** Pack 0xRRGGBB + alpha into the little-endian ABGR word used by ImageData's Uint32 view. */
export function abgr(rgb: number, alpha = 255): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Terrain colors pre-packed as ABGR words, with per-row soil shades for the depth fade. */
export interface TerrainPaintPalette {
  height: number;
  soilRows: Uint32Array;
  lineRows: Uint32Array;
  soilEdge: number;
  soilEdgeSoft: number;
  rock: number;
  rockLine: number;
  rockEdge: number;
  metal: number;
  metalLine: number;
  metalEdge: number;
  pattern: number;
}

const PATTERNS: readonly SoilPattern[] = ['diagonal', 'dots', 'strata', 'bricks', 'facets'];

/** Pack a theme's terrain colors for a map `height` rows tall (the soil darkens with depth). */
export function buildTerrainPalette(c: TerrainColors, height: number): TerrainPaintPalette {
  const soilRows = new Uint32Array(height);
  const lineRows = new Uint32Array(height);
  const fadeFrom = height * 0.25;
  for (let y = 0; y < height; y++) {
    const t = Math.max(0, Math.min(1, (y - fadeFrom) / (height - fadeFrom)));
    soilRows[y] = abgr(mix(c.soil, c.soilDeep, t));
    lineRows[y] = abgr(mix(c.soilLine, c.soilDeep, t * 0.6));
  }
  return {
    height,
    soilRows,
    lineRows,
    soilEdge: abgr(c.soilEdge),
    soilEdgeSoft: abgr(mix(c.soilEdge, c.soil, 0.55)),
    rock: abgr(c.rock),
    rockLine: abgr(c.rockLine),
    rockEdge: abgr(c.rockEdge),
    metal: abgr(c.metal),
    metalLine: abgr(c.metalLine),
    metalEdge: abgr(c.metalEdge),
    pattern: Math.max(0, PATTERNS.indexOf(c.pattern)),
  };
}

const classicCache = new Map<number, TerrainPaintPalette>();
function classicPalette(height: number): TerrainPaintPalette {
  let p = classicCache.get(height);
  if (!p) {
    p = buildTerrainPalette(CLASSIC_TERRAIN, height);
    classicCache.set(height, p);
  }
  return p;
}

/** True if soil cell (x, y) lies on the interior pattern (integer math only; hot path). */
function onPattern(pattern: number, x: number, y: number): boolean {
  switch (pattern) {
    case 1: // staggered 2×2 dots
      return (x & 7) < 2 && ((y + ((x >> 3) & 1) * 4) & 7) < 2;
    case 2: {
      // gently zig-zagging horizontal strata
      const tw = (x >> 2) & 15;
      return (y + (tw < 8 ? tw : 15 - tw)) % 12 === 0;
    }
    case 3: // bricks
      return (y & 7) === 0 || ((x + ((y >> 3) & 1) * 8) & 15) === 0;
    case 4: // diamond facets
      return ((x + y) & 31) === 0 || ((x - y) & 31) === 0;
    default: // diagonal lines
      return ((x + y) & 15) === 0;
  }
}

/**
 * Paint the terrain cells inside `rect` (clamped to the map) into `out` (one ABGR word per cell):
 * a bright neon rim on surfaces, a softer second rim, and a theme pattern inside.
 */
export function paintTerrain(
  cells: Uint8Array,
  width: number,
  height: number,
  out: Uint32Array,
  rect: Rect = { x: 0, y: 0, w: width, h: height },
  palette: TerrainPaintPalette = classicPalette(height),
): void {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(width, rect.x + rect.w);
  const y1 = Math.min(height, rect.y + rect.h);
  const pal = palette.height === height ? palette : classicPalette(height);
  const { soilRows, lineRows, pattern } = pal;
  // Outside the map: air to the sides and above, solid below.
  const air = (x: number, y: number): boolean =>
    x < 0 || x >= width || y < 0 ? true : y >= height ? false : cells[y * width + x] === AIR;
  const w2 = width * 2;
  for (let y = y0; y < y1; y++) {
    const soil = soilRows[y] as number;
    const line = lineRows[y] as number;
    const innerRow = y >= 2 && y < height - 2;
    let i = y * width + x0;
    for (let x = x0; x < x1; x++, i++) {
      const m = cells[i] as number;
      if (m === AIR) {
        out[i] = 0;
        continue;
      }
      let rim1: boolean;
      let rim2: boolean;
      if (innerRow && x >= 2 && x < width - 2) {
        rim1 =
          cells[i - width] === AIR ||
          cells[i - 1] === AIR ||
          cells[i + 1] === AIR ||
          cells[i + width] === AIR;
        rim2 =
          !rim1 &&
          (cells[i - w2] === AIR ||
            cells[i - 2] === AIR ||
            cells[i + 2] === AIR ||
            cells[i + w2] === AIR ||
            cells[i - width - 1] === AIR ||
            cells[i - width + 1] === AIR);
      } else {
        rim1 = air(x, y - 1) || air(x - 1, y) || air(x + 1, y) || air(x, y + 1);
        rim2 =
          !rim1 &&
          (air(x, y - 2) ||
            air(x - 2, y) ||
            air(x + 2, y) ||
            air(x, y + 2) ||
            air(x - 1, y - 1) ||
            air(x + 1, y - 1));
      }
      if (m === METAL) {
        out[i] = rim1 ? pal.metalEdge : (x >> 2) % 2 === 0 ? pal.metal : pal.metalLine;
      } else if (m === ROCK) {
        out[i] = rim1 ? pal.rockEdge : (x * 3 + y * 5) % 23 === 0 ? pal.rockLine : pal.rock;
      } else if (rim1) {
        out[i] = pal.soilEdge;
      } else if (rim2) {
        out[i] = pal.soilEdgeSoft;
      } else {
        out[i] = onPattern(pattern, x, y) ? line : soil;
      }
    }
  }
}

/** Grow a rect by `n` cells on every side (rims of neighbors change after a carve). */
export function inflate(r: Rect, n: number): Rect {
  return { x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n };
}
