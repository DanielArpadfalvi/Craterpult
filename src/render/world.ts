import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { UNIT_HEIGHT } from '../core/constants';
import { fxToFloat } from '../core/fixed';
import type { MatchEvent, MatchState, WeaponId } from '../core/types';
import type { Camera, Viewport } from './camera';
import { drawHat, type HatStyle } from './hats';
import { PALETTE, TEAM_SHAPES, teamColor } from './palette';
import { inflate, paintTerrain } from './terrainPaint';

interface UnitView {
  root: Container;
  body: Graphics;
  eyes: Graphics;
  label: Text;
  shownHp: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  color: number;
  size: number;
}

interface Blast {
  x: number;
  y: number;
  r: number;
  age: number;
}

interface FloatText {
  view: Text;
  age: number;
}

interface ShotLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
}

/** Previous-tick positions for interpolation, keyed by unit / projectile id. */
export interface Snapshot {
  units: Map<number, { x: number; y: number }>;
  projectiles: Map<number, { x: number; y: number }>;
}

export function snapshot(s: MatchState): Snapshot {
  const units = new Map<number, { x: number; y: number }>();
  for (const u of s.units) units.set(u.id, { x: u.x, y: u.y });
  const projectiles = new Map<number, { x: number; y: number }>();
  for (const p of s.projectiles) projectiles.set(p.id, { x: p.x, y: p.y });
  return { units, projectiles };
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Draws a match: sky, parallax hills, the terrain texture (updated per crater), units, projectiles,
 * effects and the water. Reads core state; never mutates it.
 */
export class WorldView {
  readonly root = new Container();
  private readonly sky = new Graphics();
  private readonly stars = new Graphics();
  readonly world = new Container();
  private readonly hills = new Graphics();
  private terrainSprite: Sprite | null = null;
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainImage: ImageData | null = null;
  private terrainPixels: Uint32Array | null = null;
  private terrainTexture: Texture | null = null;
  private readonly unitLayer = new Container();
  private readonly projectiles = new Graphics();
  private readonly fx = new Graphics();
  private readonly aim = new Graphics();
  private readonly water = new Graphics();
  private readonly textLayer = new Container();
  private units = new Map<number, UnitView>();
  private particles: Particle[] = [];
  private blasts: Blast[] = [];
  private texts: FloatText[] = [];
  private shots: ShotLine[] = [];
  private time = 0;
  private shake = 0;
  private target: { x: number; y: number; age: number } | null = null;
  /** No screen shake for players who asked the OS for reduced motion. */
  private readonly osReducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Reduced motion (OS or in-app setting): no shake, fewer particles. */
  private reducedMotion = this.osReducedMotion;
  /** Per-team color and hat (index = team); missing teams use the default team look. */
  private looks: readonly { color: number; hat: HatStyle }[] = [];
  private match: MatchState | null = null;
  private view: Viewport = { width: 1, height: 1 };

  constructor() {
    this.root.addChild(this.sky, this.stars, this.world);
    this.world.addChild(
      this.hills,
      this.unitLayer,
      this.projectiles,
      this.fx,
      this.water,
      this.aim,
      this.textLayer,
    );
    this.fx.blendMode = 'add';
  }

  /** Display options from the settings / team customization (looks apply from `setMatch`). */
  setOptions(o: {
    reducedMotion: boolean;
    looks?: readonly { color: number; hat: HatStyle }[];
  }): void {
    this.reducedMotion = this.osReducedMotion || o.reducedMotion;
    if (this.reducedMotion) this.shake = 0;
    if (o.looks) this.looks = o.looks;
  }

  private colorOf(team: number): number {
    return this.looks[team]?.color ?? teamColor(team);
  }

  /** Bind a (new) match: builds the terrain texture and unit views. */
  setMatch(s: MatchState): void {
    this.match = s;
    const { width, height } = s.terrain;
    if (
      !this.terrainCanvas ||
      this.terrainCanvas.width !== width ||
      this.terrainCanvas.height !== height
    ) {
      this.terrainSprite?.destroy();
      this.terrainTexture?.destroy(true);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      this.terrainCanvas = canvas;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      this.terrainImage = ctx.createImageData(width, height);
      this.terrainPixels = new Uint32Array(this.terrainImage.data.buffer);
      this.terrainTexture = Texture.from(canvas);
      this.terrainSprite = new Sprite(this.terrainTexture);
      this.world.addChildAt(this.terrainSprite, 1);
    }
    paintTerrain(s.terrain.cells, width, height, this.terrainPixels as Uint32Array);
    this.flushTerrain();
    for (const v of this.units.values()) v.root.destroy({ children: true });
    this.units.clear();
    for (const u of s.units) this.units.set(u.id, this.createUnitView(u.team));
    this.particles = [];
    this.blasts = [];
    for (const t of this.texts) t.view.destroy();
    this.texts = [];
    this.shots = [];
    this.drawHills(width, height, s.waterLevel);
  }

  resize(view: Viewport): void {
    this.view = view;
    this.sky.clear();
    // Vertical gradient as stacked bands (cheap, no texture).
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      this.sky
        .rect(0, (view.height * i) / bands, view.width, view.height / bands + 1)
        .fill(mix(PALETTE.skyTop, PALETTE.skyBottom, t));
    }
    this.stars.clear();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      this.stars
        .circle(rnd() * view.width, rnd() * view.height * 0.7, rnd() < 0.15 ? 1.6 : 0.9)
        .fill({ color: PALETTE.stars, alpha: 0.25 + rnd() * 0.6 });
    }
  }

  /** React to the events of one simulation tick. */
  onEvents(events: readonly MatchEvent[]): void {
    const s = this.match;
    if (!s) return;
    for (const e of events) {
      switch (e.type) {
        case 'carved': {
          const r = inflate(e.rect, 3);
          paintTerrain(
            s.terrain.cells,
            s.terrain.width,
            s.terrain.height,
            this.terrainPixels as Uint32Array,
            r,
          );
          this.flushTerrain();
          break;
        }
        case 'explosion':
          this.blasts.push({ x: e.x, y: e.y, r: e.radius, age: 0 });
          this.burst(e.x, e.y, e.radius);
          if (!this.reducedMotion) this.shake = Math.min(1, this.shake + e.radius / 40);
          break;
        case 'damage': {
          const u = s.units[e.unit];
          if (u)
            this.floatText(
              `-${e.amount}`,
              fxToFloat(u.x),
              fxToFloat(u.y) - UNIT_HEIGHT - 18,
              this.colorOf(u.team),
            );
          break;
        }
        case 'shot':
          this.shots.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, age: 0 });
          break;
        case 'splash':
          for (let i = 0; i < (this.reducedMotion ? 5 : 14); i++) {
            this.particles.push({
              x: e.x,
              y: s.waterLevel,
              vx: (Math.random() - 0.5) * 120,
              vy: -80 - Math.random() * 140,
              life: 0.7,
              age: 0,
              color: PALETTE.waterEdge,
              size: 2,
            });
          }
          break;
        case 'died':
        case 'drowned': {
          const u = s.units[e.unit];
          if (u) this.floatText('✝', fxToFloat(u.x), fxToFloat(u.y) - 24, PALETTE.text);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Current screen-shake amplitude 0..1 (decays in `render`). */
  get shakeAmount(): number {
    return this.shake;
  }

  /**
   * Draw a frame. `prev` + `alpha` interpolate between the previous and current tick; `cam` is the
   * camera to apply.
   */
  render(s: MatchState, prev: Snapshot | null, alpha: number, dt: number, cam: Camera): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake : 0;
    this.world.scale.set(cam.zoom);
    this.world.position.set(
      this.view.width / 2 - cam.x * cam.zoom + sx,
      this.view.height / 2 - cam.y * cam.zoom + sy,
    );
    // Parallax: hills drift slower than the world.
    this.hills.position.set(
      (cam.x - s.terrain.width / 2) * 0.35,
      (cam.y - s.terrain.height / 2) * 0.2,
    );
    this.stars.position.set(-cam.x * 0.03, 0);

    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    for (const u of s.units) {
      const v = this.units.get(u.id);
      if (!v) continue;
      v.root.visible = u.alive;
      if (!u.alive) continue;
      const p = prev?.units.get(u.id);
      const x = fxToFloat(p ? lerp(p.x, u.x) : u.x);
      const y = fxToFloat(p ? lerp(p.y, u.y) : u.y);
      v.root.position.set(x, y + 1);
      v.eyes.scale.x = u.facing;
      const active = u.id === s.activeUnit && (s.phase === 'aiming' || s.phase === 'retreat');
      v.body.position.y = active ? -Math.abs(Math.sin(this.time * 6)) * 1.5 : 0;
      const hp = Math.max(0, u.hp);
      if (hp !== v.shownHp) {
        v.shownHp = hp;
        v.label.text = String(hp);
      }
      v.label.alpha = active ? 1 : 0.85;
    }

    this.projectiles.clear();
    for (const pr of s.projectiles) {
      const p = prev?.projectiles.get(pr.id);
      const x = fxToFloat(p ? lerp(p.x, pr.x) : pr.x);
      const y = fxToFloat(p ? lerp(p.y, pr.y) : pr.y);
      this.drawProjectile(
        pr.weapon,
        x,
        y,
        fxToFloat(pr.vx),
        fxToFloat(pr.vy),
        pr.fuse,
        pr.age,
        pr.dir,
      );
      const trail = !pr.resting && pr.weapon !== 'mine' && pr.weapon !== 'dynamite';
      if (
        (trail && Math.random() < (this.reducedMotion ? 0.25 : 0.8)) ||
        (pr.weapon === 'dynamite' && Math.random() < 0.6)
      ) {
        const fuseSpark = pr.weapon === 'dynamite';
        this.particles.push({
          x: fuseSpark ? x + 1 : x,
          y: fuseSpark ? y - 9 : y,
          vx: (Math.random() - 0.5) * 30,
          vy: -10 - Math.random() * 30,
          life: 0.35,
          age: 0,
          color: pr.weapon === 'flame' || pr.weapon === 'napalm' ? 0xff5a1f : 0xffb04f,
          size: 1.6,
        });
      }
    }
    for (const c of s.crates) this.drawCrate(c.kind, fxToFloat(c.x), fxToFloat(c.y), c.grounded);
    if (this.target) {
      this.target.age += dt;
      const a = 1 - this.target.age / 1.2;
      if (a <= 0) this.target = null;
      else {
        const { x: tx, y: ty } = this.target;
        const r = 10 + 4 * Math.sin(this.time * 10);
        this.projectiles
          .circle(tx, ty, r)
          .moveTo(tx - r - 4, ty)
          .lineTo(tx + r + 4, ty)
          .moveTo(tx, ty - r - 4)
          .lineTo(tx, ty + r + 4)
          .stroke({ width: 1.5, color: PALETTE.danger, alpha: a });
      }
    }

    this.updateFx(dt);
    this.drawWater(s);
  }

  /** Aim overlay: preview dots (world coords relative to the unit) and a power ring. */
  drawAim(
    points: { x: number; y: number }[] | null,
    ox: number,
    oy: number,
    power: number,
    color: number,
  ): void {
    this.aim.clear();
    if (!points) return;
    points.forEach((p, i) => {
      const a = 1 - i / (points.length + 2);
      this.aim.circle(ox + p.x, oy + p.y, 2.2 - i * 0.05).fill({ color, alpha: 0.9 * a });
    });
    // Start a fresh sub-path at the ring's top so no line joins it to the last dot.
    this.aim
      .moveTo(ox, oy - 5 - 16)
      .arc(ox, oy - 5, 16, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * power) / 100)
      .stroke({ width: 2.5, color: power > 85 ? PALETTE.danger : PALETTE.gold, alpha: 0.9 });
  }

  /** Straight dashed sight line for hitscan weapons. */
  drawSight(ox: number, oy: number, angleDeci: number, length: number, color: number): void {
    this.aim.clear();
    const rad = (angleDeci / 10) * (Math.PI / 180);
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad);
    for (let d = 10; d < length; d += 9) {
      this.aim.moveTo(ox + dx * d, oy + dy * d).lineTo(ox + dx * (d + 4), oy + dy * (d + 4));
    }
    this.aim.stroke({ width: 1.6, color, alpha: 0.85 });
  }

  clearAim(): void {
    this.aim.clear();
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.terrainTexture?.destroy(true);
  }

  // -------------------------------------------------------------------------------------------

  private flushTerrain(): void {
    const ctx = this.terrainCanvas?.getContext('2d');
    if (!ctx || !this.terrainImage) return;
    ctx.putImageData(this.terrainImage, 0, 0);
    this.terrainTexture?.source.update();
  }

  private createUnitView(team: number): UnitView {
    const color = this.colorOf(team);
    const root = new Container();
    const body = new Graphics();
    // Glow.
    body.circle(0, -6, 9).fill({ color, alpha: 0.18 });
    // Blob body.
    body.roundRect(-5, -11, 10, 11, 5).fill(0x120a24).stroke({ width: 1.6, color });
    // Team hat (shape differs per team for color-blind players).
    drawHat(
      body,
      this.looks[team]?.hat ?? TEAM_SHAPES[team % TEAM_SHAPES.length] ?? 'circle',
      color,
    );
    const eyes = new Graphics();
    eyes.circle(1, -7, 1.7).fill(0xffffff).circle(3.6, -7, 1.7).fill(0xffffff);
    eyes.circle(1.6, -7, 0.8).fill(0x05040f).circle(4.2, -7, 0.8).fill(0x05040f);
    body.addChild(eyes);
    const label = new Text({
      text: '100',
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: '700',
        fill: color,
        stroke: { color: 0x05040f, width: 4 },
      },
    });
    label.anchor.set(0.5, 1);
    label.scale.set(0.42);
    label.position.set(0, -19);
    root.addChild(body, label);
    this.unitLayer.addChild(root);
    return { root, body, eyes, label, shownHp: 100 };
  }

  /** Briefly mark a chosen target point. */
  markTarget(x: number, y: number): void {
    this.target = { x, y, age: 0 };
  }

  private drawCrate(kind: 'health' | 'weapon', x: number, y: number, grounded: boolean): void {
    const g = this.projectiles;
    const color = kind === 'health' ? 0x9dff4f : PALETTE.gold;
    if (!grounded) {
      // Parachute.
      g.arc(x, y - 22, 12, Math.PI, 0).fill({ color: PALETTE.soilEdge, alpha: 0.5 });
      g.moveTo(x - 12, y - 22)
        .lineTo(x - 4, y - 10)
        .moveTo(x + 12, y - 22)
        .lineTo(x + 4, y - 10);
      g.stroke({ width: 1, color: PALETTE.text, alpha: 0.6 });
    }
    g.roundRect(x - 6, y - 11, 12, 11, 2)
      .fill(0x120a24)
      .stroke({ width: 1.5, color });
    if (kind === 'health')
      g.rect(x - 1, y - 9, 2, 7)
        .rect(x - 3.5, y - 6.5, 7, 2)
        .fill(color);
    else g.circle(x, y - 5.5, 2.4).fill(color);
  }

  private drawProjectile(
    weapon: WeaponId,
    x: number,
    y: number,
    vx: number,
    vy: number,
    fuse: number,
    age: number,
    dir: number,
  ): void {
    const g = this.projectiles;
    if (weapon === 'grenade' || weapon === 'cluster') {
      const c = weapon === 'grenade' ? 0x9dff4f : 0xff4fd8;
      g.circle(x, y, 6).fill({ color: c, alpha: 0.18 });
      g.circle(x, y, 3).fill(c).stroke({ width: 1, color: 0xffffff });
    } else if (weapon === 'mine') {
      const armed = age >= 90;
      const blink =
        fuse > 0 ? Math.floor(age / 4) % 2 === 0 : armed && Math.floor(age / 30) % 2 === 0;
      g.roundRect(x - 4, y - 3, 8, 3, 1.5).fill(0x3a4250);
      g.circle(x, y - 3.5, 1.4).fill(blink ? PALETTE.danger : 0x55606f);
    } else if (weapon === 'dynamite') {
      g.roundRect(x - 2, y - 7, 4, 7, 1)
        .fill(0xff3b5c)
        .stroke({ width: 0.8, color: 0xffd6de });
      g.moveTo(x, y - 7)
        .lineTo(x + 1, y - 9)
        .stroke({ width: 0.8, color: 0xfff1c9 });
    } else if (weapon === 'crawler') {
      const d = dir === 0 ? 1 : dir;
      const hop = Math.abs(Math.sin(age * 0.4)) * 1.2;
      g.ellipse(x, y - 3 - hop, 4.5, 3)
        .fill(0xf2f0ff)
        .stroke({ width: 1, color: PALETTE.soilEdge });
      g.circle(x + d * 3.5, y - 4 - hop, 0.9).fill(0x05040f);
      if (Math.floor(age / 8) % 2 === 0) g.circle(x - d * 3, y - 6 - hop, 1).fill(PALETTE.danger);
    } else if (weapon === 'bomblet' || weapon === 'flame') {
      const c = weapon === 'flame' ? 0xff5a1f : 0xff4fd8;
      g.circle(x, y, weapon === 'flame' ? 3.5 : 2.2).fill({ color: c, alpha: 0.85 });
    } else {
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      g.circle(x, y, 7).fill({ color: 0xff7a3d, alpha: 0.2 });
      g.moveTo(x - ux * 6, y - uy * 6)
        .lineTo(x + ux * 4, y + uy * 4)
        .stroke({ width: 3, color: 0xffe2b8 });
    }
  }

  private burst(x: number, y: number, r: number): void {
    const n = Math.round((10 + r * 0.8) * (this.reducedMotion ? 0.35 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random()) * r * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - r * 2,
        life: 0.5 + Math.random() * 0.5,
        age: 0,
        color: i % 3 === 0 ? PALETTE.soilEdge : i % 3 === 1 ? 0xffb04f : 0xfff1c9,
        size: 1.2 + Math.random() * 2,
      });
    }
  }

  private floatText(text: string, x: number, y: number, color: number): void {
    const view = new Text({
      text,
      style: {
        fontFamily: FONT,
        fontSize: 26,
        fontWeight: '800',
        fill: color,
        stroke: { color: 0x05040f, width: 5 },
      },
    });
    view.anchor.set(0.5);
    view.scale.set(0.5);
    view.position.set(x, y);
    this.textLayer.addChild(view);
    this.texts.push({ view, age: 0 });
  }

  private updateFx(dt: number): void {
    const g = this.fx;
    g.clear();
    for (const b of this.blasts) {
      b.age += dt;
      const t = b.age / 0.45;
      if (t >= 1) continue;
      g.circle(b.x, b.y, b.r * (0.4 + 0.9 * t)).fill({ color: 0xffb04f, alpha: 0.35 * (1 - t) });
      g.circle(b.x, b.y, b.r * (0.6 + 0.8 * t)).stroke({
        width: 3 * (1 - t) + 0.5,
        color: 0xfff1c9,
        alpha: 1 - t,
      });
    }
    this.blasts = this.blasts.filter((b) => b.age < 0.45);
    for (const p of this.particles) {
      p.age += dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      if (a > 0) g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: a });
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const sh of this.shots) {
      sh.age += dt;
      const a = 1 - sh.age / 0.25;
      if (a > 0)
        g.moveTo(sh.x0, sh.y0)
          .lineTo(sh.x1, sh.y1)
          .stroke({ width: 1.5, color: 0xfff1c9, alpha: a });
    }
    this.shots = this.shots.filter((sh) => sh.age < 0.25);
    for (const t of this.texts) {
      t.age += dt;
      t.view.position.y -= 18 * dt;
      t.view.alpha = Math.min(1, 2 * (1.4 - t.age));
      if (t.age >= 1.4) t.view.destroy();
    }
    this.texts = this.texts.filter((t) => t.age < 1.4);
  }

  private drawWater(s: MatchState): void {
    const g = this.water;
    g.clear();
    const w = s.terrain.width;
    const top = s.waterLevel;
    const pts: number[] = [-400, s.terrain.height + 600];
    for (let x = -400; x <= w + 400; x += 16) {
      pts.push(
        x,
        top + Math.sin(x * 0.03 + this.time * 2.2) * 2.5 + Math.sin(x * 0.011 - this.time) * 1.5,
      );
    }
    pts.push(w + 400, s.terrain.height + 600);
    g.poly(pts).fill({ color: PALETTE.water, alpha: 0.88 });
    const line: number[] = [];
    for (let i = 2; i < pts.length - 2; i++) line.push(pts[i] as number);
    g.poly(line, false).stroke({ width: 2, color: PALETTE.waterEdge, alpha: 0.9 });
  }

  private drawHills(width: number, height: number, water: number): void {
    const g = this.hills;
    g.clear();
    const layer = (base: number, amp: number, freq: number, color: number, phase: number) => {
      const pts: number[] = [-width, water + 200];
      for (let x = -width; x <= width * 2; x += 40) {
        pts.push(
          x,
          base -
            amp * (0.5 + 0.5 * Math.sin(x * freq + phase)) -
            amp * 0.3 * Math.sin(x * freq * 2.7),
        );
      }
      pts.push(width * 2, water + 200);
      g.poly(pts).fill(color);
    };
    layer(height * 0.45, height * 0.25, 0.004, PALETTE.mountainsFar, 1.3);
    layer(height * 0.6, height * 0.2, 0.0065, PALETTE.mountainsNear, 4.1);
  }
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
