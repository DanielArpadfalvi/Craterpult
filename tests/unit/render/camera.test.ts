import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  defaultZoom,
  edgeMarker,
  followCamera,
  INTRO_TIMING,
  panAt,
  panDuration,
  planIntroPan,
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
    expect(defaultZoom(view, world)).toBeCloseTo(390 / 320);
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

  it('plans a match-start tour over the enemy groups and back', () => {
    const start = { x: 200, y: 400 };
    const enemies = [
      { x: 1300, y: 380 },
      { x: 1380, y: 360 },
      { x: 700, y: 420 },
      { x: 260, y: 410 }, // already on screen at the start: no stop
    ];
    const pts = planIntroPan(start, enemies, 320);
    expect(pts[0]).toEqual(start);
    expect(pts[pts.length - 1]).toEqual(start);
    // Nearest group first, the two far units share one stop.
    expect(pts.slice(1, -1).map((p) => Math.round(p.x))).toEqual([700, 1340]);
    expect(planIntroPan(start, [{ x: 250, y: 400 }], 320)).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => ({ x: 600 + i * 300, y: 300 }));
    expect(planIntroPan(start, many, 320)).toHaveLength(5);
  });

  it('moves the tour camera along its stops with holds and ends at the start', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 0 },
    ];
    const { travel, hold } = INTRO_TIMING;
    expect(panDuration(pts)).toBeCloseTo(2 * travel + hold);
    expect(panDuration([])).toBe(0);
    expect(panAt(pts, 0).x).toBe(0);
    const mid = panAt(pts, travel / 2).x;
    expect(mid).toBeGreaterThan(400);
    expect(mid).toBeLessThan(600);
    expect(panAt(pts, travel + hold / 2).x).toBe(1000);
    expect(panAt(pts, panDuration(pts) + 1).x).toBe(0);
    // Monotonic on the way out.
    let last = -1;
    for (let t = 0; t <= travel; t += 0.05) {
      const x = panAt(pts, t).x;
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
  });

  it('places edge markers for off-screen targets only, inside the HUD-free area', () => {
    const c = { x: 500, y: 400, zoom: 1 };
    const v = { width: 360, height: 640 };
    const insets = { top: 80, right: 6, bottom: 150, left: 6 };
    expect(edgeMarker(c, v, 520, 400, insets)).toBeNull();
    const right = edgeMarker(c, v, 1500, 400, insets)!;
    expect(right.x).toBeCloseTo(360 - 6);
    expect(right.y).toBeGreaterThanOrEqual(80);
    expect(right.y).toBeLessThanOrEqual(640 - 150);
    expect(Math.abs(right.angle)).toBeLessThan(0.1);
    const left = edgeMarker(c, v, -900, 380, insets)!;
    expect(left.x).toBeCloseTo(6);
    expect(Math.abs(left.angle)).toBeGreaterThan(3);
    // Behind the bottom controls counts as off-screen and lands on the bottom inset edge.
    const below = edgeMarker(c, v, 500, 400 + 300, insets)!;
    expect(below.y).toBeCloseTo(640 - 150);
    expect(below.angle).toBeCloseTo(Math.PI / 2);
  });
});
