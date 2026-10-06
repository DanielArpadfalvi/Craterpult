import { Container, Graphics } from 'pixi.js';
import type { Camera, Viewport } from './camera';
import { mix } from './color';
import type { Theme } from './themes';

/** Parallax factors (0 = moves with the world, 1 = fixed to the screen) of the two layers. */
export const PARALLAX = {
  far: { x: 0.55, y: 0.3 },
  near: { x: 0.3, y: 0.15 },
} as const;

/** Small deterministic PRNG (mulberry32) for backdrop layout; the renderer may not use core RNG. */
export function layoutRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Everything behind the terrain: a screen-space sky (gradient, stars, sun / moon / aurora, sea
 * plane) that follows the horizon, and two world-space parallax silhouette layers. All geometry is
 * built once per theme / resize; `update` only moves containers and animates alphas.
 */
export class Backdrop {
  /** Screen-space part, added behind the world container. */
  readonly screen = new Container();
  /** World-space silhouettes, added as the first children of the world container. */
  readonly far = new Graphics();
  readonly near = new Graphics();
  /** Blinking beacons (antenna tips, buoys) on the near layer. */
  private readonly beacons = new Graphics();
  private readonly skyBack = new Container();
  private readonly skyFront = new Container();
  private readonly skyG = new Graphics();
  private readonly twinkle = new Graphics();
  private readonly aurora = new Graphics();
  private readonly celestial = new Graphics();
  /** Sun / moon disc, drawn around (0, 0) and placed each frame. */
  private readonly orb = new Graphics();
  private theme: Theme | null = null;
  private mapW = 1600;
  private mapH = 900;
  private view: Viewport = { width: 1, height: 1 };

  constructor() {
    this.skyBack.addChild(this.skyG, this.twinkle);
    this.skyFront.addChild(this.celestial);
    this.screen.addChild(this.skyBack, this.aurora, this.skyFront, this.orb);
    this.near.addChild(this.beacons);
    this.aurora.blendMode = 'add';
  }

  setTheme(theme: Theme, mapW: number, mapH: number): void {
    this.theme = theme;
    this.mapW = mapW;
    this.mapH = mapH;
    this.drawSilhouettes();
    this.drawScreen();
  }

  resize(view: Viewport): void {
    this.view = view;
    this.drawScreen();
  }

  /** Position the layers for a camera; `time` animates twinkle / aurora unless `still`. */
  update(cam: Camera, time: number, still: boolean): void {
    const t = this.theme;
    if (!t) return;
    const vh = this.view.height;
    const fx = (cam.x - this.mapW / 2) * PARALLAX.far.x;
    const fy = (cam.y - this.mapH / 2) * PARALLAX.far.y;
    this.far.position.set(fx, fy);
    this.near.position.set(
      (cam.x - this.mapW / 2) * PARALLAX.near.x,
      (cam.y - this.mapH / 2) * PARALLAX.near.y,
    );
    // The horizon line lives in the far layer; the screen-space sky follows it.
    const hy = (t.horizon * this.mapH + fy - cam.y) * cam.zoom + vh / 2;
    this.skyBack.position.set(0, hy);
    const px = -(cam.x - this.mapW / 2) * cam.zoom * 0.04;
    this.skyFront.position.set(px, hy);
    // The sun sits on the horizon; the moon rides higher but stays clear of the HUD while it can.
    const r = t.celestial.r * Math.min(this.view.width, vh);
    const oy =
      t.celestial.kind === 'sun'
        ? hy - r * 0.85
        : Math.max(hy - vh * 0.3, Math.min(vh * 0.24, hy - r * 1.4));
    this.orb.position.set(t.celestial.x * this.view.width + px, oy);
    this.aurora.position.set(-cam.x * 0.05, 0);
    if (still) {
      this.twinkle.alpha = 0.8;
      this.aurora.alpha = 0.85;
      this.beacons.alpha = 1;
    } else {
      this.twinkle.alpha = 0.55 + 0.45 * Math.sin(time * 1.9);
      this.aurora.alpha = 0.72 + 0.28 * Math.sin(time * 0.6);
      this.beacons.alpha = Math.sin(time * 3) > -0.2 ? 1 : 0.15;
    }
  }

