import { Graphics } from 'pixi.js';
import { layoutRng } from './backdrop';
import type { Viewport } from './camera';
import type { AmbientKind, Theme } from './themes';

/** Fixed pool size: ambient life never allocates per frame. */
export const AMBIENT_POOL = 40;

const KINDS: readonly AmbientKind[] = ['shooting', 'drift', 'drips', 'embers'];

/** Target population / spawn interval (seconds) per kind. */
const SPEC: Record<AmbientKind, { max: number; every: number }> = {
  shooting: { max: 2, every: 3.2 },
  drift: { max: 16, every: 0.35 },
  drips: { max: 10, every: 0.45 },
  embers: { max: 18, every: 0.3 },
};

/**
 * Screen-space ambient life behind the world: shooting stars, drifting fireflies / spores, falling
 * drips and rising embers. Particles live in preallocated typed arrays; one Graphics is redrawn per
 * frame. Disabled entirely for reduced motion.
 */
export class AmbientLife {
  readonly view = new Graphics();
  private readonly x = new Float32Array(AMBIENT_POOL);
  private readonly y = new Float32Array(AMBIENT_POOL);
  private readonly vx = new Float32Array(AMBIENT_POOL);
  private readonly vy = new Float32Array(AMBIENT_POOL);
  private readonly age = new Float32Array(AMBIENT_POOL);
  private readonly life = new Float32Array(AMBIENT_POOL);
  private readonly phase = new Float32Array(AMBIENT_POOL);
  /** Kind index + 1 per slot (0 = free). */
  private readonly kind = new Uint8Array(AMBIENT_POOL);
  private readonly colorOf = new Uint32Array(KINDS.length);
  private readonly timers = new Float32Array(KINDS.length);
  private readonly enabled = new Uint8Array(KINDS.length);
  private rnd: () => number = layoutRng(1);
  private vp: Viewport = { width: 1, height: 1 };

  constructor(private readonly reducedMotion: boolean) {
    this.view.visible = !reducedMotion;
  }

  setTheme(theme: Theme): void {
    this.kind.fill(0);
    this.enabled.fill(0);
    this.timers.fill(0);
    this.rnd = layoutRng(theme.seed ^ 0xa3b1);
    for (const a of theme.ambient) {
      const k = KINDS.indexOf(a.kind);
      this.enabled[k] = 1;
      this.colorOf[k] = a.color;
      // Stagger the first spawn; shooting stars show up soon after the match starts.
      this.timers[k] = a.kind === 'shooting' ? 0.8 : 0;
    }
    this.view.clear();
  }

  resize(view: Viewport): void {
    this.vp = view;
  }

  /** Number of live particles (tests). */
  get count(): number {
    let n = 0;
    for (let i = 0; i < AMBIENT_POOL; i++) if (this.kind[i] !== 0) n++;
    return n;
  }

