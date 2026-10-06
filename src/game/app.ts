import { Application } from 'pixi.js';
import { GRAVITY, MAX_LAUNCH_SPEED } from '../core/constants';
import { fxFloor, fxToFloat } from '../core/fixed';
import { activeUnit, canFire, canMove, createMatch, step } from '../core/match';
import type { Command, MatchState, WeaponId } from '../core/types';
import { unitCenter } from '../core/units';
import { WEAPONS } from '../core/weapons';
import { getLanguage, onLanguageChange, t } from '../i18n';
import { aimFromDrag, MIN_FIRE_POWER, previewArc, type Aim } from '../input/aim';
import {
  clampCamera,
  defaultZoom,
  followCamera,
  screenToWorld,
  worldToScreen,
  type Camera,
  type Viewport,
  type WorldBounds,
} from '../render/camera';
import { teamColor } from '../render/palette';
import { snapshot, WorldView, type Snapshot } from '../render/world';
import { GameLoop } from './loop';
import { INITIAL_UI, type UiState } from './state';
import { createStore, type Store } from './store';

export interface GameActions {
  startHotseat(seed?: string): void;
  move(dir: -1 | 0 | 1): void;
  jump(): void;
  backflip(): void;
  skip(): void;
  selectWeapon(w: WeaponId): void;
  toggleWeapons(open?: boolean): void;
  setFuse(seconds: number): void;
  passReady(): void;
  rematch(): void;
  toMenu(): void;
  pause(): void;
  resume(): void;
}

export interface GameHandle {
  store: Store<UiState>;
  actions: GameActions;
}

const SKY = 320;
/** Screen px around the active unit where a touch starts aiming instead of panning. */
const AIM_GRAB_PX = 70;

