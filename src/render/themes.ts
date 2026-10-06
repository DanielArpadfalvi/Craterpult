import type { MapStyle } from '../core/mapgen';
import { PALETTE } from './palette';

/** Interior pattern of soil cells (see `paintTerrain`). */
export type SoilPattern = 'diagonal' | 'dots' | 'strata' | 'bricks' | 'facets';
/** Shape family of the parallax silhouettes. */
export type SkylineKind = 'hills' | 'islands' | 'cavern' | 'city' | 'mesas';
export type CelestialKind = 'sun' | 'moon' | 'none';
export type WaveKind = 'swell' | 'choppy' | 'still' | 'ripple';
/** Ambient life: shooting stars, drifting motes (fireflies / spores), falling drips, rising embers. */
export type AmbientKind = 'shooting' | 'drift' | 'drips' | 'embers';

export interface TerrainColors {
  /** Soil interior near the top of the map … */
  soil: number;
  /** … fading to this at the bottom. */
  soilDeep: number;
  soilLine: number;
  soilEdge: number;
  rock: number;
  rockLine: number;
  rockEdge: number;
  metal: number;
  metalLine: number;
  metalEdge: number;
  pattern: SoilPattern;
}

export interface SilhouetteLayer {
  color: number;
  /** Neon contour along the top edge. */
  edge: number;
  edgeAlpha: number;
}

export interface Theme {
  style: MapStyle;
  /** Variant index within the style (picked by seed). */
  variant: number;
  /** 32-bit seed for the layout of stars, skyline and ambient life. */
  seed: number;
  /** Sky gradient top → middle → horizon. */
  sky: readonly [number, number, number];
  /** Color below the horizon (sea / desert floor / city haze) before the silhouettes cover it. */
  ground: number;
  stars: { count: number; color: number };
  celestial: { kind: CelestialKind; colors: readonly [number, number]; x: number; r: number };
  /** Aurora curtain colors (flats) or null. */
  aurora: readonly [number, number] | null;
  skyline: SkylineKind;
  /** Horizon height in the far parallax layer, as a fraction of the map height. */
  horizon: number;
  far: SilhouetteLayer;
  near: SilhouetteLayer;
  /** Accent lights in the backdrop: lit windows, crystals, buoys. */
  accents: readonly number[];
  terrain: TerrainColors;
  water: { color: number; edge: number; wave: WaveKind };
  ambient: readonly { kind: AmbientKind; color: number }[];
}

type ThemeBase = Omit<Theme, 'style' | 'variant' | 'seed'>;
type Variant = Partial<Pick<Theme, 'sky' | 'ground' | 'celestial' | 'aurora' | 'accents'>> & {
  far?: SilhouetteLayer;
  near?: SilhouetteLayer;
};

/** The original look: neon pink rims on violet soil. */
export const CLASSIC_TERRAIN: TerrainColors = {
  soil: PALETTE.soil,
  soilDeep: PALETTE.soil,
  soilLine: PALETTE.soilLine,
  soilEdge: PALETTE.soilEdge,
  rock: PALETTE.rock,
  rockLine: PALETTE.rockLine,
  rockEdge: PALETTE.rockEdge,
  metal: PALETTE.metal,
  metalLine: PALETTE.soilLine,
  metalEdge: PALETTE.metalEdge,
  pattern: 'diagonal',
};

