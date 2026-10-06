import { describe, expect, it } from 'vitest';
import {
  fatan2,
  fcos,
  fdiv,
  fmul,
  fsin,
  fsqrt,
  fx,
  fxFloor,
  fxRound,
  isqrt,
  normAngle,
  ONE,
} from '../../../src/core/fixed';

describe('fixed-point arithmetic', () => {
  it('multiplies and divides exactly for typical ranges', () => {
    expect(fmul(fx(2.5), fx(4))).toBe(fx(10));
    expect(fmul(fx(-1.5), fx(2))).toBe(fx(-3));
    expect(fmul(fx(1600), fx(0.5))).toBe(fx(800));
    expect(fdiv(fx(10), fx(4))).toBe(fx(2.5));
    expect(fdiv(fx(-9), fx(3))).toBe(fx(-3));
    expect(() => fdiv(ONE, 0)).toThrow();
  });

  it('rounds and floors to integers', () => {
    expect(fxFloor(fx(-0.25))).toBe(-1);
    expect(fxFloor(fx(3.99))).toBe(3);
    expect(fxRound(fx(2.5))).toBe(3);
    expect(fxRound(fx(2.49))).toBe(2);
  });

  it('computes integer square roots', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 1e6, 2 ** 40 + 7]) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
    expect(fsqrt(fx(9))).toBe(fx(3));
  });
});

describe('fixed-point trigonometry (deci-degrees)', () => {
  it('matches the reference within 1/65536 at every angle', () => {
    for (let a = 0; a < 3600; a += 7) {
      const rad = (a * Math.PI) / 1800;
      expect(Math.abs(fsin(a) / ONE - Math.sin(rad))).toBeLessThan(2 / ONE);
      expect(Math.abs(fcos(a) / ONE - Math.cos(rad))).toBeLessThan(2 / ONE);
    }
    expect(fsin(900)).toBe(ONE);
    expect(fcos(1800)).toBe(-ONE);
    expect(fsin(-900)).toBe(-ONE);
  });

  it('normalizes angles', () => {
    expect(normAngle(-10)).toBe(3590);
    expect(normAngle(3605)).toBe(5);
  });

  it('inverts with atan2 in every quadrant', () => {
    for (let a = 0; a < 3600; a += 13) {
      const back = fatan2(fsin(a), fcos(a));
      const diff = Math.min(Math.abs(back - a), 3600 - Math.abs(back - a));
      expect(diff).toBeLessThanOrEqual(1);
    }
  });
});