  // -------------------------------------------------------------------------------------------

  private drawScreen(): void {
    const t = this.theme;
    if (!t) return;
    const { width: W, height: H } = this.view;
    const rnd = layoutRng(t.seed ^ 0x51a7);

    // Sky gradient ending at the horizon (y = 0 of skyBack), ground color below it.
    const g = this.skyG;
    g.clear();
    const span = H * 1.1;
    g.rect(-10, -H * 5, W + 20, H * 5 - span + 1).fill(t.sky[0]);
    const bands = 64;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      const c =
        k < 0.55 ? mix(t.sky[0], t.sky[1], k / 0.55) : mix(t.sky[1], t.sky[2], (k - 0.55) / 0.45);
      g.rect(-10, -span + (span * i) / bands, W + 20, span / bands + 1).fill(c);
    }
    // Only a strip below the horizon: the far silhouettes (or the sea) cover the rest, and every
    // full-screen layer costs fill rate on low-end GPUs.
    g.rect(-10, 0, W + 20, H * 0.25).fill(t.ground);

    // Stars ride with the sky gradient; a slice of them twinkles.
    this.twinkle.clear();
    const count = Math.round((t.stars.count * (W * H)) / (390 * 844));
    for (let i = 0; i < count; i++) {
      const x = rnd() * (W + 40) - 20;
      const yk = rnd();
      const y = -span + yk * yk * span * 0.85;
      const big = rnd() < 0.1;
      const a = (0.25 + rnd() * 0.6) * (1 - yk * 0.5);
      const target = rnd() < 0.25 ? this.twinkle : g;
      target
        .rect(x - (big ? 1.4 : 0.8), y - (big ? 1.4 : 0.8), big ? 2.8 : 1.6, big ? 2.8 : 1.6)
        .fill({ color: t.stars.color, alpha: a });
      if (big && target === this.twinkle) {
        target
          .moveTo(x - 4, y)
          .lineTo(x + 4, y)
          .moveTo(x, y - 4)
          .lineTo(x, y + 4)
          .stroke({ width: 0.6, color: t.stars.color, alpha: a * 0.6 });
      }
    }

    // Aurora curtains: vertical strokes, brightest at the lower hem, fading upward.
    this.aurora.clear();
    if (t.aurora) {
      const [ca, cb] = t.aurora;
      const ph = rnd() * 6;
      const hem = (x: number): number =>
        H * 0.26 + Math.sin(x * 0.011 + ph) * H * 0.07 + Math.sin(x * 0.037 + ph * 2) * H * 0.02;
      const len = (x: number): number => H * (0.14 + 0.07 * Math.sin(x * 0.019 + ph * 3));
      const buckets = 8;
      const fades = [0.2, 0.1, 0.045];
      for (let b = 0; b < buckets; b++) {
        const color = mix(ca, cb, (b + 0.5) / buckets);
        for (let seg = 0; seg < fades.length; seg++) {
          for (let x = -20; x < W + 20; x += 3) {
            const k = (x + 20) / (W + 40);
            if (Math.min(buckets - 1, Math.floor(k * buckets)) !== b) continue;
            const y0 = hem(x);
            const l = len(x);
            this.aurora.moveTo(x, y0 - (l * seg) / 3).lineTo(x, y0 - (l * (seg + 1)) / 3);
          }
          this.aurora.stroke({ width: 2.4, color, alpha: fades[seg] as number });
        }
      }
      for (let x = -20; x <= W + 20; x += 8) {
        if (x === -20) this.aurora.moveTo(x, hem(x));
        else this.aurora.lineTo(x, hem(x));
      }
      this.aurora.stroke({ width: 3, color: ca, alpha: 0.22 });
    }