const BASES: Record<MapStyle, ThemeBase> = {
  // Synthwave sunset: big striped sun sinking behind wireframe hills.
  hills: {
    sky: [0x07031a, 0x2a0b4a, 0x6e1f5c],
    ground: 0x2a0d40,
    stars: { count: 70, color: 0xffd9f4 },
    celestial: { kind: 'sun', colors: [0xffe36b, 0xff3d8b], x: 0.62, r: 0.26 },
    aurora: null,
    skyline: 'hills',
    horizon: 0.44,
    far: { color: 0x431659, edge: 0xffa05c, edgeAlpha: 0.55 },
    near: { color: 0x200a38, edge: 0x6be6ff, edgeAlpha: 0.35 },
    accents: [0xff6ad5, 0x6be6ff],
    terrain: {
      soil: 0x2f1659,
      soilDeep: 0x150928,
      soilLine: 0x4a2484,
      soilEdge: 0xff4fd8,
      rock: 0x1c2346,
      rockLine: 0x2c3666,
      rockEdge: 0x7f9cff,
      metal: 0x3a4250,
      metalLine: 0x2b3240,
      metalEdge: 0xd7e3ff,
      pattern: 'diagonal',
    },
    water: { color: 0x0a2a6b, edge: 0x3ef0ff, wave: 'swell' },
    ambient: [{ kind: 'shooting', color: 0xfff1c9 }],
  },
  // Moonlit archipelago: sea horizon, moon path on the water, distant islands, fireflies.
  islands: {
    sky: [0x020612, 0x0a1d3d, 0x184a6a],
    ground: 0x0b3350,
    stars: { count: 150, color: 0xdfe9ff },
    celestial: { kind: 'moon', colors: [0xf6f8ff, 0xb9ccff], x: 0.72, r: 0.1 },
    aurora: null,
    skyline: 'islands',
    horizon: 0.52,
    far: { color: 0x0a2236, edge: 0x7fe9ff, edgeAlpha: 0.35 },
    near: { color: 0x061727, edge: 0x5dffc0, edgeAlpha: 0.3 },
    accents: [0xffe08a, 0x7fe9ff],
    terrain: {
      soil: 0x124151,
      soilDeep: 0x061c28,
      soilLine: 0x1d5e70,
      soilEdge: 0x5dffc0,
      rock: 0x1f2c4a,
      rockLine: 0x2f4270,
      rockEdge: 0xa9bcff,
      metal: 0x3d4a58,
      metalLine: 0x2c3742,
      metalEdge: 0xe2eeff,
      pattern: 'dots',
    },
    water: { color: 0x0b4a72, edge: 0x8ffcff, wave: 'choppy' },
    ambient: [{ kind: 'drift', color: 0xd8ff8a }],
  },
  // Underground: rock walls, glowing crystals, drips instead of stars, a still lake.
  cavern: {
    sky: [0x020106, 0x06040e, 0x0c0a1c],
    ground: 0x0c0a1c,
    stars: { count: 0, color: 0x9b7bff },
    celestial: { kind: 'none', colors: [0, 0], x: 0.5, r: 0 },
    aurora: null,
    skyline: 'cavern',
    horizon: 0.5,
    far: { color: 0x221a44, edge: 0x7a5cff, edgeAlpha: 0.5 },
    near: { color: 0x0d0a1d, edge: 0xb48cff, edgeAlpha: 0.35 },
    accents: [0x5cf2ff, 0xc77dff, 0xff6ad5],
    terrain: {
      soil: 0x2c1f44,
      soilDeep: 0x140d24,
      soilLine: 0x3f2d60,
      soilEdge: 0xc08bff,
      rock: 0x272b4e,
      rockLine: 0x394277,
      rockEdge: 0x7fdcff,
      metal: 0x3a4250,
      metalLine: 0x2b3240,
      metalEdge: 0xd7e3ff,
      pattern: 'facets',
    },
    water: { color: 0x15124a, edge: 0xa98bff, wave: 'still' },
    ambient: [
      { kind: 'drips', color: 0x8fdcff },
      { kind: 'drift', color: 0xc77dff },
    ],
  },
  // Neon city at night: two skyline layers with lit windows, magenta smog, a canal.
  towers: {
    sky: [0x03030d, 0x150b33, 0x4a1650],
    ground: 0x1a0c30,
    stars: { count: 35, color: 0xc9d4ff },
    celestial: { kind: 'none', colors: [0, 0], x: 0.5, r: 0 },
    aurora: null,
    skyline: 'city',
    horizon: 0.5,
    far: { color: 0x2a1648, edge: 0xff7ae0, edgeAlpha: 0.3 },
    near: { color: 0x120c28, edge: 0x6ff3ff, edgeAlpha: 0.3 },
    accents: [0xffd36b, 0x6ff3ff, 0xff7ae0],
    terrain: {
      soil: 0x1e2140,
      soilDeep: 0x0c0d1e,
      soilLine: 0x2d3160,
      soilEdge: 0x5ca0ff,
      rock: 0x2b2343,
      rockLine: 0x40335f,
      rockEdge: 0xff9ae0,
      metal: 0x4a5370,
      metalLine: 0x353c55,
      metalEdge: 0xeaf0ff,
      pattern: 'bricks',
    },
    water: { color: 0x200d45, edge: 0xff7ae0, wave: 'ripple' },
    ambient: [{ kind: 'embers', color: 0xff9ae0 }],
  },
  // Desert night: mesas on the horizon under an aurora.
  flats: {
    sky: [0x02070e, 0x0a2030, 0x30284e],
    ground: 0x24152c,
    stars: { count: 120, color: 0xe6fff5 },
    celestial: { kind: 'none', colors: [0, 0], x: 0.5, r: 0 },
    aurora: [0x4dffb0, 0x8a6bff],
    skyline: 'mesas',
    horizon: 0.5,
    far: { color: 0x2c1a36, edge: 0xffa07a, edgeAlpha: 0.4 },
    near: { color: 0x170c1f, edge: 0xff7062, edgeAlpha: 0.35 },
    accents: [0xffa07a],
    terrain: {
      soil: 0x41202e,
      soilDeep: 0x1a0b16,
      soilLine: 0x5c2c3e,
      soilEdge: 0xff7a5c,
      rock: 0x2e2540,
      rockLine: 0x463862,
      rockEdge: 0xffc7a6,
      metal: 0x47505e,
      metalLine: 0x343b46,
      metalEdge: 0xe8eef8,
      pattern: 'strata',
    },
    water: { color: 0x07384c, edge: 0x6af7ff, wave: 'swell' },
    ambient: [{ kind: 'shooting', color: 0xe6fff5 }],
  },
};

