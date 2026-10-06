import { Application } from 'pixi.js';
import { GRAVITY, MAX_LAUNCH_SPEED } from '../core/constants';
import { fxFloor, fxToFloat } from '../core/fixed';
import { AudioEngine } from '../audio/engine';
import { BotSearch, type Difficulty } from '../core/ai/bot';
import { CRATE_HEALTH } from '../core/crates';
import { activeUnit, canFire, canMove, createMatch, step } from '../core/match';
import type { Command, MatchState, WeaponId } from '../core/types';
import { unitCenter } from '../core/units';
import { WEAPON_IDS, WEAPONS } from '../core/weapons';
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
import { getPlatform } from '../platform';
import { feedbackFor } from './feedback';
import { GameLoop } from './loop';
import { INITIAL_UI, type UiState } from './state';
import { createStore, type Store } from './store';

export interface GameActions {
  startHotseat(seed?: string): void;
  startBotMatch(difficulty: Difficulty, seed?: string): void;
  move(dir: -1 | 0 | 1): void;
  jump(): void;
  backflip(): void;
  skip(): void;
  selectWeapon(w: WeaponId): void;
  toggleWeapons(open?: boolean): void;
  setFuse(seconds: number): void;
  cycleGirderAngle(): void;
  /** Fire a `place` weapon (uses the unit's facing). */
  use(): void;
  passReady(): void;
  rematch(): void;
  toMenu(): void;
  pause(): void;
  resume(): void;
  toggleSound(): void;
  setDifficulty(d: Difficulty): void;
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

