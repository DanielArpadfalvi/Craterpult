import { describe, expect, it } from 'vitest';
import { MAP_STYLES, generateTerrain } from '../../../src/core/mapgen';
import { carveCircle, createTerrain, fillRect, ROCK, SOIL } from '../../../src/core/terrain';
import { abgr, buildTerrainPalette, inflate, paintTerrain } from '../../../src/render/terrainPaint';
import { PALETTE } from '../../../src/render/palette';
import { themeFor } from '../../../src/render/themes';

const W = 1600;
const H = 900;

function best(n: number, fn: () => void): number {
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

describe('paintTerrain', () => {
  it('draws air transparent and a neon rim on the surface', () => {
    const t = createTerrain(20, 20);
    fillRect(t, 0, 10, 20, 10, SOIL);
    const out = new Uint32Array(400);
    paintTerrain(t.cells, 20, 20, out);
    expect(out[5 * 20 + 5]).toBe(0);
    expect(out[10 * 20 + 5]).toBe(abgr(PALETTE.soilEdge));
    expect(out[15 * 20 + 5]).not.toBe(abgr(PALETTE.soilEdge));
    expect(out[15 * 20 + 5]).not.toBe(0);
  });

  it('packs colors as little-endian ABGR', () => {
    expect(abgr(0x112233)).toBe(0xff332211);
  });

  it('paints with the theme palette of every map style', () => {
    const t = createTerrain(64, 64);
    fillRect(t, 0, 20, 64, 44, SOIL);
    fillRect(t, 0, 50, 64, 14, ROCK);
    const seen = new Set<number>();
    for (const style of MAP_STYLES) {
      const theme = themeFor(style, 'p');
      const pal = buildTerrainPalette(theme.terrain, 64);
      const out = new Uint32Array(64 * 64);
      paintTerrain(t.cells, 64, 64, out, undefined, pal);
      expect(out[20 * 64 + 30]).toBe(abgr(theme.terrain.soilEdge));
      expect(out[52 * 64 + 30]).not.toBe(abgr(theme.terrain.soilEdge));
      // Interior: soil shade or the pattern line, never transparent.
      const inner = new Set<number>();
      for (let y = 24; y < 48; y++)
        for (let x = 4; x < 60; x++) inner.add(out[y * 64 + x] as number);
      expect(inner.has(0)).toBe(false);
      expect(inner.size).toBeGreaterThanOrEqual(2);
      seen.add(out[20 * 64 + 30] as number);
    }
    expect(seen.size).toBe(MAP_STYLES.length);
  });

  it('darkens the soil with depth', () => {
    const pal = buildTerrainPalette(themeFor('flats', 'd').terrain, 900);
    expect(pal.soilRows[0]).not.toBe(pal.soilRows[899]);
    expect(pal.soilRows[0]).toBe(abgr(themeFor('flats', 'd').terrain.soil));
    expect(pal.soilRows[899]).toBe(abgr(themeFor('flats', 'd').terrain.soilDeep));
  });

  it('a crater repaint touches only its rect and matches a full repaint', () => {
    const terrain = generateTerrain('paint', { width: W, height: H, waterLevel: 860 });
    const pal = buildTerrainPalette(themeFor('hills', 'paint').terrain, H);
    const out = new Uint32Array(W * H);
    paintTerrain(terrain.cells, W, H, out, undefined, pal);
    const before = out.slice();
    const rect = carveCircle(terrain, 800, 520, 40);
    expect(rect).not.toBeNull();
    const r = inflate(rect as NonNullable<typeof rect>, 3);
    const sentinel = 0x12345678;
    const probe = before.slice();
    for (let i = 0; i < probe.length; i++) probe[i] = sentinel;
    paintTerrain(terrain.cells, W, H, probe, r, pal);
    let touched = 0;
    let outside = 0;
    for (let y = 0; y < H; y++) {
      const inY = y >= r.y && y < r.y + r.h;
      for (let x = 0; x < W; x++) {
        if (probe[y * W + x] === sentinel) continue;
        touched++;
        if (!(inY && x >= r.x && x < r.x + r.w)) outside++;
      }
    }
    expect(outside).toBe(0);
    expect(touched).toBe(r.w * r.h);
    // Incremental update == painting the whole map again.
    paintTerrain(terrain.cells, W, H, before, r, pal);
    const full = new Uint32Array(W * H);
    paintTerrain(terrain.cells, W, H, full, undefined, pal);
    let diff = 0;
    for (let i = 0; i < full.length; i++) if (before[i] !== full[i]) diff++;
    expect(diff).toBe(0);
  }, 30_000);

  it('stays fast: full 1600×900 paint and per-crater repaints', () => {
    const terrain = generateTerrain('bench', { width: W, height: H, waterLevel: 860 });
    const pal = buildTerrainPalette(themeFor('islands', 'bench').terrain, H);
    const out = new Uint32Array(W * H);
    paintTerrain(terrain.cells, W, H, out, undefined, pal); // warm-up (JIT)
    const full = best(5, () => paintTerrain(terrain.cells, W, H, out, undefined, pal));
    const carved = carveCircle(terrain, 700, 500, 45);
    expect(carved).not.toBeNull();
    const rect = inflate(carved as NonNullable<typeof carved>, 3);
    const crater = best(5, () => paintTerrain(terrain.cells, W, H, out, rect, pal));
    // Generous budgets for slow / busy CI machines; an idle dev box does a full paint in ~25 ms
    // and a crater in well under 1 ms.
    expect(full).toBeLessThan(400);
    expect(crater).toBeLessThan(8);
    expect(crater).toBeLessThan(full);
  }, 30_000);
});