/** Seed-picked variations: alternative skies and accent hues, same terrain (stays recognizable). */
const VARIANTS: Record<MapStyle, readonly Variant[]> = {
  hills: [
    {},
    {
      sky: [0x040419, 0x1b1050, 0x7a2c4a],
      celestial: { kind: 'sun', colors: [0xfff1a0, 0xff6a3d], x: 0.36, r: 0.26 },
      far: { color: 0x3a1640, edge: 0xffa04f, edgeAlpha: 0.65 },
    },
  ],
  islands: [
    {},
    {
      sky: [0x02040e, 0x0c1638, 0x223c6a],
      celestial: { kind: 'moon', colors: [0xfff6dc, 0xffd99a], x: 0.28, r: 0.11 },
      ground: 0x0c2a52,
    },
  ],
  cavern: [
    {},
    {
      sky: [0x010304, 0x03090d, 0x07141c],
      ground: 0x07141c,
      far: { color: 0x10283a, edge: 0x3fe0ff, edgeAlpha: 0.45 },
      accents: [0x5cffd0, 0x5cf2ff, 0xb48cff],
    },
  ],
  towers: [
    {},
    {
      sky: [0x020510, 0x08173a, 0x16406a],
      ground: 0x0c1c3a,
      far: { color: 0x14284a, edge: 0x6ff3ff, edgeAlpha: 0.3 },
      accents: [0x6ff3ff, 0xffd36b, 0x9dffc8],
    },
  ],
  flats: [
    {},
    {
      aurora: [0xff6ad5, 0x5cf2ff],
      sky: [0x05030e, 0x1a0c2e, 0x40213e],
    },
  ],
};

/** FNV-1a hash of a seed string (deterministic, platform independent). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The visual theme of a match: chosen by map style, varied deterministically by seed. */
export function themeFor(style: MapStyle | undefined, seed: string): Theme {
  const st: MapStyle = style && style in BASES ? style : 'hills';
  const h = hashSeed(`theme:${st}:${seed}`);
  const variants = VARIANTS[st];
  const variant = h % variants.length;
  const base = BASES[st];
  const v = variants[variant] ?? {};
  return { ...base, ...v, style: st, variant, seed: h };
}

/** Number of seed variants of a style (for tests). */
export function variantCount(style: MapStyle): number {
  return VARIANTS[style].length;
}
