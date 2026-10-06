import { createRng, nextUint32, randInt, type RngState, type Seed } from './rng';
import { carveCircle, createTerrain, fillCircle, ROCK, SOIL, type Terrain } from './terrain';
import { bodyCollides } from './units';

export interface MapOptions {
  width: number;
  height: number;
  /** World y of the water surface. */
  waterLevel: number;
}

export const DEFAULT_MAP: MapOptions = { width: 1600, height: 900, waterLevel: 860 };

/** Smooth 1-D value noise in [0, 1024) sampled with integer cosine-free interpolation. */
function valueNoise(rng: RngState, length: number, cell: number): Int32Array {
  const knots = Math.ceil(length / cell) + 2;
  const k = new Int32Array(knots);
  for (let i = 0; i < knots; i++) k[i] = nextUint32(rng) & 1023;
  const out = new Int32Array(length);
  for (let x = 0; x < length; x++) {
    const i = Math.floor(x / cell);
    const f = x - i * cell; // 0..cell-1
    // Smoothstep weight in 0..cell² using integers.
    const w = (3 * f * f * cell - 2 * f * f * f) / cell; // 0..cell²
    const a = k[i] as number;
    const b = k[i + 1] as number;
    out[x] = Math.floor((a * (cell * cell - w) + b * w) / (cell * cell));
  }
  return out;
}

/**
 * Generate an island landscape: layered value-noise hills that sink into the water at both ends,
 * rock seams, and a few caves.
 */
export function generateTerrain(seed: Seed, opts: MapOptions = DEFAULT_MAP): Terrain {
  const rng = createRng(`map:${seed}`);
  const { width, height, waterLevel } = opts;
  const t = createTerrain(width, height);
  const big = valueNoise(rng, width, 320);
  const mid = valueNoise(rng, width, 110);
  const small = valueNoise(rng, width, 34);
  const base = Math.floor(height * 0.5);
  const amp = Math.floor(height * 0.32);
  const shore = Math.floor(width * 0.06);
  for (let x = 0; x < width; x++) {
    const n = ((big[x] as number) * 6 + (mid[x] as number) * 3 + (small[x] as number)) / 10; // 0..1023
    let top = base + Math.floor((amp * (512 - n)) / 512);
    // Sink the shores below the water line.
    const edge = Math.min(x, width - 1 - x);
    if (edge < shore) top += Math.floor(((shore - edge) * (waterLevel + 40 - top)) / shore);
    top = Math.max(Math.floor(height * 0.15), top);
    for (let y = Math.max(0, top); y < height; y++) t.cells[y * width + x] = SOIL;
  }
  // Rock seams inside the hills.
  const seams = 10 + randInt(rng, 8);
  for (let i = 0; i < seams; i++) {
    const x = shore + randInt(rng, width - 2 * shore);
    const y = Math.floor(height * 0.45) + randInt(rng, Math.floor(height * 0.45));
    fillCircleIfSolid(t, x, y, 10 + randInt(rng, 22), ROCK);
  }
  // Caves.
  const caves = 3 + randInt(rng, 4);
  for (let i = 0; i < caves; i++) {
    const x = shore * 2 + randInt(rng, width - 4 * shore);
    const y = Math.floor(height * 0.55) + randInt(rng, Math.floor(height * 0.25));
    const r = 14 + randInt(rng, 26);
    carveCircle(t, x, y, r);
    carveCircle(t, x + r, y + randInt(rng, 9) - 4, Math.floor(r * 0.8));
  }
  return t;
}

/** Fill only where the ground already is (keeps the silhouette). */
function fillCircleIfSolid(t: Terrain, cx: number, cy: number, r: number, m: number): void {
  const copy = createTerrain(t.width, t.height);
  fillCircle(copy, cx, cy, r, m);
  for (let y = Math.max(0, cy - r); y <= Math.min(t.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(t.width - 1, cx + r); x++) {
      const i = y * t.width + x;
      if (copy.cells[i] && t.cells[i]) t.cells[i] = m;
    }
  }
}

/**
 * Spawn points (integer feet positions) for `count` units, spread across the island on open ground
 * above the water and away from each other. Deterministic for a seed.
 */
export function findSpawns(
  t: Terrain,
  count: number,
  waterLevel: number,
  rng: RngState,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const margin = Math.floor(t.width * 0.08);
  const span = t.width - 2 * margin;
  const slot = Math.floor(span / count);
  for (let i = 0; i < count; i++) {
    let found: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 80 && !found; attempt++) {
      // First try inside this unit's slot, then anywhere.
      const x = attempt < 40 ? margin + i * slot + randInt(rng, slot) : margin + randInt(rng, span);
      const y = surfaceY(t, x);
      if (y < 0 || y > waterLevel - 30) continue;
      if (bodyCollides(t, x, y)) continue;
      if (out.some((p) => Math.abs(p.x - x) < 24)) continue;
      found = { x, y };
    }
    if (!found) found = { x: margin + i * slot, y: 0 };
    out.push(found);
  }
  return out;
}

/** Feet y of the first open spot on the surface of column x (searching from the top), or -1. */
function surfaceY(t: Terrain, x: number): number {
  for (let y = 12; y < t.height; y++) {
    if (t.cells[y * t.width + x]) return y - 1;
  }
  return -1;
}
