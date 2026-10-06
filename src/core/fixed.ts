/**
 * Fixed-point math for the simulation (Q16.16 stored in plain JS integers).
 *
 * Only exactly-specified IEEE operations (+, −, ×, ÷ on integers below 2^53, floor/trunc) are used,
 * so every platform computes bit-identical results. Transcendental `Math.*` functions are
 * implementation-defined and banned in `src/core` (see eslint config).
 */

export const FX_SHIFT = 16;
export const ONE = 1 << FX_SHIFT;
export const HALF = ONE >> 1;

/** Integer (or exact small rational) → fixed. Only use on compile-time constants / integers. */
export function fx(n: number): number {
  return Math.round(n * ONE);
}

/** Fixed → integer (floor). */
export function fxFloor(a: number): number {
  return Math.floor(a / ONE);
}

/** Fixed → integer (round half up). */
export function fxRound(a: number): number {
  return Math.floor((a + HALF) / ONE);
}

/** Fixed → float, for rendering only (never feed back into the simulation). */
export function fxToFloat(a: number): number {
  return a / ONE;
}

/** a × b for fixed values; exact while |a| < 2^37. */
export function fmul(a: number, b: number): number {
  const bh = Math.floor(b / ONE);
  const bl = b - bh * ONE;
  return a * bh + Math.floor((a * bl) / ONE);
}

/** a ÷ b for fixed values (truncates toward zero). */
export function fdiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('fdiv: division by zero');
  return Math.trunc((a * ONE) / b);
}

/** Integer square root: floor(√n) for a non-negative integer n < 2^53. */
export function isqrt(n: number): number {
  if (n < 0) throw new RangeError('isqrt: negative');
  if (n < 2) return n;
  // Newton iteration on integers, starting above the root.
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** √a for a fixed value. */
export function fsqrt(a: number): number {
  return isqrt(a * ONE);
}

/** Length of the fixed vector (x, y). */
export function flen(x: number, y: number): number {
  return isqrt(x * x + y * y);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------------------------------------
// Angles: integer deci-degrees, 0 = +x (right), counter-clockwise (up is 900).
// ---------------------------------------------------------------------------------------------

export const FULL_TURN = 3600;

const SIN_TABLE: Int32Array = buildSinTable();

/** Taylor series with exact arithmetic only, rounded to Q16. Deterministic on every engine. */
function buildSinTable(): Int32Array {
  const table = new Int32Array(901);
  const pi = 3.141592653589793;
  for (let i = 0; i <= 900; i++) {
    const x = (i * pi) / 1800;
    let term = x;
    let sum = x;
    for (let k = 1; k < 12; k++) {
      term = (-term * x * x) / (2 * k * (2 * k + 1));
      sum += term;
    }
    table[i] = Math.round(sum * ONE);
  }
  return table;
}

export function normAngle(a: number): number {
  const r = a % FULL_TURN;
  return r < 0 ? r + FULL_TURN : r;
}

/** sin(angle) in Q16 for an integer angle in deci-degrees. */
export function fsin(angle: number): number {
  const a = normAngle(Math.trunc(angle));
  if (a <= 900) return SIN_TABLE[a] as number;
  if (a <= 1800) return SIN_TABLE[1800 - a] as number;
  if (a <= 2700) return -(SIN_TABLE[a - 1800] as number);
  return -(SIN_TABLE[3600 - a] as number);
}

export function fcos(angle: number): number {
  return fsin(angle + 900);
}

/** atan2(y, x) in deci-degrees [0, 3600) (binary search on the sine table). */
export function fatan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // Angle in the first quadrant: find a in [0, 900] with tan(a) ≈ ay/ax.
  let lo = 0;
  let hi = 900;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // Compare ay/ax with sin(mid)/cos(mid) without division.
    if (ay * (SIN_TABLE[900 - mid] as number) > ax * (SIN_TABLE[mid] as number)) lo = mid + 1;
    else hi = mid;
  }
  const q = lo;
  if (x >= 0 && y >= 0) return q;
  if (x < 0 && y >= 0) return 1800 - q;
  if (x < 0 && y < 0) return 1800 + q;
  return normAngle(3600 - q);
}
