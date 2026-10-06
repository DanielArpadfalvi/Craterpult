import { describe, expect, it } from 'vitest';
import { EdgeIndicators, mergeMarkers } from '../../../src/render/indicators';

describe('edge indicators', () => {
  it('merges overlapping markers of the same team only', () => {
    const a = { x: 354, y: 200, angle: 0, color: 1 };
    const b = { x: 354, y: 210, angle: 0, color: 1 };
    const c = { x: 354, y: 205, angle: 0, color: 2 };
    const d = { x: 354, y: 300, angle: 0, color: 1 };
    expect(mergeMarkers([a, b, c, d])).toEqual([a, c, d]);
  });

  it('draws arrows and clears when there is nothing to point at', () => {
    const ind = new EdgeIndicators();
    ind.draw([{ x: 354, y: 200, angle: 0, color: 0x3ef0ff }], 1 / 60);
    expect(ind.view.bounds.width).toBeGreaterThan(0);
    ind.draw([], 1 / 60);
    expect(ind.view.bounds.width).toBe(0);
  });
});
