import { createRng, nextUint32, randInt, type RngState, type Seed } from './rng';
import { UNIT_HEIGHT } from './constants';
import {
  carveCircle,
  createTerrain,
  fillCircle,
  fillRect,
  METAL,
  ROCK,
  SOIL,
  type Terrain,
} from './terrain';
import { bodyCollides } from './units';

/**
 * Landscape families:
 * - `hills`: one rolling island (the original generator)
 * - `islands`: several islands separated by water channels
 * - `cavern`: a rock ceiling with stalactites and floating ledges over a hilly floor
 * - `towers`: low ground with tall pillars, some bridged by metal girders
 * - `flats`: a long, gently undulating plain
 */
export type MapStyle = 'hills' | 'islands' | 'cavern' | 'towers' | 'flats';

export const MAP_STYLES: MapStyle[] = ['hills', 'islands', 'cavern', 'towers', 'flats'];

/** Hand-placed level features, applied after the style generator (integer world px). */
export type MapFeature =
  /** Indestructible horizontal beam, `w` long, 6 px thick, top at y. */
  | { kind: 'girder'; x: number; y: number; w: number }
  /** Rock disc (only the core of a blast breaks it). */
  | { kind: 'rock'; x: number; y: number; r: number }
  /** Soil disc. */
  | { kind: 'soil'; x: number; y: number; r: number }
  /** Indestructible block. */
  | { kind: 'metal'; x: number; y: number; w: number; h: number }
  /** Carve a hole (air). */
  | { kind: 'hole'; x: number; y: number; r: number };

export interface MapOptions {
  width: number;
  height: number;
  /** World y of the water surface. */
  waterLevel: number;
  /** Landscape family (default `hills`). */
  style?: MapStyle;
  features?: MapFeature[];
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

/** Generate the terrain for a seed and map options (style, then hand-placed features). */
export function generateTerrain(seed: Seed, opts: MapOptions = DEFAULT_MAP): Terrain {
  const rng = createRng(`map:${seed}`);
  const t = createTerrain(opts.width, opts.height);
  switch (opts.style ?? 'hills') {
    case 'hills':
      genHills(rng, t, opts.waterLevel);
      break;
    case 'islands':
      genIslands(rng, t, opts.waterLevel);
      break;
    case 'cavern':
      genCavern(rng, t, opts.waterLevel);
      break;
    case 'towers':
      genTowers(rng, t, opts.waterLevel);
      break;
    case 'flats':
      genFlats(rng, t, opts.waterLevel);
      break;
  }
  for (const f of opts.features ?? []) applyFeature(t, f);
  return t;
}

function applyFeature(t: Terrain, f: MapFeature): void {
  switch (f.kind) {
    case 'girder':
      fillRect(t, f.x, f.y, f.w, 6, METAL);
      break;
    case 'rock':
      fillCircle(t, f.x, f.y, f.r, ROCK);
      break;
    case 'soil':
      fillCircle(t, f.x, f.y, f.r, SOIL);
      break;
    case 'metal':
      fillRect(t, f.x, f.y, f.w, f.h, METAL);
      break;
    case 'hole':
      carveCircle(t, f.x, f.y, f.r);
      break;
  }
}

/** Fill every column x from `tops[x]` down to the bottom with soil. */
function fillColumns(t: Terrain, tops: Int32Array): void {
  for (let x = 0; x < t.width; x++) {
    for (let y = Math.max(0, tops[x] as number); y < t.height; y++) t.cells[y * t.width + x] = SOIL;
  }
}

/** Rock seams (inside existing ground) and small caves between y fractions lo..hi (percent). */
function seamsAndCaves(
  rng: RngState,
  t: Terrain,
  seams: number,
  caves: number,
  lo = 45,
  hi = 90,
): void {
  const { width, height } = t;
  const shore = Math.floor(width * 0.06);
  for (let i = 0; i < seams; i++) {
    const x = shore + randInt(rng, width - 2 * shore);
    const y =
      Math.floor((height * lo) / 100) + randInt(rng, Math.floor((height * (hi - lo)) / 100));
    fillCircleIfSolid(t, x, y, 10 + randInt(rng, 22), ROCK);
  }
  for (let i = 0; i < caves; i++) {
    const x = shore * 2 + randInt(rng, width - 4 * shore);
    const y =
      Math.floor((height * (lo + 10)) / 100) + randInt(rng, Math.floor((height * (hi - lo)) / 200));
    const r = 14 + randInt(rng, 20);
    carveCircle(t, x, y, r);
    carveCircle(t, x + r, y + randInt(rng, 9) - 4, Math.floor(r * 0.8));
  }
}

/** Surface heights from layered noise: base ± amp (fractions of the height, in percent). */
function noiseTops(rng: RngState, t: Terrain, basePct: number, ampPct: number): Int32Array {
  const { width, height } = t;
  const big = valueNoise(rng, width, 320);
  const mid = valueNoise(rng, width, 110);
  const small = valueNoise(rng, width, 34);
  const base = Math.floor((height * basePct) / 100);
  const amp = Math.floor((height * ampPct) / 100);
  const tops = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    const n = ((big[x] as number) * 6 + (mid[x] as number) * 3 + (small[x] as number)) / 10;
    tops[x] = base + Math.floor((amp * (512 - n)) / 512);
  }
  return tops;
}

