import { describe, expect, it } from 'vitest';
import {
  AIR,
  carveCircle,
  createTerrain,
  fillRect,
  isSolid,
  materialAt,
  METAL,
  ROCK,
  SOIL,
  surfaceNormal,
} from '../../../src/core/terrain';

describe('terrain', () => {
  it('treats the sides and top as air and below the bottom as solid', () => {
    const t = createTerrain(10, 10);
    expect(materialAt(t, -1, 5)).toBe(AIR);
    expect(materialAt(t, 10, 5)).toBe(AIR);
    expect(materialAt(t, 5, -1)).toBe(AIR);
    expect(isSolid(t, 5, 10)).toBe(true);
  });

  it('carves soil fully, rock only near the center, never metal', () => {
    const t = createTerrain(100, 100);
    fillRect(t, 0, 50, 100, 50, SOIL);
    fillRect(t, 60, 50, 20, 50, ROCK);
    fillRect(t, 0, 90, 100, 10, METAL);
    const rect = carveCircle(t, 50, 60, 30);
    expect(rect).not.toBeNull();
    expect(materialAt(t, 40, 60)).toBe(AIR); // soil inside
    expect(materialAt(t, 75, 60)).toBe(ROCK); // rock at 25 px > 60 % radius
    expect(materialAt(t, 60, 60)).toBe(AIR); // rock at 10 px < 60 % radius
    expect(materialAt(t, 50, 89)).toBe(AIR);
    expect(materialAt(t, 50, 90)).toBe(METAL);
    expect(carveCircle(t, 50, 10, 5)).toBeNull(); // only air
  });

  it('points the surface normal away from the ground', () => {
    const t = createTerrain(40, 40);
    fillRect(t, 0, 20, 40, 20, SOIL);
    const flat = surfaceNormal(t, 20, 20);
    expect(flat.ny).toBeLessThan(0);
    expect(Math.abs(flat.nx)).toBe(0);
    fillRect(t, 25, 0, 15, 40, SOIL);
    const wall = surfaceNormal(t, 25, 10);
    expect(wall.nx).toBeLessThan(0);
  });
});