  update(dt: number): void {
    if (this.reducedMotion) return;
    const step = Math.min(dt, 0.1);
    for (let k = 0; k < KINDS.length; k++) {
      if (!this.enabled[k]) continue;
      this.timers[k] = (this.timers[k] as number) - step;
      const spec = SPEC[KINDS[k] as AmbientKind];
      if ((this.timers[k] as number) <= 0) {
        this.timers[k] = spec.every * (0.5 + this.rnd());
        if (this.population(k) < spec.max) this.spawn(k);
      }
    }
    const g = this.view;
    g.clear();
    const H = this.vp.height;
    for (let i = 0; i < AMBIENT_POOL; i++) {
      const kp = this.kind[i] as number;
      if (kp === 0) continue;
      const k = kp - 1;
      const age = (this.age[i] as number) + step;
      this.age[i] = age;
      const life = this.life[i] as number;
      if (age >= life) {
        this.kind[i] = 0;
        continue;
      }
      const color = this.colorOf[k] as number;
      const f = age / life;
      let x = this.x[i] as number;
      let y = this.y[i] as number;
      const vx = this.vx[i] as number;
      let vy = this.vy[i] as number;
      switch (KINDS[k]) {
        case 'shooting': {
          x += vx * step;
          y += vy * step;
          const a = f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85;
          g.moveTo(x, y)
            .lineTo(x - vx * 0.12, y - vy * 0.12)
            .stroke({ width: 1.6, color, alpha: a * 0.9 });
          g.circle(x, y, 1.6).fill({ color: 0xffffff, alpha: a });
          break;
        }
        case 'drift': {
          const ph = this.phase[i] as number;
          x += (vx + Math.sin(age * 1.3 + ph) * 9) * step;
          y += (vy + Math.cos(age * 0.9 + ph) * 6) * step;
          const a = Math.sin(f * Math.PI) * (0.55 + 0.45 * Math.sin(age * 4 + ph));
          g.circle(x, y, 4).fill({ color, alpha: 0.12 * a });
          g.circle(x, y, 1.3).fill({ color, alpha: 0.9 * a });
          break;
        }
        case 'drips': {
          vy += 520 * step;
          this.vy[i] = vy;
          x += vx * step;
          y += vy * step;
          const a = Math.min(1, (1 - f) * 3) * 0.75;
          g.moveTo(x, y - Math.min(10, 1.5 + vy * 0.02))
            .lineTo(x, y)
            .stroke({ width: 1.3, color, alpha: a });
          if (y > H) this.kind[i] = 0;
          break;
        }
        case 'embers': {
          const ph = this.phase[i] as number;
          x += (vx + Math.sin(age * 2 + ph) * 12) * step;
          y += vy * step;
          const a = Math.sin(f * Math.PI) * 0.8;
          g.rect(x - 0.9, y - 0.9, 1.8, 1.8).fill({ color, alpha: a });
          break;
        }
        default:
          break;
      }
      this.x[i] = x;
      this.y[i] = y;
    }
  }

  private population(k: number): number {
    let n = 0;
    for (let i = 0; i < AMBIENT_POOL; i++) if (this.kind[i] === k + 1) n++;
    return n;
  }

  private spawn(k: number): void {
    let i = 0;
    while (i < AMBIENT_POOL && this.kind[i] !== 0) i++;
    if (i === AMBIENT_POOL) return;
    const { width: W, height: H } = this.vp;
    const r = this.rnd;
    this.kind[i] = k + 1;
    this.age[i] = 0;
    this.phase[i] = r() * 6.28;
    switch (KINDS[k]) {
      case 'shooting': {
        const dir = r() < 0.5 ? -1 : 1;
        const sp = 380 + r() * 260;
        this.x[i] = dir > 0 ? r() * W * 0.6 : W * 0.4 + r() * W * 0.6;
        this.y[i] = H * (0.06 + r() * 0.22);
        this.vx[i] = dir * sp;
        this.vy[i] = sp * (0.25 + r() * 0.25);
        this.life[i] = 0.7 + r() * 0.4;
        break;
      }
      case 'drift':
        this.x[i] = r() * W;
        this.y[i] = H * (0.15 + r() * 0.6);
        this.vx[i] = (r() - 0.5) * 14;
        this.vy[i] = (r() - 0.6) * 8;
        this.life[i] = 4 + r() * 4;
        break;
      case 'drips':
        this.x[i] = r() * W;
        this.y[i] = H * (0.05 + r() * 0.2);
        this.vx[i] = 0;
        this.vy[i] = 0;
        this.life[i] = 2.2;
        break;
      case 'embers':
        this.x[i] = r() * W;
        this.y[i] = H * (0.4 + r() * 0.6);
        this.vx[i] = (r() - 0.5) * 10;
        this.vy[i] = -(14 + r() * 24);
        this.life[i] = 4 + r() * 4;
        break;
      default:
        break;
    }
  }
}