/** Sink both ends of the map below the water. */
function sinkShores(tops: Int32Array, width: number, waterLevel: number, shorePct = 6): void {
  const shore = Math.floor((width * shorePct) / 100);
  for (let x = 0; x < width; x++) {
    const edge = Math.min(x, width - 1 - x);
    const top = tops[x] as number;
    if (edge < shore)
      tops[x] = top + Math.floor(((shore - edge) * (waterLevel + 40 - top)) / shore);
  }
}

function genFlats(rng: RngState, t: Terrain, waterLevel: number): void {
  const tops = noiseTops(rng, t, 62, 7);
  // Keep the plain comfortably above the water.
  for (let x = 0; x < t.width; x++) tops[x] = Math.min(tops[x] as number, waterLevel - 70);
  sinkShores(tops, t.width, waterLevel, 5);
  fillColumns(t, tops);
  seamsAndCaves(rng, t, 6 + randInt(rng, 5), 2 + randInt(rng, 2), 70, 95);
}

function genIslands(rng: RngState, t: Terrain, waterLevel: number): void {
  const { width } = t;
  const tops = noiseTops(rng, t, 52, 22);
  const count = 3 + randInt(rng, 2);
  const span = Math.floor(width / count);
  // Channels between the islands: a smooth dip below the water around each boundary.
  for (let i = 1; i < count; i++) {
    const cx = i * span + randInt(rng, Math.floor(span / 5)) - Math.floor(span / 10);
    const half = 34 + randInt(rng, 26);
    const slope = 46;
    for (let x = cx - half - slope; x <= cx + half + slope; x++) {
      if (x < 0 || x >= width) continue;
      const d = Math.abs(x - cx);
      const deep = waterLevel + 50;
      const top = tops[x] as number;
      tops[x] =
        d <= half ? deep : Math.max(top, deep - Math.floor(((d - half) * (deep - top)) / slope));
    }
  }
  for (let x = 0; x < width; x++) tops[x] = Math.max(Math.floor(t.height * 0.2), tops[x] as number);
  sinkShores(tops, width, waterLevel, 5);
  fillColumns(t, tops);
  seamsAndCaves(rng, t, 8 + randInt(rng, 6), 1 + randInt(rng, 3));
}

function genCavern(rng: RngState, t: Terrain, waterLevel: number): void {
  const { width, height } = t;
  const tops = noiseTops(rng, t, 66, 14);
  sinkShores(tops, width, waterLevel, 6);
  fillColumns(t, tops);
  // Ceiling: noisy rock-lined slab hanging from the top, always leaving a tall open cave.
  const ceil = valueNoise(rng, width, 140);
  const minGap = Math.floor(height * 0.3);
  for (let x = 0; x < width; x++) {
    const thick = Math.floor(height * 0.07) + Math.floor(((ceil[x] as number) * height) / 6000);
    const bottom = Math.min(thick, (tops[x] as number) - minGap);
    for (let y = 0; y < bottom; y++) t.cells[y * width + x] = y < bottom - 8 ? ROCK : SOIL;
  }
  // Stalactites.
  const drips = 5 + randInt(rng, 4);
  for (let i = 0; i < drips; i++) {
    const x = 60 + randInt(rng, width - 120);
    let y = Math.floor(height * 0.08);
    const r0 = 10 + randInt(rng, 8);
    for (let r = r0; r > 3; r -= 2) {
      fillCircle(t, x, y, r, SOIL);
      y += r;
    }
  }
  // Floating ledges (overhangs) in the open middle.
  const ledges = 2 + randInt(rng, 3);
  for (let i = 0; i < ledges; i++) {
    const x = Math.floor(width * 0.12) + randInt(rng, Math.floor(width * 0.76));
    const y = Math.floor(height * 0.36) + randInt(rng, Math.floor(height * 0.1));
    const w = 70 + randInt(rng, 70);
    for (let k = 0; k < w; k += 8) fillCircle(t, x + k, y + ((k * 7) % 5), 9, SOIL);
    fillCircleIfSolid(t, x + (w >> 1), y + 4, 6, ROCK);
  }
  seamsAndCaves(rng, t, 6 + randInt(rng, 4), 1 + randInt(rng, 2), 72, 95);
}

