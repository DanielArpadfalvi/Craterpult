import { describe, expect, it } from 'vitest';
import { MAP_STYLES } from '../../../src/core/mapgen';
import { createMatch } from '../../../src/core/match';
import { contrast, luminance, mix } from '../../../src/render/color';
import { TEAM_COLORS } from '../../../src/render/palette';
import { hashSeed, themeFor, variantCount, type Theme } from '../../../src/render/themes';

/** Every theme variant of every style. */
function allThemes(): Theme[] {
  const out: Theme[] = [];
  for (const style of MAP_STYLES) {
    const seen = new Set<number>();
    for (let i = 0; i < 64 && seen.size < variantCount(style); i++) {
      const t = themeFor(style, `seed-${i}`);
      if (!seen.has(t.variant)) {
        seen.add(t.variant);
        out.push(t);
      }
    }
    expect(seen.size).toBe(variantCount(style));
  }
  return out;
}

const isColor = (c: number) => Number.isInteger(c) && c >= 0 && c <= 0xffffff;

describe('themeFor', () => {
  it('picks the theme by map style', () => {
    for (const style of MAP_STYLES) expect(themeFor(style, 'x').style).toBe(style);
    expect(themeFor(undefined, 'x').style).toBe('hills');
  });

  it('is deterministic per seed and varies across seeds', () => {
    for (const style of MAP_STYLES) {
      expect(themeFor(style, 'abc')).toEqual(themeFor(style, 'abc'));
      const seeds = new Set(Array.from({ length: 8 }, (_, i) => themeFor(style, `s${i}`).seed));
      expect(seeds.size).toBe(8);
    }
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('gives every style its own look', () => {
    const looks = MAP_STYLES.map((s) => themeFor(s, 'same'));
    expect(new Set(looks.map((t) => t.skyline)).size).toBe(MAP_STYLES.length);
    expect(new Set(looks.map((t) => t.terrain.pattern)).size).toBe(MAP_STYLES.length);
    expect(new Set(looks.map((t) => t.terrain.soilEdge)).size).toBe(MAP_STYLES.length);
    expect(new Set(looks.map((t) => t.water.wave)).size).toBeGreaterThanOrEqual(3);
  });

  it('cavern has no stars and drips; the others have stars', () => {
    for (const t of allThemes()) {
      if (t.style === 'cavern') {
        expect(t.stars.count).toBe(0);
        expect(t.ambient.some((a) => a.kind === 'drips')).toBe(true);
      } else {
        expect(t.stars.count).toBeGreaterThan(0);
      }
      expect(t.ambient.length).toBeGreaterThan(0);
    }
  });

  it('reaches the renderer through the match state', () => {
    const s = createMatch({
      seed: 'm',
      map: { width: 200, height: 120, waterLevel: 110, style: 'towers' },
      teams: [
        { name: 'a', units: ['a'] },
        { name: 'b', units: ['b'] },
      ],
    });
    expect(s.mapStyle).toBe('towers');
    expect(themeFor(s.mapStyle, s.seed).skyline).toBe('city');
  });
});

describe('theme palettes', () => {
  it('contain only valid colors and sane geometry', () => {
    for (const t of allThemes()) {
      const colors = [
        ...t.sky,
        t.ground,
        t.stars.color,
        t.far.color,
        t.far.edge,
        t.near.color,
        t.near.edge,
        ...t.accents,
        t.water.color,
        t.water.edge,
        ...Object.values(t.terrain).filter((v): v is number => typeof v === 'number'),
        ...t.ambient.map((a) => a.color),
      ];
      for (const c of colors) expect(isColor(c), `${t.style}: ${c}`).toBe(true);
      expect(t.horizon).toBeGreaterThan(0.2);
      expect(t.horizon).toBeLessThan(0.8);
      expect(t.far.edgeAlpha).toBeGreaterThan(0);
      expect(t.far.edgeAlpha).toBeLessThanOrEqual(1);
      if (t.celestial.kind !== 'none') expect(t.celestial.r).toBeGreaterThan(0);
    }
  });

  it('keeps terrain rims readable against the sky and the silhouettes', () => {
    for (const t of allThemes()) {
      const backs = [...t.sky, t.ground, t.far.color, t.near.color];
      for (const b of backs) {
        expect(contrast(t.terrain.soilEdge, b), `${t.style}/${t.variant} rim`).toBeGreaterThan(3);
        expect(contrast(t.terrain.rockEdge, b), `${t.style}/${t.variant} rock`).toBeGreaterThan(3);
        expect(contrast(t.terrain.metalEdge, b), `${t.style}/${t.variant} metal`).toBeGreaterThan(
          3,
        );
      }
      // The rim also stands out from the soil it outlines.
      expect(contrast(t.terrain.soilEdge, t.terrain.soil)).toBeGreaterThan(3);
      expect(contrast(t.water.edge, t.water.color)).toBeGreaterThan(3);
    }
  });

  it('keeps every team color visible on every background and on the soil', () => {
    for (const t of allThemes()) {
      const backs = [...t.sky, t.ground, t.far.color, t.near.color, t.terrain.soil];
      for (const team of TEAM_COLORS)
        for (const b of backs)
          expect(contrast(team, b), `${t.style}/${t.variant} team ${team}`).toBeGreaterThan(3);
    }
  });

  it('keeps the backdrop darker than the terrain rims (silhouettes stay in the background)', () => {
    for (const t of allThemes()) {
      const rim = luminance(t.terrain.soilEdge);
      for (const c of [t.far.color, t.near.color, ...t.sky]) expect(luminance(c)).toBeLessThan(rim);
      // The near layer is not brighter than the far one (atmospheric depth).
      expect(luminance(t.near.color)).toBeLessThanOrEqual(luminance(t.far.color));
    }
  });
});

describe('color helpers', () => {
  it('mixes and measures contrast', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(contrast(0x000000, 0xffffff)).toBeCloseTo(21, 5);
    expect(contrast(0x123456, 0x123456)).toBe(1);
  });
});
