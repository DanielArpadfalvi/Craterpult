import { describe, expect, it } from 'vitest';
import { createTerrain, fillRect, SOIL } from '../../../src/core/terrain';
import { abgr, paintTerrain } from '../../../src/render/terrainPaint';
import { PALETTE } from '../../../src/render/palette';

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
});