function genTowers(rng: RngState, t: Terrain, waterLevel: number): void {
  const { width, height } = t;
  const tops = noiseTops(rng, t, 74, 6);
  for (let x = 0; x < width; x++) tops[x] = Math.min(tops[x] as number, waterLevel - 50);
  const count = 4 + randInt(rng, 3);
  const span = Math.floor((width * 0.84) / count);
  const towers: { x: number; w: number; top: number }[] = [];
  for (let i = 0; i < count; i++) {
    const w = 46 + randInt(rng, 34);
    const x = Math.floor(width * 0.08) + i * span + randInt(rng, Math.max(1, span - w));
    const top = Math.floor(height * 0.3) + randInt(rng, Math.floor(height * 0.22));
    towers.push({ x, w, top });
    for (let k = 0; k < w; k++) {
      // Slightly rounded shoulders.
      const edge = Math.min(k, w - 1 - k);
      const lift = edge < 6 ? 6 - edge : 0;
      if (x + k < width) tops[x + k] = Math.min(tops[x + k] as number, top + lift);
    }
  }
  sinkShores(tops, width, waterLevel, 6);
  fillColumns(t, tops);
  // Rock cores keep the pillars standing a little longer.
  for (const tw of towers) {
    fillCircleIfSolid(t, tw.x + (tw.w >> 1), tw.top + 60, Math.floor(tw.w / 3), ROCK);
  }
  // Girder bridges between some neighbours.
  for (let i = 0; i + 1 < towers.length; i++) {
    if (randInt(rng, 3) === 0) continue;
    const a = towers[i] as { x: number; w: number; top: number };
    const b = towers[i + 1] as { x: number; w: number; top: number };
    const y = Math.max(a.top, b.top) + 8;
    const x0 = a.x + a.w - 6;
    const x1 = b.x + 6;
    if (x1 - x0 > 30) fillRect(t, x0, y, x1 - x0, 6, METAL);
  }
  seamsAndCaves(rng, t, 4 + randInt(rng, 4), 1 + randInt(rng, 2), 78, 95);
}

/** The original generator: hills, shores, rock seams and caves. */
function genHills(rng: RngState, t: Terrain, waterLevel: number): void {
  const { width, height } = t;
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
    if (!found) found = scanForSpawn(t, waterLevel, out, margin + i * slot);
    out.push(found);
  }
  return out;
}

/**
 * Feet y of the first standable spot in column x, searching from the top: the first solid cell
 * with enough open air above it for a unit (skips a cavern ceiling). -1 if none.
 */
function surfaceY(t: Terrain, x: number): number {
  let air = 0;
  for (let y = 12; y < t.height; y++) {
    if (t.cells[y * t.width + x]) {
      if (air >= UNIT_HEIGHT + 4) return y - 1;
      air = 0;
    } else {
      air++;
    }
  }
  return -1;
}

/** Deterministic sweep for any valid spot, starting near `fromX` (used when random tries fail). */
function scanForSpawn(
  t: Terrain,
  waterLevel: number,
  taken: { x: number; y: number }[],
  fromX: number,
): { x: number; y: number } {
  for (let d = 0; d < t.width; d += 3) {
    for (const x of [fromX + d, fromX - d]) {
      if (x < 8 || x >= t.width - 8) continue;
      const y = surfaceY(t, x);
      if (y < 0 || y > waterLevel - 30 || bodyCollides(t, x, y)) continue;
      if (taken.some((p) => Math.abs(p.x - x) < 16)) continue;
      return { x, y };
    }
  }
  return { x: fromX, y: 0 };
}
