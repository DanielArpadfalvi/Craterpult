import { describe, expect, it } from 'vitest';
import { aimFromDrag, MAX_DRAG_PX, previewArc } from '../../../src/input/aim';

describe('slingshot aim', () => {
  it('shoots opposite to the drag', () => {
    // Drag left → shoot right.
    expect(aimFromDrag(100, 100, 30, 100)).toEqual({ angle: 0, power: 50 });
    // Drag down → shoot up.
    expect(aimFromDrag(100, 100, 100, 100 + MAX_DRAG_PX).angle).toBe(900);
    // Drag down-right → shoot up-left (135°).
    expect(aimFromDrag(100, 100, 150, 150).angle).toBe(1350);
  });

  it('caps power at 100 and is 0 for no drag', () => {
    expect(aimFromDrag(0, 0, 1000, 0).power).toBe(100);
    expect(aimFromDrag(5, 5, 5, 5).power).toBe(0);
  });

  it('previews an arc that rises then falls', () => {
    const pts = previewArc({ angle: 450, power: 100 }, 14, 0.15, 120);
    expect(pts[0]!.x).toBeGreaterThan(0);
    expect(pts[0]!.y).toBeLessThan(0);
    const minY = Math.min(...pts.map((p) => p.y));
    expect(pts.at(-1)!.y).toBeGreaterThan(minY);
  });
});
