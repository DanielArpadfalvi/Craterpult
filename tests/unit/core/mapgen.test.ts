import { describe, expect, it } from 'vitest';
import { fxFloor } from '../../../src/core/fixed';
import { createMatch } from '../../../src/core/match';
import { generateTerrain, MAP_STYLES, type MapOptions } from '../../../src/core/mapgen';
import { createRng } from '../../../src/core/rng';
import { findSpawns } from '../../../src/core/mapgen';
import { materialAt, METAL, ROCK } from '../../../src/core/terrain';
import { bodyCollides } from '../../../src/core/units';

const TEAMS = [
  { name: 'A', units: ['a1', 'a2', 'a3'] },
  { name: 'B', units: ['b1', 'b2', 'b3'] },
];

function solidShare(opts: MapOptions, seed: string, y0: number, y1: number): number {
  const t = generateTerrain(seed, opts);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < t.width; x++) if (t.cells[y * t.width + x]) n++;
  return n / ((y1 - y0) * t.width);
}

describe('map styles', () => {
  it('the default style is unchanged (hills) and deterministic', () => {
    const a = generateTerrain('m', { width: 800, height: 450, waterLevel: 420 });
    const b = generateTerrain('m', { width: 800, height: 450, waterLevel: 420, style: 'hills' });
    expect(a.cells).toEqual(b.cells);
  });

  it.each(MAP_STYLES)('%s: every unit spawns on dry land, clear of the terrain', (style) => {
    for (const seed of ['s1', 's2', 's3']) {
      const s = createMatch({
        seed,
        teams: TEAMS,
        map: { width: 1600, height: 900, waterLevel: 860, style },
      });
      for (const u of s.units) {
        expect(u.alive, `${style}/${seed}`).toBe(true);
        expect(u.grounded, `${style}/${seed}`).toBe(true);
        expect(fxFloor(u.y)).toBeLessThan(s.waterLevel - 20);
        expect(bodyCollides(s.terrain, fxFloor(u.x), fxFloor(u.y))).toBe(false);
      }
    }
  });

  it('cavern has a ceiling, islands have water channels, towers have girders', () => {
    const big = { width: 1600, height: 900, waterLevel: 860 };
    expect(solidShare({ ...big, style: 'cavern' }, 'c', 0, 40)).toBeGreaterThan(0.95);
    expect(solidShare({ ...big, style: 'hills' }, 'c', 0, 40)).toBe(0);
    const isl = generateTerrain('i', { ...big, style: 'islands' });
    // Count dry-land runs along the water line.
    let runs = 0;
    let inLand = false;
    for (let x = 0; x < isl.width; x++) {
      const solid = !!isl.cells[(big.waterLevel - 2) * isl.width + x];
      if (solid && !inLand) runs++;
      inLand = solid;
    }
    expect(runs).toBeGreaterThanOrEqual(3);
    const tw = generateTerrain('t', { ...big, style: 'towers' });
    expect(tw.cells.includes(METAL)).toBe(true);
  });

  it('applies hand-placed features', () => {
    const t = generateTerrain('f', {
      width: 800,
      height: 450,
      waterLevel: 420,
      style: 'flats',
      features: [
        { kind: 'girder', x: 100, y: 50, w: 60 },
        { kind: 'rock', x: 400, y: 60, r: 10 },
      ],
    });
    expect(materialAt(t, 130, 52)).toBe(METAL);
    expect(materialAt(t, 400, 60)).toBe(ROCK);
  });

  it('falls back to a valid spot when random tries fail', () => {
    const t = generateTerrain('x', { width: 400, height: 300, waterLevel: 280, style: 'towers' });
    const spawns = findSpawns(t, 8, 280, createRng('x'));
    for (const p of spawns) expect(bodyCollides(t, p.x, p.y)).toBe(false);
  });
});