  const MUTE_KEY = 'craterpult:muted';
  const readMuted = (): boolean => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  };
  const store = createStore<UiState>({ ...INITIAL_UI, lang: getLanguage(), muted: readMuted() });
  const audio = new AudioEngine();
  audio.setMuted(store.get().muted);
  const platform = getPlatform();
  const haptics = platform.haptics;
  // Browsers only start audio from a user gesture.
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  onLanguageChange(() => {
    store.set({ lang: getLanguage() });
    if (match) publishHud();
  });
  const view = new WorldView();
  app.stage.addChild(view.root);

  let match: MatchState | null = null;
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
      if (!loop.isPaused) driveBot();
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

  interface MatchOptions {
    seed: string;
    /** Bot difficulty of team 1, or null for pass & play. */
    bot: Difficulty | null;
  }
  let lastOptions: MatchOptions = { seed: 'craterpult', bot: null };

  /** Is the team played by someone holding the phone? */
  const isHuman = (team: number): boolean => !match?.teams[team]?.bot;
  /** Pass & play needs the hand-over screen; against a bot it would only get in the way. */
  const needsPass = (): boolean => !!match && match.teams.filter((tm) => !tm.bot).length > 1;

  function startMatch(opts: MatchOptions): void {
    lastOptions = opts;
    bot = null;
    shotsFired = [0, 0];
    match = createMatch({
      seed: opts.seed,
      teams: [0, 1].map((i) => ({
        name:
          i === 1 && opts.bot
            ? t(`bot.name.${opts.bot}` as 'bot.name.1')
            : t(`team.${i}` as 'team.0'),
        units: ['A', 'B', 'C'].map((c) => `${c}${i + 1}`),
        bot: i === 1 && opts.bot !== null,
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
      overlay: needsPass() ? 'pass' : null,
      winner: null,
      weaponsOpen: false,
      weapon: 'bazooka',
      botThinking: false,
    });
    publishHud();
    loop.reset();
    if (needsPass()) {
      loop.pause();
      // Render one frame so the pass screen has the island behind it.
      view.render(match, null, 1, 0, cam);
    } else {
      loop.resume();
      beginTurn();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Bots: the search runs a few milliseconds per frame, then the bot "aims" visibly and fires.
  // ---------------------------------------------------------------------------------------------

  interface BotTurn {
    search: BotSearch;
    started: number;
    /** Chosen shot and when it is fired (after showing the aim). */
    chosen: Extract<Command, { t: 'fire' }> | null;
    fireAt: number;
    skip: boolean;
  }
  let bot: BotTurn | null = null;
  /** Shots per team this match (test hook). */
  let shotsFired: number[] = [];
  const BOT_SLICE_MS = 6;
  const BOT_MIN_THINK_MS = 900;
  const BOT_MAX_THINK_MS = 2600;
  const BOT_SHOW_AIM_MS = 650;

  /** Called when a turn begins (after the pass screen, if any). */
  function beginTurn(): void {
    const s = match;
    if (!s || s.phase !== 'aiming') return;
    if (isHuman(s.activeTeam)) {
      bot = null;
      store.set({ botThinking: false });
      return;
    }
    try {
      bot = {
        search: new BotSearch(s, lastOptions.bot ?? 3),
        started: performance.now(),
        chosen: null,
        fireAt: 0,
        skip: false,
      };
      store.set({ botThinking: true });
    } catch {
      pending.push({ t: 'skip' });
    }
  }

  function driveBot(): void {
    const s = match;
    const b = bot;
    if (!s || !b || store.get().overlay !== null) return;
    if (s.phase !== 'aiming' || isHuman(s.activeTeam)) {
      if (s.phase !== 'firing') bot = null;
      return;
    }
    const now = performance.now();
    if (!b.chosen && !b.skip) {
      const until = now + BOT_SLICE_MS;
      while (performance.now() < until && b.search.next());
      const thought = now - b.started;
      if ((b.search.done && thought >= BOT_MIN_THINK_MS) || thought >= BOT_MAX_THINK_MS) {
        b.chosen = b.search.result();
        b.skip = !b.chosen;
        b.fireAt = now + BOT_SHOW_AIM_MS;
        store.set({ botThinking: false });
      }
      return;
    }
    if (now < b.fireAt) return;
    pending.push(b.skip || !b.chosen ? { t: 'skip' } : b.chosen);
    if (b.chosen && b.search && WEAPONS[b.chosen.weapon].shots > 1) {
      // Multi-shot weapons: fire again on the next aiming phase.
      b.fireAt = now + 900;
    } else {
      bot = null;
    }
  }

  /** The bot's chosen aim, shown as if a player were dragging. */
  function botAim(): Aim | null {
    const c = bot?.chosen;
    if (!c || c.angle === undefined) return null;
    return { angle: c.angle, power: c.power ?? 100 };
  }

  function handleEvents(s: MatchState): void {
    view.onEvents(s.events);
    for (const f of feedbackFor(s.events, s)) {
      if (f.kind === 'sfx') audio.play(f.sfx, f.a);
      else if (!store.get().muted) haptics.impact(f.strength);
    }
    for (const e of s.events) {
      if (e.type === 'turnStart') {
        aim = null;
        manualCamUntil = 0;
        if (needsPass()) {
          store.set({ overlay: 'pass', weaponsOpen: false });
          loop.pause();
        } else {
          store.set({ weaponsOpen: false });
          beginTurn();
        }
        publishHud();
      } else if (e.type === 'gameOver') {
        store.set({ overlay: 'over', winner: e.winner });
        publishHud();
      } else if (e.type === 'fired') {
        shotsFired[s.activeTeam] = (shotsFired[s.activeTeam] ?? 0) + 1;
        store.set({ showAimHint: false });
        manualCamUntil = 0;
      } else if (e.type === 'crateCollected') {
        toast(
          e.kind === 'health'
            ? t('toast.crateHealth', { hp: CRATE_HEALTH })
            : t('toast.crateWeapon', { weapon: e.weapon ? t(`weapon.${e.weapon}`) : '' }),
        );
      } else if (e.type === 'crateDropped') {
        toast(t('toast.crateDropped'));
      } else if (e.type === 'waterRise') {
        toast(t('hud.suddenDeath'));
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
      canMove: canMove(s) && !!u?.grounded && st.overlay === null && isHuman(s.activeTeam),
      canFire: canFire(s, st.weapon) && st.overlay === null && isHuman(s.activeTeam),
      botTurn: !isHuman(s.activeTeam),
      weaponInfo: weaponInfo(s),
    });
  }

  function weaponInfo(s: MatchState): UiState['weaponInfo'] {
    const team = s.teams[s.activeTeam];
    const turns = s.teamTurns[s.activeTeam] ?? 0;
    const prevInfo = store.get().weaponInfo;
    const out: UiState['weaponInfo'] = {};
    let same = true;
    for (const w of WEAPON_IDS) {
      const def = WEAPONS[w];
      const info = {
        ammo: team?.ammo[w] ?? 0,
        ok: canFire(s, w) || s.phase !== 'aiming',
        fromTurn: def.fromTurn,
        unlocked: turns >= def.fromTurn,
      };
      const old = prevInfo[w];
      if (!old || old.ammo !== info.ammo || old.ok !== info.ok || old.unlocked !== info.unlocked)
        same = false;
      out[w] = info;
    }
    return same ? prevInfo : out;
  }

  let toastSeq = 0;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function toast(text: string): void {
    store.set({ toast: { id: ++toastSeq, text } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => store.set({ toast: null }), 2200);
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
  /** Where the current single-finger gesture started (tap detection for target weapons). */
  let downAt: { x: number; y: number; moved: number } | null = null;
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
    return (
      !!s && store.get().overlay === null && isHuman(s.activeTeam) && canFire(s, store.get().weapon)
    );
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
    downAt = { x: p.x, y: p.y, moved: 0 };
    const us = activeUnitScreen();
    const aimKind = WEAPONS[store.get().weapon].aim;
    const slingshot = aimKind === 'arc' || aimKind === 'direction';
    if (us && slingshot && canAimNow() && Math.hypot(p.x - us.x, p.y - us.y) < AIM_GRAB_PX) {
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
    if (downAt) downAt.moved = Math.max(downAt.moved, Math.hypot(p.x - downAt.x, p.y - downAt.y));
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
      const direction = WEAPONS[store.get().weapon].aim === 'direction';
      if ((direction ? aim.power >= 20 : aim.power >= MIN_FIRE_POWER) && canAimNow()) fire(aim);
      aim = null;
    } else if (mode === 'pan' && downAt && downAt.moved < 10 && pointers.size === 0) {
      tapWorld(downAt.x, downAt.y);
    }
    if (pointers.size === 0) downAt = null;
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

  /** A tap on the map fires target weapons at that point. */
  function tapWorld(sx: number, sy: number): void {
    const st = store.get();
    if (WEAPONS[st.weapon].aim !== 'target' || !canAimNow()) return;
    const w = screenToWorld(cam, viewport(), sx, sy);
    const tx = Math.round(w.x);
    // Teleport aims the body center at the tap; the core wants the feet.
    const ty = Math.round(st.weapon === 'teleport' ? w.y + 5 : w.y);
    pending.push({ t: 'fire', weapon: st.weapon, tx, ty, angle: st.girderAngle });
    view.markTarget(tx, ty);
  }

  function drawAimOverlay(): void {
    const s = match;
    const u = s && activeUnit(s);
    const shown = aim ?? (bot?.chosen && s?.phase === 'aiming' ? botAim() : null);
    if (!s || !u || !shown) {
      view.clearAim();
      return;
    }
    const c = unitCenter(u);
    const color = teamColor(u.team);
    const weapon = WEAPONS[aim ? store.get().weapon : (bot?.chosen?.weapon ?? 'bazooka')];
    if (weapon.aim === 'direction')
      view.drawSight(c.x, c.y, shown.angle, weapon.id === 'drill' ? weapon.range : 160, color);
    else {
      const speed = (fxToFloat(MAX_LAUNCH_SPEED) * weapon.speedPct) / 100;
      const gravity = (fxToFloat(GRAVITY) * weapon.gravityPct) / 100;
      const pts = previewArc(shown, speed, gravity, 30, 3);
      view.drawAim(pts, c.x, c.y, shown.power, color);
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
      startMatch({ seed: seed ?? `hs-${Date.now().toString(36)}`, bot: null });
    },
    startBotMatch(difficulty, seed) {
      store.set({ difficulty });
      startMatch({ seed: seed ?? `bot-${Date.now().toString(36)}`, bot: difficulty });
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
    cycleGirderAngle() {
      store.set({ girderAngle: (store.get().girderAngle + 450) % 1800 });
    },
    use() {
      const st = store.get();
      if (WEAPONS[st.weapon].aim !== 'place' || !canAimNow()) return;
      pending.push({ t: 'fire', weapon: st.weapon });
    },
    passReady() {
      if (store.get().overlay !== 'pass') return;
      store.set({ overlay: null });
      loop.resume();
      publishHud();
      beginTurn();
    },
    rematch() {
      startMatch({ ...lastOptions, seed: `${lastOptions.seed}+` });
    },
    toMenu() {
      match = null;
      bot = null;
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
    setDifficulty(d) {
      store.set({ difficulty: d });
    },
    toggleSound() {
      const muted = !store.get().muted;
      store.set({ muted });
      audio.setMuted(muted);
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Not persisted.
      }
      if (!muted) audio.play('tap');
    },
  };

  // Mobile shell (T7.1): app sent to the background (or tab hidden) pauses a running match.
  platform.lifecycle.onPause(() => {
    if (match) actions.pause();
  });

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
              shots: [...shotsFired],
              hp: s.units.map((u) => u.hp),
              alive: s.units.map((u) => u.alive),
              units: s.units.map((u) => ({ x: fxFloor(u.x), y: fxFloor(u.y), team: u.team })),
            }
          : null;
      },
      command: (c: Command) => pending.push(c),
      /** Finish the bot's search now and queue its shot (deterministic e2e). */
      playBotTurn: (): boolean => {
        const b = bot;
        if (!b) return false;
        const cmd = b.search.finish();
        pending.push(cmd ?? { t: 'skip' });
        bot = null;
        store.set({ botThinking: false });
        return true;
      },
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
