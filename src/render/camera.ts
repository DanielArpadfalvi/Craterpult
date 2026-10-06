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

/** A comfortable default zoom: about 460 world px across the screen width. */
export function defaultZoom(view: Viewport, world: WorldBounds): number {
  const { min, max } = zoomLimits(view, world);
  return Math.min(max, Math.max(min, view.width / 460));
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
