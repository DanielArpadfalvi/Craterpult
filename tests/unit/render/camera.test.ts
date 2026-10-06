import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  defaultZoom,
  followCamera,
  screenToWorld,
  worldToScreen,
  zoomLimits,
} from '../../../src/render/camera';

const view = { width: 390, height: 700 };
const world = { width: 1600, height: 900, sky: 300 };

describe('camera', () => {
  it('limits zoom between whole-island and close-up', () => {
    const { min, max } = zoomLimits(view, world);
    expect(min).toBeCloseTo(390 / 1600);
    expect(max).toBe(2.5);
    expect(defaultZoom(view, world)).toBeCloseTo(390 / 460);
  });

  it('keeps the view inside the world', () => {
    const c = clampCamera({ x: -500, y: 5000, zoom: 1 }, view, world);
    expect(c.x).toBe(195);
    expect(c.y).toBe(900 - 350);
    const far = clampCamera({ x: 0, y: 0, zoom: 0.01 }, view, world);
    expect(far.zoom).toBeCloseTo(390 / 1600);
    expect(far.x).toBe(800);
  });

  it('round-trips screen and world coordinates', () => {
    const c = { x: 640, y: 420, zoom: 1.7 };
    const s = worldToScreen(c, view, 700, 380);
    const w = screenToWorld(c, view, s.x, s.y);
    expect(w.x).toBeCloseTo(700);
    expect(w.y).toBeCloseTo(380);
  });

  it('follows the target smoothly', () => {
    const c = followCamera({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 0, zoom: 1 }, 1 / 60);
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(100);
  });
});