export async function bootGame(stageEl: HTMLElement): Promise<GameHandle> {
  const app = new Application();
  await app.init({
    resizeTo: stageEl,
    background: 0x05040f,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  stageEl.appendChild(app.canvas);
  app.canvas.style.touchAction = 'none';

  const store = createStore<UiState>({ ...INITIAL_UI, lang: getLanguage() });
  onLanguageChange(() => {
    store.set({ lang: getLanguage() });
    if (match) publishHud();
  });
  const view = new WorldView();
  app.stage.addChild(view.root);

  let match: MatchState | null = null;
  let lastSeed = 'craterpult';
  let prev: Snapshot | null = null;
  let pending: Command[] = [];
  let cam: Camera = { x: 800, y: 500, zoom: 1 };
  let manualCamUntil = 0;
  let aim: Aim | null = null;
  let hudAcc = 0;
  let renderingStopped = false;

  const viewport = (): Viewport => ({ width: app.screen.width, height: app.screen.height });
  const bounds = (): WorldBounds =>
    match
      ? { width: match.terrain.width, height: match.terrain.height, sky: SKY }
      : { width: 1600, height: 900, sky: SKY };

  const loop = new GameLoop({
    onTick() {
      if (!match) return;
      prev = snapshot(match);
      const cmds = pending;
      pending = [];
      step(match, cmds);
      handleEvents(match);
    },
    onRender(alpha, dt) {
      if (!match) return;
      updateCamera(dt);
      view.render(match, prev, alpha, dt, cam);
      drawAimOverlay();
      hudAcc += dt;
      if (hudAcc > 0.1) {
        hudAcc = 0;
        publishHud();
      }
    },
  });

  app.ticker.add((ticker) => {
    if (!renderingStopped) loop.frame(ticker.deltaMS);
  });

  const resize = (): void => {
    view.resize(viewport());
    cam = clampCamera(cam, viewport(), bounds());
  };
  app.renderer.on('resize', resize);
  resize();

  // ---------------------------------------------------------------------------------------------
  // Match flow
  // ---------------------------------------------------------------------------------------------

  function startMatch(seed: string): void {
    lastSeed = seed;
    match = createMatch({
      seed,
      teams: [0, 1].map((i) => ({
        name: t(`team.${i}` as 'team.0'),
        units: ['A', 'B', 'C'].map((c) => `${c}${i + 1}`),
      })),
    });
    prev = null;
    pending = [];
    aim = null;
    view.setMatch(match);
    const u = activeUnit(match);
    cam = clampCamera(
      {
        x: u ? fxToFloat(u.x) : 800,
        y: u ? fxToFloat(u.y) - 60 : 500,
        zoom: defaultZoom(viewport(), bounds()),
      },
      viewport(),
      bounds(),
    );
    store.set({
      screen: 'playing',
      overlay: 'pass',
      winner: null,
      weaponsOpen: false,
      weapon: 'bazooka',
    });
    publishHud();
    loop.reset();
    loop.pause();
    // Render one frame so the pass screen has the island behind it.
    view.render(match, null, 1, 0, cam);
  }

  function handleEvents(s: MatchState): void {
    view.onEvents(s.events);
    for (const e of s.events) {
      if (e.type === 'turnStart') {
        aim = null;
        manualCamUntil = 0;
        store.set({ overlay: 'pass', weaponsOpen: false });
        loop.pause();
        publishHud();
      } else if (e.type === 'gameOver') {
        store.set({ overlay: 'over', winner: e.winner });
        publishHud();
      } else if (e.type === 'fired') {
        store.set({ showAimHint: false });
        manualCamUntil = 0;
      }
    }
  }

  function publishHud(): void {
    const s = match;
    if (!s) return;
    const u = activeUnit(s);
    const st = store.get();
    store.set({
      phase: s.phase,
      activeTeam: s.activeTeam,
      activeName: s.teams[s.activeTeam]?.name ?? '',
      turnSeconds: Math.max(0, Math.ceil(s.turnTicksLeft / 60)),
      wind: s.wind,
      teams: s.teams.map((tm) => {
        const members = s.units.filter((x) => x.team === tm.id);
        return {
          id: tm.id,
          name: tm.name,
          hp: members.reduce((n, x) => n + (x.alive ? Math.max(0, x.hp) : 0), 0),
          maxHp: members.length * s.config.unitHp,
          alive: members.filter((x) => x.alive && x.hp > 0).length,
        };
      }),
      canMove: canMove(s) && !!u?.grounded && st.overlay === null,
      canFire: canFire(s, st.weapon) && st.overlay === null,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------------------------

  function cameraTarget(): Camera | null {
    const s = match;
    if (!s) return null;
    const p = s.projectiles[0];
    if (p) return { x: fxToFloat(p.x), y: fxToFloat(p.y), zoom: cam.zoom };
    const u = activeUnit(s);
    if (u && u.alive) return { x: fxToFloat(u.x), y: fxToFloat(u.y) - 40, zoom: cam.zoom };
    return null;
  }

  function updateCamera(dt: number): void {
    const target = performance.now() > manualCamUntil ? cameraTarget() : null;
    if (target) cam = followCamera(cam, clampCamera(target, viewport(), bounds()), dt, 4);
    cam = clampCamera(cam, viewport(), bounds());
  }

  // ---------------------------------------------------------------------------------------------
  // Pointer input: aim (slingshot) near the active unit, otherwise pan; two fingers pinch-zoom.
  // ---------------------------------------------------------------------------------------------

  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'none' | 'aim' | 'pan' | 'pinch' = 'none';
  let pinchStart = { dist: 1, zoom: 1, wx: 0, wy: 0 };

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function activeUnitScreen(): { x: number; y: number } | null {
    const s = match;
    const u = s && activeUnit(s);
    if (!s || !u) return null;
    const c = unitCenter(u);
    return worldToScreen(cam, viewport(), c.x, c.y);
  }

  function canAimNow(): boolean {
    const s = match;
    return !!s && store.get().overlay === null && canFire(s, store.get().weapon);
  }

  app.canvas.addEventListener('pointerdown', (e) => {
    app.canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const w = screenToWorld(cam, viewport(), mid.x, mid.y);
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: cam.zoom,
        wx: w.x,
        wy: w.y,
      };
      mode = 'pinch';
      aim = null;
      return;
    }
    const us = activeUnitScreen();
    if (us && canAimNow() && Math.hypot(p.x - us.x, p.y - us.y) < AIM_GRAB_PX) {
      mode = 'aim';
      aim = aimFromDrag(us.x, us.y, p.x, p.y);
    } else {
      mode = 'pan';
    }
  });

  app.canvas.addEventListener('pointermove', (e) => {
    const old = pointers.get(e.pointerId);
    if (!old) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (mode === 'aim') {
      const us = activeUnitScreen();
      if (us) aim = aimFromDrag(us.x, us.y, p.x, p.y);
    } else if (mode === 'pan') {
      cam = clampCamera(
        {
          x: cam.x - (p.x - old.x) / cam.zoom,
          y: cam.y - (p.y - old.y) / cam.zoom,
          zoom: cam.zoom,
        },
        viewport(),
        bounds(),
      );
      manualCamUntil = performance.now() + 2500;
    } else if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const zoom = (pinchStart.zoom * dist) / pinchStart.dist;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v = viewport();
      // Keep the world point under the fingers' midpoint fixed.
      cam = clampCamera(
        {
          zoom,
          x: pinchStart.wx - (mid.x - v.width / 2) / zoom,
          y: pinchStart.wy - (mid.y - v.height / 2) / zoom,
        },
        v,
        bounds(),
      );
      manualCamUntil = performance.now() + 2500;
    }
  });

  const release = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    if (mode === 'aim' && aim) {
      if (aim.power >= MIN_FIRE_POWER && canAimNow()) fire(aim);
      aim = null;
    }
    if (pointers.size === 0) mode = 'none';
    else if (mode === 'pinch') mode = 'pan';
  };
  app.canvas.addEventListener('pointerup', release);
  app.canvas.addEventListener('pointercancel', release);
  app.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam = clampCamera(
        { ...cam, zoom: cam.zoom * Math.exp(-e.deltaY * 0.0015) },
        viewport(),
        bounds(),
      );
      manualCamUntil = performance.now() + 2500;
    },
    { passive: false },
  );

  function fire(a: Aim): void {
    const st = store.get();
    pending.push({ t: 'fire', weapon: st.weapon, angle: a.angle, power: a.power, fuse: st.fuse });
  }

  function drawAimOverlay(): void {
    const s = match;
    const u = s && activeUnit(s);
    if (!s || !u || !aim) {
      view.clearAim();
      return;
    }
    const c = unitCenter(u);
    const color = teamColor(u.team);
    const weapon = WEAPONS[store.get().weapon];
    if (weapon.kind === 'hitscan') view.drawSight(c.x, c.y, aim.angle, 160, color);
    else {
      const pts = previewArc(aim, fxToFloat(MAX_LAUNCH_SPEED), fxToFloat(GRAVITY), 30, 3);
      view.drawAim(pts, c.x, c.y, aim.power, color);
    }
  }

  // Keyboard (desktop / development).
  window.addEventListener('keydown', (e) => {
    if (!match || store.get().overlay) return;
    if (e.repeat) return;
    if (e.key === 'ArrowLeft') actions.move(-1);
    else if (e.key === 'ArrowRight') actions.move(1);
    else if (e.key === 'Enter') actions.jump();
    else if (e.key === 'Backspace') actions.backflip();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') actions.move(0);
  });

  // ---------------------------------------------------------------------------------------------
  // Actions (UI)
  // ---------------------------------------------------------------------------------------------

  const actions: GameActions = {
    startHotseat(seed) {
      startMatch(seed ?? `hs-${Date.now().toString(36)}`);
    },
    move(dir) {
      pending.push({ t: 'move', dir });
    },
    jump() {
      pending.push({ t: 'jump' });
    },
    backflip() {
      pending.push({ t: 'backflip' });
    },
    skip() {
      pending.push({ t: 'skip' });
    },
    selectWeapon(w) {
      store.set({ weapon: w, weaponsOpen: false });
      publishHud();
    },
    toggleWeapons(open) {
      store.set({ weaponsOpen: open ?? !store.get().weaponsOpen });
    },
    setFuse(seconds) {
      store.set({ fuse: Math.min(5, Math.max(1, Math.round(seconds))) });
    },
    passReady() {
      if (store.get().overlay !== 'pass') return;
      store.set({ overlay: null });
      loop.resume();
      publishHud();
    },
    rematch() {
      startMatch(`${lastSeed}+`);
    },
    toMenu() {
      match = null;
      loop.pause();
      view.clearAim();
      store.set({ screen: 'menu', overlay: null });
    },
    pause() {
      if (store.get().overlay) return;
      loop.pause();
      store.set({ overlay: 'pause' });
    },
    resume() {
      if (store.get().overlay !== 'pause') return;
      store.set({ overlay: null });
      loop.resume();
    },
  };

  if (new URLSearchParams(location.search).has('test')) {
    (window as unknown as { __craterpult: unknown }).__craterpult = {
      ready: true,
      actions,
      getMatch: () => match,
      summary: () => {
        const s = match;
        return s
          ? {
              tick: s.tick,
              phase: s.phase,
              activeTeam: s.activeTeam,
              activeUnit: s.activeUnit,
              winner: s.winner,
              overlay: store.get().overlay,
              hp: s.units.map((u) => u.hp),
              alive: s.units.map((u) => u.alive),
              units: s.units.map((u) => ({ x: fxFloor(u.x), y: fxFloor(u.y), team: u.team })),
            }
          : null;
      },
      command: (c: Command) => pending.push(c),
      stepTicks: (n: number) => loop.stepTicks(n),
      unitScreen: () => activeUnitScreen(),
      stopRendering: () => {
        renderingStopped = true;
      },
      renderFrames: (n: number) => {
        for (let i = 0; i < n; i++) {
          if (!match) break;
          updateCamera(1);
          view.render(match, null, 1, 1 / 60, cam);
          drawAimOverlay();
        }
        publishHud();
        app.render();
      },
    };
  }

  return { store, actions };
}
