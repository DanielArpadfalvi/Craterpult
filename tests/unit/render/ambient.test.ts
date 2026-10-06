import { describe, expect, it } from 'vitest';
import { MAP_STYLES } from '../../../src/core/mapgen';
import { AMBIENT_POOL, AmbientLife } from '../../../src/render/ambient';
import { layoutRng } from '../../../src/render/backdrop';
import { themeFor } from '../../../src/render/themes';

describe('AmbientLife', () => {
  it('spawns life for every theme and never exceeds its fixed pool', () => {
    for (const style of MAP_STYLES) {
      const a = new AmbientLife(false);
      a.resize({ width: 390, height: 844 });
      a.setTheme(themeFor(style, 'amb'));
      let peak = 0;
      for (let i = 0; i < 60 * 20; i++) {
        a.update(1 / 60);
        peak = Math.max(peak, a.count);
      }
      expect(peak, style).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(AMBIENT_POOL);
      a.view.destroy();
    }
  });

  it('stays empty and hidden for reduced motion', () => {
    const a = new AmbientLife(true);
    a.resize({ width: 390, height: 844 });
    a.setTheme(themeFor('hills', 'amb'));
    for (let i = 0; i < 600; i++) a.update(1 / 60);
    expect(a.count).toBe(0);
    expect(a.view.visible).toBe(false);
    a.view.destroy();
  });

  it('resets when the theme changes', () => {
    const a = new AmbientLife(false);
    a.resize({ width: 390, height: 844 });
    a.setTheme(themeFor('towers', 'amb'));
    for (let i = 0; i < 300; i++) a.update(1 / 60);
    expect(a.count).toBeGreaterThan(0);
    a.setTheme(themeFor('flats', 'amb'));
    expect(a.count).toBe(0);
    a.view.destroy();
  });
});

describe('layoutRng', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = layoutRng(42);
    const b = layoutRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
