/**
 * 2-D camera over the world: `x, y` is the world point at the screen center, `zoom` is screen px
 * per world px. Pure math; the renderer applies it to the world container.
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface WorldBounds {
  width: number;
  height: number;
  /** Extra sky the camera may show above y = 0. */
  sky: number;
}

/** Zoom limits for a viewport: from "whole island width" to close-up. */
export function zoomLimits(view: Viewport, world: WorldBounds): { min: number; max: number } {
  const min = Math.min(view.width / world.width, view.height / (world.height + world.sky));
  return { min, max: Math.max(min, 2.5) };
}

/** A comfortable default zoom: about 320 world px across the screen width. */
export function defaultZoom(view: Viewport, world: WorldBounds): number {
  const { min, max } = zoomLimits(view, world);
  return Math.min(max, Math.max(min, view.width / 320));
}

/** Keep the view inside the world (plus sky above); centers an axis that is fully visible. */
export function clampCamera(c: Camera, view: Viewport, world: WorldBounds): Camera {
  const { min, max } = zoomLimits(view, world);
  const zoom = Math.min(max, Math.max(min, c.zoom));
  const halfW = view.width / 2 / zoom;
  const halfH = view.height / 2 / zoom;
  const clampAxis = (v: number, lo: number, hi: number, half: number): number =>
    hi - lo <= 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v));
  return {
    zoom,
    x: clampAxis(c.x, 0, world.width, halfW),
    y: clampAxis(c.y, -world.sky, world.height, halfH),
  };
}

/** Exponential approach of `c` toward `target` (frame-rate independent). */
export function followCamera(c: Camera, target: Camera, dt: number, rate = 5): Camera {
  const k = 1 - Math.exp(-rate * dt);
  return {
    x: c.x + (target.x - c.x) * k,
    y: c.y + (target.y - c.y) * k,
    zoom: c.zoom + (target.zoom - c.zoom) * k,
  };
}

export function worldToScreen(
  c: Camera,
  view: Viewport,
  wx: number,
  wy: number,
): { x: number; y: number } {
  return { x: (wx - c.x) * c.zoom + view.width / 2, y: (wy - c.y) * c.zoom + view.height / 2 };
}

export function screenToWorld(
  c: Camera,
  view: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - view.width / 2) / c.zoom + c.x, y: (sy - view.height / 2) / c.zoom + c.y };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Match-start camera tour: from the active unit over the enemy groups and back. Enemies closer than
 * `groupWidth` world px (about one screen) share a stop; at most `maxStops` stops are kept (the
 * farthest from the start win). Returns the waypoints including start and end.
 */
export function planIntroPan(
  start: Point,
  enemies: readonly Point[],
  groupWidth: number,
  maxStops = 3,
): Point[] {
  const sorted = [...enemies].sort((a, b) => a.x - b.x);
  const groups: Point[][] = [];
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    if (g && e.x - (g[0] as Point).x <= groupWidth * 0.6) g.push(e);
    else groups.push([e]);
  }
  let stops = groups.map((g) => ({
    x: g.reduce((n, p) => n + p.x, 0) / g.length,
    y: g.reduce((n, p) => n + p.y, 0) / g.length,
  }));
  // Groups already on screen at the start need no visit.
  stops = stops.filter((p) => Math.abs(p.x - start.x) > groupWidth * 0.4);
  if (stops.length > maxStops) {
    const far = [...stops]
      .sort((a, b) => Math.abs(b.x - start.x) - Math.abs(a.x - start.x))
      .slice(0, maxStops);
    stops = stops.filter((p) => far.includes(p));
  }
  // Visit nearest-first along the island so the tour does not zig-zag.
  stops.sort((a, b) => Math.abs(a.x - start.x) - Math.abs(b.x - start.x));
  return stops.length ? [start, ...stops, start] : [];
}

export interface PanTiming {
  /** Seconds to travel between two stops. */
  travel: number;
  /** Seconds to rest at each enemy stop. */
  hold: number;
}

export const INTRO_TIMING: PanTiming = { travel: 0.75, hold: 0.7 };

/** Total length of a tour in seconds (0 for an empty tour). */
export function panDuration(points: readonly Point[], timing = INTRO_TIMING): number {
  const legs = Math.max(0, points.length - 1);
  return legs * timing.travel + Math.max(0, legs - 1) * timing.hold;
}

/** Camera center `t` seconds into a tour (eased legs, holds at the enemy stops). */
export function panAt(points: readonly Point[], t: number, timing = INTRO_TIMING): Point {
  const last = points[points.length - 1];
  if (!last) return { x: 0, y: 0 };
  let rest = Math.max(0, t);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    if (rest < timing.travel) {
      const k = rest / timing.travel;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
    rest -= timing.travel;
    if (i + 2 < points.length) {
      if (rest < timing.hold) return { x: b.x, y: b.y };
      rest -= timing.hold;
    }
  }
  return { x: last.x, y: last.y };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface EdgeMarker {
  /** Screen position of the arrow tip, on the inset screen edge. */
  x: number;
  y: number;
  /** Direction from the screen center toward the target (radians, screen space). */
  angle: number;
}

/**
 * Where to draw an off-screen indicator for world point (wx, wy): the point where the line from
 * the visible area's center to the target leaves the inset rectangle. Null when the target is
 * inside the visible (inset) area.
 */
export function edgeMarker(
  c: Camera,
  view: Viewport,
  wx: number,
  wy: number,
  insets: Insets,
): EdgeMarker | null {
  const p = worldToScreen(c, view, wx, wy);
  const left = insets.left;
  const right = view.width - insets.right;
  const top = insets.top;
  const bottom = view.height - insets.bottom;
  if (right <= left || bottom <= top) return null;
  if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return null;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const sx = dx === 0 ? Infinity : (dx > 0 ? right - cx : left - cx) / dx;
  const sy = dy === 0 ? Infinity : (dy > 0 ? bottom - cy : top - cy) / dy;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}