    // Sun / moon (+ the sea plane for the islands theme).
    const c = this.celestial;
    c.clear();
    const base = Math.min(W, H);
    const cx = t.celestial.x * W;
    const r = t.celestial.r * base;
    if (t.skyline === 'islands') this.drawSea(c, W, H, cx, r);
    this.orb.clear();
    if (t.celestial.kind === 'sun') this.drawSun(this.orb, 0, 0, r);
    else if (t.celestial.kind === 'moon') this.drawMoon(this.orb, 0, 0, r, rnd);
  }

  private drawSun(g: Graphics, cx: number, cy: number, r: number): void {
    const t = this.theme as Theme;
    const [top, bottom] = t.celestial.colors;
    glow(g, cx, cy, r * 1.3, bottom, 0.1, 2);
    const bands = Math.max(34, Math.round(r / 2.2));
    const bh = (2 * r) / bands;
    for (let j = 0; j < bands; j++) {
      const k = j / (bands - 1);
      const y = cy - r + j * bh;
      const mid = y + bh / 2 - cy;
      const hw = Math.sqrt(Math.max(0, r * r - mid * mid)) + 1;
      const gap = k > 0.42 ? Math.min(0.8, (k - 0.42) * 1.5) : 0;
      if (hw < 0.5) continue;
      // Trapezoid per band (exact chord at its top and bottom) keeps the disc edge smooth.
      const h = bh * (1 - gap) + 0.4;
      const chord = (yy: number): number => Math.sqrt(Math.max(0, r * r - (yy - cy) * (yy - cy)));
      const wt = chord(y);
      const wb = chord(y + h);
      g.poly([cx - wt, y, cx + wt, y, cx + wb, y + h, cx - wb, y + h]).fill(mix(top, bottom, k));
    }
  }

  private drawMoon(g: Graphics, cx: number, cy: number, r: number, rnd: () => number): void {
    const t = this.theme as Theme;
    const [lit, shade] = t.celestial.colors;
    glow(g, cx, cy, r * 1.9, lit, 0.06, 3);
    g.circle(cx, cy, r).fill(lit);
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * r * 0.6;
      g.circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.07 + rnd() * 0.1)).fill({
        color: shade,
        alpha: 0.22,
      });
    }
  }

  /** Sea plane below the horizon with perspective swell lines and the moon path. */
  private drawSea(g: Graphics, W: number, H: number, mx: number, r: number): void {
    const t = this.theme as Theme;
    const deep = mix(t.ground, 0x000000, 0.55);
    const bands = 16;
    const depth = H * 0.9;
    for (let i = 0; i < bands; i++) {
      g.rect(-W, (depth * i) / bands, W * 3, depth / bands + 1).fill(
        mix(t.ground, deep, i / (bands - 1)),
      );
    }
    g.rect(-W, depth, W * 3, H * 4).fill(deep);
    for (let k = 1; k < 18; k++) {
      const y = 1.6 * k ** 1.7;
      g.moveTo(-W, y).lineTo(W * 2, y);
    }
    g.stroke({ width: 1, color: t.far.edge, alpha: 0.08 });
    g.moveTo(-W, 0.5)
      .lineTo(W * 2, 0.5)
      .stroke({ width: 1.2, color: t.far.edge, alpha: 0.5 });
    if (t.celestial.kind === 'moon') {
      const lit = t.celestial.colors[0];
      for (let k = 0; k < 22; k++) {
        const y = 3 + 1.4 * k ** 1.6;
        const w = r * (0.5 + 0.08 * k) * (0.6 + 0.4 * Math.sin(k * 2.3) ** 2);
        g.rect(mx - w / 2, y, w, 1 + k * 0.12).fill({ color: lit, alpha: 0.5 - k * 0.018 });
      }
    }
  }

  private drawSilhouettes(): void {
    const t = this.theme as Theme;
    this.far.clear();
    this.near.clear();
    this.beacons.clear();
    const rnd = layoutRng(t.seed);
    switch (t.skyline) {
      case 'hills':
        this.drawHills(rnd);
        break;
      case 'islands':
        this.drawIslands(rnd);
        break;
      case 'cavern':
        this.drawCavern(rnd);
        break;
      case 'city':
        this.drawCity(rnd);
        break;
      case 'mesas':
        this.drawMesas(rnd);
        break;
    }
  }

  /** Fill below an open skyline `top` (flat x,y pairs) and stroke its neon contour. */
  private ridge(
    g: Graphics,
    top: number[],
    color: number,
    edge: number,
    edgeAlpha: number,
    width = 1.6,
  ): void {
    const bottom = this.mapH * 4;
    g.poly([top[0] as number, bottom, ...top, top[top.length - 2] as number, bottom]).fill(color);
    g.poly(top, false).stroke({ width, color: edge, alpha: edgeAlpha });
  }

  private xRange(): [number, number] {
    return [-this.mapW * 0.7, this.mapW * 1.7];
  }

  private drawHills(rnd: () => number): void {
    const t = this.theme as Theme;
    const H = this.mapH;
    const hz = t.horizon * H;
    const [x0, x1] = this.xRange();
    const wave = (
      base: number,
      amp: number,
      f: number,
      ph: number,
      ph2: number,
      shift = 0,
    ): number[] => {
      const pts: number[] = [];
      for (let x = x0; x <= x1; x += 24) {
        const s = 0.5 + 0.5 * Math.sin(x * f + ph);
        const y = base - amp * (s * s) - amp * 0.25 * Math.sin(x * f * 2.6 + ph2) + shift;
        pts.push(x, y);
      }
      return pts;
    };
    const p1 = rnd() * 6;
    const p2 = rnd() * 6;
    const far = wave(hz + 4, H * 0.1, 0.0042, p1, p2);
    this.ridge(this.far, far, t.far.color, t.far.edge, t.far.edgeAlpha, 2);
    // Wireframe contour lines below the crest, fading with depth.
    for (let k = 1; k <= 3; k++) {
      this.far
        .poly(wave(hz + 4, H * 0.1 * (1 - k * 0.18), 0.0042, p1, p2, k * k * 6), false)
        .stroke({ width: 1, color: t.far.edge, alpha: t.far.edgeAlpha * (0.45 - k * 0.08) });
    }
    const q1 = rnd() * 6;
    const q2 = rnd() * 6;
    const near = wave(hz + H * 0.15, H * 0.09, 0.0068, q1, q2);
    this.ridge(this.near, near, t.near.color, t.near.edge, t.near.edgeAlpha, 1.6);
    for (let k = 1; k <= 2; k++) {
      this.near
        .poly(wave(hz + H * 0.15, H * 0.09 * (1 - k * 0.22), 0.0068, q1, q2, k * k * 8), false)
        .stroke({ width: 1, color: t.near.edge, alpha: t.near.edgeAlpha * (0.5 - k * 0.12) });
    }
  }

  private drawIslands(rnd: () => number): void {
    const t = this.theme as Theme;
    const H = this.mapH;
    const hz = t.horizon * H;
    const [x0, x1] = this.xRange();
    let x = x0 + rnd() * 200;
    while (x < x1) {
      const w = 70 + rnd() * 200;
      const h = 10 + rnd() * 34;
      const pts: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        const bump = Math.sin(k * Math.PI) ** 0.7 * (1 + 0.15 * Math.sin(k * 17 + w));
        pts.push(x + k * w, hz - h * bump);
      }
      this.far.poly([x, hz + 2, ...pts, x + w, hz + 2]).fill(t.far.color);
      this.far.poly(pts, false).stroke({ width: 1.2, color: t.far.edge, alpha: t.far.edgeAlpha });
      if (rnd() < 0.55)
        this.palm(this.far, x + w * (0.3 + rnd() * 0.4), hz - h * 0.95, 16 + h * 0.4, rnd);
      x += w + 120 + rnd() * 320;
    }
    // Nearer sea stacks with buoy lights.
    const nz = hz + H * 0.07;
    x = x0 + rnd() * 300;
    while (x < x1) {
      const w = 30 + rnd() * 60;
      const h = 30 + rnd() * 60;
      const pts = [
        x,
        nz,
        x + w * 0.2,
        nz - h * 0.7,
        x + w * 0.45,
        nz - h,
        x + w * 0.7,
        nz - h * 0.8,
        x + w,
        nz,
      ];
      this.near.poly(pts).fill(t.near.color);
      this.near.poly(pts.slice(0, 10), false).stroke({
        width: 1.2,
        color: t.near.edge,
        alpha: t.near.edgeAlpha,
      });
      const bx = x + w + 30 + rnd() * 60;
      this.near.rect(bx - 1, nz - 14, 2, 14).fill(t.near.color);
      this.beacons.circle(bx, nz - 16, 2.2).fill(t.accents[0] ?? 0xffffff);
      this.beacons.circle(bx, nz - 16, 6).fill({ color: t.accents[0] ?? 0xffffff, alpha: 0.18 });
      x += w + 380 + rnd() * 500;
    }
  }

  private palm(g: Graphics, x: number, y: number, h: number, rnd: () => number): void {
    const t = this.theme as Theme;
    const lean = (rnd() - 0.5) * h * 0.6;
    const tx = x + lean;
    const ty = y - h;
    g.moveTo(x, y).quadraticCurveTo(x + lean * 0.2, y - h * 0.6, tx, ty);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.1 + (i / 4) * 0.8);
      const len = h * (0.45 + rnd() * 0.2);
      g.moveTo(tx, ty).quadraticCurveTo(
        tx - Math.cos(a) * len * 0.6,
        ty - len * 0.35,
        tx - Math.cos(a) * len,
        ty + len * 0.25 - Math.sin(a) * len * 0.15,
      );
    }
    g.stroke({ width: 1.6, color: t.far.color });
    g.stroke({ width: 0.6, color: t.far.edge, alpha: t.far.edgeAlpha * 0.6 });
  }

  private drawCavern(rnd: () => number): void {
    const t = this.theme as Theme;
    const H = this.mapH;
    const [x0, x1] = this.xRange();
    // Distant hazy columns joining ceiling and floor (depth between the walls).
    const haze = mix(t.far.color, t.sky[2], 0.4);
    let cx = x0 + rnd() * 200;
    while (cx < x1) {
      const w = 26 + rnd() * 50;
      const left: number[] = [];
      const right: number[] = [];
      for (let y = 0; y <= H * 0.8; y += 30) {
        const pinch = 1 - 0.45 * Math.sin((y / (H * 0.8)) * Math.PI);
        const wob = Math.sin(y * 0.03 + cx) * 4;
        left.push(cx - (w / 2) * pinch + wob, y);
        right.unshift(cx + (w / 2) * pinch + wob, y);
      }
      this.far.poly([...left, ...right]).fill(haze);
      this.far
        .poly(left, false)
        .stroke({ width: 1, color: t.far.edge, alpha: t.far.edgeAlpha * 0.35 });
      this.far
        .poly(right, false)
        .stroke({ width: 1, color: t.far.edge, alpha: t.far.edgeAlpha * 0.2 });
      cx += w + 110 + rnd() * 220;
    }
    // Far wall: ceiling with stalactites, floor with stalagmites.
    const ceil: number[] = [];
    const floor: number[] = [];
    for (let x = x0; x <= x1; x += 22) {
      const base = H * 0.2 + Math.sin(x * 0.006 + 1) * H * 0.05;
      const spike = rnd() < 0.28 ? H * (0.06 + rnd() * 0.16) : rnd() * H * 0.025;
      ceil.push(x, base + spike);
      const fb = H * 0.62 + Math.sin(x * 0.005 + 3) * H * 0.06;
      const mite = rnd() < 0.15 ? H * (0.03 + rnd() * 0.07) : rnd() * H * 0.02;
      floor.push(x, fb - mite);
    }
    const top = -H * 4;
    this.far
      .poly([ceil[0] as number, top, ...ceil, ceil[ceil.length - 2] as number, top])
      .fill(t.far.color);
    this.far.poly(ceil, false).stroke({ width: 1.5, color: t.far.edge, alpha: t.far.edgeAlpha });
    this.ridge(this.far, floor, t.far.color, t.far.edge, t.far.edgeAlpha, 1.5);
    // Crystal clusters on both walls.
    for (let i = 0; i < 64; i++) {
      const onFloor = i % 2 === 0;
      const src = onFloor ? floor : ceil;
      const k = Math.floor(rnd() * (src.length / 2 - 1));
      const cx = src[k * 2] as number;
      const cy = (src[k * 2 + 1] as number) + (onFloor ? 4 : -4);
      const color = t.accents[Math.floor(rnd() * t.accents.length)] ?? 0xffffff;
      this.crystals(this.far, cx, cy, onFloor ? -1 : 1, 0.7 + rnd() * 0.8, color, rnd);
    }
    // Near: big dark stalactites and columns with brighter crystals.
    let x = x0 + rnd() * 200;
    while (x < x1) {
      const w = 40 + rnd() * 70;
      const len = H * (0.12 + rnd() * 0.22);
      const pts = [
        x,
        top,
        x,
        H * 0.04,
        x + w * 0.3,
        len * 0.6,
        x + w * 0.5,
        len,
        x + w * 0.65,
        len * 0.55,
        x + w,
        H * 0.05,
        x + w,
        top,
      ];
      this.near.poly(pts).fill(t.near.color);
      this.near.poly(pts.slice(2, 12), false).stroke({
        width: 1.2,
        color: t.near.edge,
        alpha: t.near.edgeAlpha,
      });
      if (rnd() < 0.6) {
        const color = t.accents[Math.floor(rnd() * t.accents.length)] ?? 0xffffff;
        this.crystals(this.near, x + w * 0.5, len - 6, 1, 1.1, color, rnd);
      }
      x += w + 220 + rnd() * 380;
    }
  }

  /** A cluster of glowing crystal shards; `dir` -1 points up, 1 points down. */
  private crystals(
    g: Graphics,
    x: number,
    y: number,
    dir: number,
    scale: number,
    color: number,
    rnd: () => number,
  ): void {
    glow(g, x, y + dir * 8 * scale, 24 * scale, color, 0.025, 6);
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * 1.1;
      const len = (8 + rnd() * 12) * scale;
      const w = (2 + rnd() * 2) * scale;
      const bx = x + (i - n / 2) * 3 * scale;
      const tx = bx + Math.sin(a) * len;
      const ty = y + dir * Math.cos(a) * len;
      const nx = Math.cos(a) * w;
      const pts = [
        bx - nx,
        y,
        (bx + tx) / 2 - nx * 0.9,
        (y + ty) / 2,
        tx,
        ty,
        (bx + tx) / 2 + nx * 0.9,
        (y + ty) / 2,
        bx + nx,
        y,
      ];
      g.poly(pts).fill({ color, alpha: 0.75 }).stroke({ width: 0.8, color: 0xffffff, alpha: 0.45 });
    }
  }

  private drawCity(rnd: () => number): void {
    const t = this.theme as Theme;
    const H = this.mapH;
    const hz = t.horizon * H;
    const [x0, x1] = this.xRange();
    const skyline = (
      g: Graphics,
      layer: { color: number; edge: number; edgeAlpha: number },
      base: number,
      minH: number,
      maxH: number,
      winAlpha: number,
      lit: number,
      beacons: boolean,
    ): void => {
      const top: number[] = [];
      const windows: number[][] = t.accents.map(() => []);
      let x = x0;
      while (x < x1) {
        const w = 26 + Math.floor(rnd() * 50);
        const h = minH + rnd() * (maxH - minH);
        const y = base - h;
        top.push(x, y, x + w, y);
        const cols = Math.floor((w - 6) / 7);
        for (let r = y + 6; r < base - 6; r += 9) {
          for (let c = 0; c < cols; c++) {
            if (rnd() < lit) {
              const bucket = windows[Math.floor(rnd() * windows.length)] as number[];
              bucket.push(x + 4 + c * 7, r);
            }
          }
        }
        if (rnd() < 0.3) {
          // Antenna (with a beacon on the near layer).
          const ax = x + w * (0.3 + rnd() * 0.4);
          const ah = 12 + rnd() * 26;
          g.rect(ax - 0.75, y - ah, 1.5, ah).fill(layer.color);
          if (beacons) {
            this.beacons.circle(ax, y - ah, 1.8).fill(0xff3b5c);
            this.beacons.circle(ax, y - ah, 5).fill({ color: 0xff3b5c, alpha: 0.2 });
          }
        }
        x += w + (rnd() < 0.25 ? 6 + rnd() * 20 : 0);
      }
      this.ridge(g, top, layer.color, layer.edge, layer.edgeAlpha, 1.2);
      windows.forEach((pts, i) => {
        if (pts.length === 0) return;
        for (let k = 0; k < pts.length; k += 2)
          g.rect(pts[k] as number, pts[k + 1] as number, 3, 4);
        g.fill({ color: t.accents[i] ?? 0xffffff, alpha: winAlpha });
      });
    };
    skyline(this.far, t.far, hz + 6, H * 0.08, H * 0.3, 0.32, 0.18, false);
    skyline(this.near, t.near, hz + H * 0.16, H * 0.06, H * 0.26, 0.8, 0.2, true);
  }

  private drawMesas(rnd: () => number): void {
    const t = this.theme as Theme;
    const H = this.mapH;
    const hz = t.horizon * H;
    const [x0, x1] = this.xRange();
    const range = (
      g: Graphics,
      layer: { color: number; edge: number; edgeAlpha: number },
      base: number,
      minH: number,
      maxH: number,
      gap: number,
    ): void => {
      const top: number[] = [];
      const strata: number[][] = [];
      let x = x0;
      top.push(x, base);
      while (x < x1) {
        x += gap * (0.4 + rnd());
        const w = 60 + rnd() * 220;
        const h = minH + rnd() * (maxH - minH);
        const slope = 14 + rnd() * 20;
        const y = base - h;
        top.push(x, base, x + slope * 0.4, base - h * 0.55, x + slope, y, x + w - slope, y);
        top.push(x + w - slope * 0.5, base - h * 0.6, x + w, base);
        for (let s = y + 8; s < base - 4; s += 7 + rnd() * 6) {
          const k = (s - y) / h;
          strata.push([x + slope * (1 - k) * 0.9, s, x + w - slope * (1 - k) * 0.6, s]);
        }
        x += w;
      }
      top.push(x1 + 40, base);
      this.ridge(g, top, layer.color, layer.edge, layer.edgeAlpha, 1.4);
      for (const [a, b, c, d] of strata)
        g.moveTo(a as number, b as number).lineTo(c as number, d as number);
      g.stroke({ width: 1, color: layer.edge, alpha: layer.edgeAlpha * 0.25 });
    };
    range(this.far, t.far, hz + 2, H * 0.05, H * 0.16, 160);
    range(this.near, t.near, hz + H * 0.15, H * 0.08, H * 0.2, 420);
  }
}

/** Soft radial glow as stacked translucent discs (smooth falloff, drawn once). */
function glow(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha: number,
  steps: number,
): void {
  for (let i = 0; i < steps; i++) g.circle(x, y, r * (1 - i / steps)).fill({ color, alpha });
}
