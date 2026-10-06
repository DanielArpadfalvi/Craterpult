/**
 * Destructible terrain: a byte mask, one cell per world pixel, row-major.
 * 0 = air, 1 = soil, 2 = rock (resists blasts), 3 = metal (indestructible).
 */

export const AIR = 0;
export const SOIL = 1;
export const ROCK = 2;
export const METAL = 3;

export interface Terrain {
  width: number;
  height: number;
  cells: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createTerrain(width: number, height: number): Terrain {
  return { width, height, cells: new Uint8Array(width * height) };
}

export function cloneTerrain(t: Terrain): Terrain {
  return { width: t.width, height: t.height, cells: t.cells.slice() };
}

/** Material at integer pixel (x, y); outside the sides/top is air, below the bottom is soil. */
export function materialAt(t: Terrain, x: number, y: number): number {
  if (x < 0 || x >= t.width || y < 0) return AIR;
  if (y >= t.height) return SOIL;
  return t.cells[y * t.width + x] as number;
}

export function isSolid(t: Terrain, x: number, y: number): boolean {
  return materialAt(t, x, y) !== AIR;
}

/** Fill a disc with a material (level design / girders). */
export function fillCircle(t: Terrain, cx: number, cy: number, r: number, m: number): void {
  const r2 = r * r;
  for (let y = Math.max(0, cy - r); y <= Math.min(t.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(t.width - 1, cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) t.cells[y * t.width + x] = m;
    }
  }
}

export function fillRect(
  t: Terrain,
  x0: number,
  y0: number,
  w: number,
  h: number,
  m: number,
): void {
  for (let y = Math.max(0, y0); y < Math.min(t.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(t.width, x0 + w); x++) t.cells[y * t.width + x] = m;
  }
}

/**
 * Blast a crater of radius `r` (pixels) centered on (cx, cy). Soil is removed in the full radius,
 * rock only in the inner 60 %, metal never. Returns the touched rectangle (for render updates),
 * or null when nothing changed.
 */
export function carveCircle(t: Terrain, cx: number, cy: number, r: number): Rect | null {
  const r2 = r * r;
  const rockR2 = Math.floor((r2 * 36) / 100);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = Math.max(0, cy - r); y <= Math.min(t.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(t.width - 1, cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const i = y * t.width + x;
      const m = t.cells[i] as number;
      if (m === AIR || m === METAL) continue;
      if (m === ROCK && d2 > rockR2) continue;
      t.cells[i] = AIR;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Approximate outward surface normal at (x, y) from the solid cells in a small disc, as integers
 * (nx, ny) pointing away from the solid mass (unnormalized). (0, 0) when undecidable.
 */
export function surfaceNormal(t: Terrain, x: number, y: number, r = 4): { nx: number; ny: number } {
  let nx = 0;
  let ny = 0;
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      if (isSolid(t, x + dx, y + dy)) {
        nx -= dx;
        ny -= dy;
      }
    }
  }
  return { nx, ny };
}
