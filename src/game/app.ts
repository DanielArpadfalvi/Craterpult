import { Application } from 'pixi.js';
import { GRAVITY, MAX_LAUNCH_SPEED } from '../core/constants';
import { fxFloor, fxToFloat } from '../core/fixed';
import { AudioEngine } from '../audio/engine';
import { BotSearch, type Difficulty } from '../core/ai/bot';
import { CRATE_HEALTH } from '../core/crates';
import {
  chapterMissions,
  missionById,
  missionSetup,
  missionStats,
  nextMission,
  ruleMet,
  scoreMission,
  type Mission,
} from '../core/campaign';
import {
  DAILY_BOT,
  DAILY_TURN_COST,
  DAILY_WIN_BONUS,
  dailyScore,
  dailySeed,
  dailySetup,
} from '../core/daily';
import { activeUnit, canFire, canMove, createMatch, step, type MatchSetup } from '../core/match';
import type { MapStyle } from '../core/mapgen';
import { onlineSetup, type TurnRecord } from '../core/online';
import { createRng, pick } from '../core/rng';
import type { Command, MatchState, WeaponId } from '../core/types';
import { unitCenter } from '../core/units';
import { WEAPON_IDS, WEAPONS } from '../core/weapons';
import {
  deviceLanguage,
  getLanguage,
  onLanguageChange,
  setLanguage,
  t,
  type TranslationKey,
} from '../i18n';
import { aimFromDrag, MIN_FIRE_POWER, previewArc, type Aim } from '../input/aim';
import {
  clampCamera,
  defaultZoom,
  edgeMarker,
  followCamera,
  panAt,
  panDuration,
  planIntroPan,
  screenToWorld,
  worldToScreen,
  type Camera,
  type Insets,
  type Point,
  type Viewport,
  type WorldBounds,
} from '../render/camera';
import { EdgeIndicators, type ColoredMarker } from '../render/indicators';
import { cssColor, TEAM_COLORS } from '../render/palette';
import { snapshot, WorldView, type Snapshot } from '../render/world';
import { onlineEnv, selectOnline } from '../net/select';
import { endedEarly, type OnlineMatch } from '../net/types';
import { getPlatform } from '../platform';
import { beginDaily, currentStreak, dateKey, finishDaily } from './daily';
import { feedbackFor } from './feedback';
import { backAction } from './nav';
import { sanitizeProfile, teamLooks, type Profile, type TeamLook } from './profile';
import { chapterUnlocked, missionUnlocked, recordMission, totalStars } from './progress';
import { getSave, loadSave, onSaveChange, resetProgress, updateSave } from './save';
import {
  aimPreviewTicks,
  applySettings,
  sanitizeSettings,
  sightLength,
  turnTicks,
  type Settings,
  type SettingsTargets,
} from './settings';
import { createTally, recordMatch, tallyEvents, type MatchTally } from './stats';
import { GameLoop } from './loop';
import { INITIAL_UI, type GameMode, type Sheet, type UiState } from './state';
import { createStore, type Store } from './store';
import { hudPatch } from './hud';
import { ownedMapStyles } from './entitlement';
import { createMonetization, type MonetizationActions } from './monetization';
import { createOnline, inviteCodeFromUrl, type OnlineActions, type OnlineUi } from './online';
import { OnlinePlay } from './onlinePlay';

export interface GameActions extends MonetizationActions, OnlineActions {
  startHotseat(seed?: string): void;
  startBotMatch(difficulty: Difficulty, seed?: string): void;
  setTeamSize(n: number): void;
  setMapStyle(style: MapStyle | 'random'): void;
  openCampaign(): void;
  selectChapter(chapter: number): void;
  openMission(id: string | null): void;
  startMission(id: string): void;
  nextMission(): void;
  /** Leave a campaign match for the mission grid. */
  toMissions(): void;
  startDaily(): void;
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
  /** Start the current match over (same map; daily: a practice attempt). */
  restart(): void;
  setDifficulty(d: Difficulty): void;
  /** Open a full-page sub-screen (settings, stats, team, quick match options) or close it. */
  openSheet(sheet: Sheet): void;
  updateSettings(patch: Partial<Settings>): void;
  updateProfile(patch: Partial<Profile>): void;
  /** Wipe campaign, daily and stats (settings and team are kept). */
  resetProgress(): void;
  /** Open a web page (privacy policy, support) in the browser. */
  openLink(url: string): void;
  /** Hardware back button / Escape. */
  back(): void;
  /** Online: play the opponent's turn being watched at once. */
  onlineSkipReplay(): void;
  /** Leave an online match for the online screen (the match goes on). */
  onlineLeave(): void;
}

export interface GameHandle {
  store: Store<UiState>;
  actions: GameActions;
}

const SKY = 320;
/** How often a waiting online match asks for the opponent's turn. */
const ONLINE_POLL_MS = 4000;
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

  const testMode = new URLSearchParams(location.search).has('test');
  /** Today's date key; `?test&today=YYYY-MM-DD` pins it for deterministic e2e runs. */
  const today = (): string => {
    const forced = new URLSearchParams(location.search).get('today');
    return testMode && forced && /^\d{4}-\d{2}-\d{2}$/.test(forced) ? forced : dateKey(new Date());
  };
  const initialSave = loadSave();
  const store = createStore<UiState>({
    ...INITIAL_UI,
    lang: getLanguage(),
    save: initialSave,
    today: today(),
    difficulty: initialSave.quick.difficulty,
    teamSize: initialSave.quick.teamSize,
    mapStyle: initialSave.quick.mapStyle,
  });
  const audio = new AudioEngine();
  const platform = getPlatform();
  const haptics = platform.haptics;
  const shop = createMonetization({ store, platform, audio });
  const params = new URLSearchParams(location.search);
  // Online (M9): Supabase when the build has a backend; the in-browser mock in tests and web dev.
  const onlineService = selectOnline({
    native: platform.native,
    ...onlineEnv(),
    storage: platform.storage,
    forceMock: testMode || params.has('mockOnline'),
  });
  const online = createOnline({
    store,
    service: onlineService,
    storage: platform.storage,
    playerName: () => ownName(),
    seed: () => `on-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    play: (m, turns) => startOnline(m, turns),
    share: (text) => platform.share.share(text),
    toast: (text) => toast(text),
    t: (key, vars) => t(key as TranslationKey, vars),
  });
  const patchOnline = (p: Partial<OnlineUi>): void =>
    store.set({ online: { ...store.get().online, ...p } });
  // Browsers only start audio from a user gesture.
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  onLanguageChange(() => {
    store.set({ lang: getLanguage() });
    if (match) publishHud();
  });
  const view = new WorldView();
  app.stage.addChild(view.root);
  /** Screen-space arrows toward off-screen enemies (above the world, below the DOM HUD). */
  const indicators = new EdgeIndicators();
  app.stage.addChild(indicators.view);

  let match: MatchState | null = null;
  /** The online match being played (M9), with its driver. */
  let onlinePlay: OnlinePlay | null = null;
  let onlineMatch: OnlineMatch | null = null;
  let onlinePoll: ReturnType<typeof setInterval> | null = null;
  let prev: Snapshot | null = null;
  let pending: Command[] = [];
  let cam: Camera = { x: 800, y: 500, zoom: 1 };
  let manualCamUntil = 0;
  let aim: Aim | null = null;
  let hudAcc = 0;
  let renderingStopped = false;
  /**
   * Match-start camera tour over the enemies and back (render only: the simulation is paused while
   * it runs, so ticks, commands and replays are unaffected). A touch on the map skips it. E2E runs
   * (`?test`) skip it unless `&intro` is given, so their aiming gestures stay deterministic.
   */
  let intro: { points: Point[]; t: number; total: number } | null = null;
  let introPending = false;
  const introAllowed = !testMode || new URLSearchParams(location.search).has('intro');

  // Settings (persisted in the save) are pushed to the audio, language, renderer and page.
  const settingsTargets: SettingsTargets = {
    setLanguage: (lang) => setLanguage(lang ?? deviceLanguage()),
    setSound: (on) => audio.setMuted(!on),
    setReducedMotion(on) {
      view.setOptions({ reducedMotion: on });
      document.documentElement.classList.toggle('reduce-motion', on);
    },
    setLargeText: (on) => document.documentElement.classList.toggle('large-text', on),
  };
  let applied = initialSave.settings;
  applySettings(applied, settingsTargets);
  store.set({ lang: getLanguage() });
  onSaveChange((save) => {
    store.set({ save });
    applySettings(save.settings, settingsTargets, applied);
    applied = save.settings;
  });
  const settings = (): Settings => getSave().settings;

  const viewport = (): Viewport => ({ width: app.screen.width, height: app.screen.height });
  const bounds = (): WorldBounds =>
    match
      ? { width: match.terrain.width, height: match.terrain.height, sky: SKY }
      : { width: 1600, height: 900, sky: SKY };

  const loop = new GameLoop({
    onTick() {
      if (!match) return;
      let cmds = pending;
      pending = [];
      if (onlinePlay) {
        const remote = onlinePlay.beforeStep(match, cmds);
        if (!remote) {
          waitForOpponent();
          return;
        }
        cmds = remote;
      }
      prev = snapshot(match);
      step(match, cmds);
      if (onlinePlay) afterOnlineStep(match);
      handleEvents(match);
    },
    onRender(alpha, dt) {
      if (!match) return;
      if (!loop.isPaused) driveBot();
      if (intro) {
        intro.t += dt;
        if (intro.t >= intro.total) endIntro();
      }
      updateCamera(dt);
      view.render(match, prev, alpha, dt, cam);
      drawAimOverlay();
      drawIndicators(dt);
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
  /**
   * The canvas only draws while a match is on screen: the menus are opaque DOM, so an idle Pixi
   * ticker would just burn battery redrawing the last island. Tests that drive frames by hand
   * (`stopRendering` / `renderFrames`) keep it stopped, so a test page is never busy drawing.
   */
  const setDrawing = (on: boolean): void => {
    if (on && !renderingStopped) app.ticker.start();
    else app.ticker.stop();
  };
  setDrawing(false);

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
    mode: GameMode;
    setup: MatchSetup;
    /** Difficulty of the bot teams, or null for pass & play. */
    bot: Difficulty | null;
    missionId?: string;
    /** Daily challenge: the date played and whether this is the official attempt. */
    daily?: { day: string; official: boolean };
    /** Online match: its driver and the turns stored so far. */
    online?: { play: OnlinePlay; turns: TurnRecord[] };
  }
  let lastOptions: MatchOptions | null = null;
  /** The pause overlay was opened over the hotseat hand-over screen (back button). */
  let pausedOverPass = false;

  /** Is the team played by someone holding the phone? */
  const isHuman = (team: number): boolean =>
    onlinePlay ? onlinePlay.isLocal(team) : !match?.teams[team]?.bot;
  /** Pass & play needs the hand-over screen; against a bot it would only get in the way. */
  const needsPass = (): boolean =>
    !!match && !onlinePlay && match.teams.filter((tm) => !tm.bot).length > 1;

  /** Colors and hats of a match's teams (team 0 = the player's customized crew). */
  let looks: TeamLook[] = [];
  const looksFor = (teams: number): TeamLook[] =>
    teamLooks(teams, getSave().profile, totalStars(getSave()), store.get().fullVersion);
  const teamCss = (team: number): string =>
    cssColor(TEAM_COLORS[(looks[team]?.color ?? team) % TEAM_COLORS.length] as number);
  /** The player's team name, or `fallback` when not customized. */
  const playerName = (fallback: string): string => getSave().profile.name || fallback;
  /** Default name of a team by its color ("Cyan Crew", …). */
  const colorName = (look: TeamLook | undefined, team: number): string =>
    t(`team.${look?.color ?? team}` as 'team.0');
  /** The player's crew name in every mode: the custom name, else the color name (Team screen). */
  const ownName = (): string => playerName(colorName(looksFor(1)[0], 0));

  /** Two-team setup for pass & play and quick matches. */
  function versusSetup(
    seed: string,
    bot: Difficulty | null,
    size: number,
    style: MapStyle,
  ): MatchSetup {
    const lk = looksFor(2);
    return {
      seed,
      map: { width: 1600, height: 900, waterLevel: 860, style },
      teams: [0, 1].map((i) => ({
        name:
          i === 1 && bot
            ? t(`bot.name.${bot}` as 'bot.name.1')
            : i === 0
              ? ownName()
              : colorName(lk[1], 1),
        units: Array.from({ length: size }, (_, k) => `${String.fromCharCode(65 + k)}${i + 1}`),
        bot: i === 1 && bot !== null,
      })),
    };
  }

  /** Display names of a mission's teams: you, then the bot crews. */
  function missionNames(m: Mission): string[] {
    const lk = looksFor(m.enemies.length + 1);
    return [
      ownName(),
      ...m.enemies.map((_, i) =>
        m.enemies.length === 1
          ? t(`bot.name.${m.bot}` as 'bot.name.1')
          : colorName(lk[i + 1], i + 1),
      ),
    ];
  }

  function startMatch(opts: MatchOptions): void {
    lastOptions = opts;
    bot = null;
    stopOnlinePoll();
    onlinePlay = opts.online?.play ?? null;
    shotsFired = opts.setup.teams.map(() => 0);
    // The turn time setting applies to every new match (and replays: it is part of the setup);
    // an online match is rebuilt from its stored turns with the agreed turn time.
    match = onlinePlay
      ? onlinePlay.start(opts.online?.turns ?? [])
      : createMatch({
          ...opts.setup,
          config: { ...opts.setup.config, turnTicks: turnTicks(settings()) },
        });
    tally = createTally(match.activeTeam, onlinePlay?.myTeam ?? 0);
    intro = null;
    // The camera tour only opens a fresh match (an online one may resume many turns in).
    introPending = !onlinePlay || (opts.online?.turns.length ?? 0) === 0;
    prev = null;
    pending = [];
    aim = null;
    looks = looksFor(match.teams.length);
    // Online the player's own crew look goes to the team they hold.
    if (onlinePlay?.myTeam === 1) looks = [looks[1], looks[0]] as TeamLook[];
    view.setOptions({
      reducedMotion: settings().reducedMotion,
      looks: looks.map((l) => ({ color: TEAM_COLORS[l.color] as number, hat: l.hat })),
    });
    view.setMatch(match);
    setDrawing(true);
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
      sheet: null,
      mode: opts.mode,
      missionId: opts.missionId ?? null,
      missionIntro: null,
      result: null,
      overlay: needsPass() ? 'pass' : null,
      winner: null,
      weaponsOpen: false,
      weapon: 'bazooka',
      botThinking: false,
    });
    publishHud();
    loop.reset();
    if (onlinePlay?.desync) {
      showDesync(onlinePlay.desync);
    } else if (needsPass()) {
      loop.pause();
      // Render one frame so the pass screen has the island behind it.
      view.render(match, null, 1, 0, cam);
    } else {
      loop.resume();
      beginTurn();
      startIntro();
    }
  }

  /** Start the match-start camera tour (once per match, when play first begins). */
  function startIntro(): void {
    if (!introPending) return;
    introPending = false;
    const s = match;
    const u = s && activeUnit(s);
    if (!s || !u || !introAllowed || settings().reducedMotion) return;
    // Whose enemies to show: the player holding the phone (the active team, or the first human).
    const viewer = isHuman(s.activeTeam)
      ? s.activeTeam
      : (s.teams.find((tm) => !tm.bot)?.id ?? s.activeTeam);
    const enemies = s.units
      .filter((x) => x.alive && x.team !== viewer)
      .map((x) => ({ x: fxToFloat(x.x), y: fxToFloat(x.y) - 40 }));
    const points = planIntroPan({ x: cam.x, y: cam.y }, enemies, viewport().width / cam.zoom);
    if (points.length === 0) return;
    intro = { points, t: 0, total: panDuration(points) };
    loop.pause();
  }

  function endIntro(): void {
    if (!intro) return;
    intro = null;
    // A bot that started thinking under the tour gets its full think time afterwards.
    if (bot && !bot.chosen) bot.started = performance.now();
    if (match && store.get().overlay === null) loop.resume();
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
  /** The player's stats of the running match (committed when it ends). */
  let tally: MatchTally | null = null;
  const BOT_SLICE_MS = 6;
  const BOT_MIN_THINK_MS = 900;
  const BOT_MAX_THINK_MS = 2600;
  const BOT_SHOW_AIM_MS = 650;

  /** Called when a turn begins (after the pass screen, if any). */
  function beginTurn(): void {
    const s = match;
    if (!s || s.phase !== 'aiming') return;
    if (isHuman(s.activeTeam) || onlinePlay) {
      bot = null;
      store.set({ botThinking: false });
      return;
    }
    try {
      bot = {
        search: new BotSearch(s, lastOptions?.bot ?? 3),
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
    // Online matches span sessions, so only their result counts (no per-shot stats).
    if (tally && !onlinePlay) tallyEvents(tally, s.events, s.units);
    const hapticsOn = settings().haptics;
    for (const f of feedbackFor(s.events, s)) {
      if (f.kind === 'sfx') audio.play(f.sfx, f.a);
      else if (hapticsOn) haptics.impact(f.strength);
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
        recordStats(s);
        const result = recordResult(s);
        store.set({ overlay: result ? 'result' : 'over', winner: e.winner, result });
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

  /** Add the finished match to the player's lifetime stats. */
  function recordStats(s: MatchState): void {
    const t = tally;
    const mode = lastOptions?.mode;
    if (!t || !mode) return;
    tally = null;
    const record = (): void =>
      void updateSave((d) => {
        recordMatch(d.stats, {
          mode,
          won: s.winner === t.player,
          vsBot: s.teams.some((tm) => tm.bot),
          tally: t,
        });
      });
    // An online match can be watched to its end more than once: count it the first time only.
    if (onlineMatch && mode === 'online')
      void online.firstFinish(onlineMatch.id).then((first) => first && record());
    else record();
  }

  /** Persist a finished campaign / daily match and describe it for the result screen. */
  function recordResult(s: MatchState): UiState['result'] {
    const opts = lastOptions;
    if (!opts) return null;
    if (opts.mode === 'campaign' && opts.missionId) {
      const mission = missionById(opts.missionId);
      if (!mission) return null;
      const stars = scoreMission(s, mission);
      const before = getSave();
      const prevStars = before.campaign.stars[mission.id] ?? 0;
      const wasOpen = [1, 2, 3].map((c) => chapterUnlocked(before, c));
      const after = updateSave((d) => recordMission(d, mission.id, stars));
      const unlockedChapter =
        [1, 2, 3].find((c, i) => !wasOpen[i] && chapterUnlocked(after, c)) ?? null;
      const next = nextMission(mission.id);
      return {
        kind: 'campaign',
        missionId: mission.id,
        won: stars > 0,
        stars,
        prevStars,
        unlockedChapter,
        nextId: next && missionUnlocked(after, next) ? next.id : null,
        rulesMet: mission.stars.map((rule) => stars > 0 && ruleMet(rule, missionStats(s))),
      };
    }
    if (opts.mode === 'daily' && opts.daily) {
      const { day, official } = opts.daily;
      const score = dailyScore(s);
      const st = missionStats(s);
      const after = updateSave((d) => finishDaily(d, day, score, st.won, official));
      return {
        kind: 'daily',
        won: st.won,
        score,
        official,
        hpLeft: st.hpLeft,
        turns: st.turns,
        winBonus: st.won ? DAILY_WIN_BONUS : 0,
        turnCost: st.turns * DAILY_TURN_COST,
        best: after.daily.best,
        streak: currentStreak(after, day),
      };
    }
    return null;
  }

  function publishHud(): void {
    const s = match;
    if (!s) return;
    const u = activeUnit(s);
    const st = store.get();
    // Runs every 100 ms: only fields that really changed reach the store (no needless re-render).
    const patch = hudPatch(st, {
      phase: s.phase,
      activeTeam: s.activeTeam,
      activeName: s.teams[s.activeTeam]?.name ?? '',
      activeColor: teamCss(s.activeTeam),
      turnSeconds: Math.max(0, Math.ceil(s.turnTicksLeft / 60)),
      wind: s.wind,
      teams: s.teams.map((tm) => {
        const members = s.units.filter((x) => x.team === tm.id);
        return {
          id: tm.id,
          name: tm.name,
          hp: members.reduce((n, x) => n + (x.alive ? Math.max(0, x.hp) : 0), 0),
          maxHp: members.reduce((n, x) => n + x.maxHp, 0),
          alive: members.filter((x) => x.alive && x.hp > 0).length,
          color: teamCss(tm.id),
        };
      }),
      canMove: canMove(s) && !!u?.grounded && st.overlay === null && isHuman(s.activeTeam),
      canFire: canFire(s, st.weapon) && st.overlay === null && isHuman(s.activeTeam),
      botTurn: !isHuman(s.activeTeam),
      weaponInfo: weaponInfo(s),
    });
    if (Object.keys(patch).length > 0) store.set(patch);
    const replaying = !!onlinePlay?.replaying;
    if (st.online.replaying !== replaying) patchOnline({ replaying });
  }

  // ---------------------------------------------------------------------------------------------
  // Online matches (M9): the opponent's turns are played back live, ours are recorded and sent.
  // ---------------------------------------------------------------------------------------------

  function startOnline(m: OnlineMatch, turns: TurnRecord[]): void {
    const names = [0, 1].map((i) => m.names[i] ?? `#${i + 1}`);
    const setup = onlineSetup(m.params, names);
    onlineMatch = m;
    patchOnline({
      matchId: m.id,
      opponent: names[1 - m.myTeam] ?? '',
      desync: null,
      replaying: false,
    });
    startMatch({
      mode: 'online',
      setup,
      bot: null,
      online: { play: new OnlinePlay(setup, m.myTeam), turns },
    });
    // The opponent resigned (or a player ran out of time) meanwhile: nothing more will arrive.
    if (endedEarly(m)) showResigned(m);
  }

  function afterOnlineStep(s: MatchState): void {
    const r = onlinePlay?.afterStep(s);
    if (!r || !onlineMatch) return;
    if (r.desync) showDesync(r.desync);
    if (r.submit) void online.submit(onlineMatch.id, r.submit.turn, r.submit.outcome);
  }

  function showDesync(code: string): void {
    loop.pause();
    stopOnlinePoll();
    store.set({ overlay: 'desync', weaponsOpen: false });
    patchOnline({ desync: code, replaying: false });
  }

  function showResigned(m: OnlineMatch): void {
    loop.pause();
    stopOnlinePoll();
    // The game-over card reads why it ended from the list.
    patchOnline({ matches: [m, ...store.get().online.matches.filter((x) => x.id !== m.id)] });
    store.set({ overlay: 'over', winner: m.winner, weaponsOpen: false });
  }

  /** The opponent has not moved yet: pause, show the waiting card and poll for their turn. */
  function waitForOpponent(): void {
    if (store.get().overlay === 'waiting') return;
    loop.pause();
    store.set({ overlay: 'waiting', weaponsOpen: false });
    patchOnline({ replaying: false });
    stopOnlinePoll();
    onlinePoll = setInterval(() => void pollOpponent(), ONLINE_POLL_MS);
  }

  let polling = false;
  async function pollOpponent(): Promise<void> {
    const play = onlinePlay;
    const m = onlineMatch;
    if (!play || !m || polling) return;
    polling = true;
    try {
      const turns = await online.fetchTurns(m.id, play.nextIndex);
      if (play !== onlinePlay || !match) return;
      play.enqueue(turns);
      if (!play.waiting(match)) {
        stopOnlinePoll();
        if (store.get().overlay === 'waiting') {
          store.set({ overlay: null });
          loop.resume();
        }
        return;
      }
      if (turns.length === 0) {
        const latest = await onlineService.getMatch(m.id).catch(() => null);
        if (latest && play === onlinePlay && endedEarly(latest)) {
          onlineMatch = latest;
          showResigned(latest);
        }
      }
    } finally {
      polling = false;
    }
  }

  function stopOnlinePoll(): void {
    if (onlinePoll) clearInterval(onlinePoll);
    onlinePoll = null;
  }

  function weaponInfo(s: MatchState): UiState['weaponInfo'] {
    const team = s.teams[s.activeTeam];
    const turns = s.teamTurns[s.activeTeam] ?? 0;
    const out: UiState['weaponInfo'] = {};
    for (const w of WEAPON_IDS) {
      const def = WEAPONS[w];
      out[w] = {
        ammo: team?.ammo[w] ?? 0,
        ok: canFire(s, w) || s.phase !== 'aiming',
        fromTurn: def.fromTurn,
        unlocked: turns >= def.fromTurn,
      };
    }
    return out;
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
    if (intro) {
      const p = panAt(intro.points, intro.t);
      cam = clampCamera({ x: p.x, y: p.y, zoom: cam.zoom }, viewport(), bounds());
      return;
    }
    const target = performance.now() > manualCamUntil ? cameraTarget() : null;
    if (target) cam = followCamera(cam, clampCamera(target, viewport(), bounds()), dt, 4);
    cam = clampCamera(cam, viewport(), bounds());
  }

  /** Screen margins kept clear of the DOM HUD (top bar, bottom controls); re-measured twice a second. */
  let insets: Insets = { top: 80, right: 6, bottom: 150, left: 6 };
  let insetsAge = Infinity;
  function hudInsets(dt: number): Insets {
    insetsAge += dt;
    if (insetsAge < 0.5) return insets;
    insetsAge = 0;
    const r = app.canvas.getBoundingClientRect();
    const hud = document.querySelector('.hud')?.getBoundingClientRect();
    const ctl = document.querySelector('.controls')?.getBoundingClientRect();
    insets = {
      top: Math.max(6, (hud ? hud.bottom - r.top : 0) + 10),
      right: 6,
      bottom: Math.max(6, (ctl ? r.bottom - ctl.top : 0) + 10),
      left: 6,
    };
    return insets;
  }

  /** Edge arrows toward off-screen enemies while a human is aiming. */
  function drawIndicators(dt: number): void {
    const s = match;
    if (!s || intro || s.phase !== 'aiming' || !isHuman(s.activeTeam) || store.get().overlay) {
      indicators.draw([], dt);
      return;
    }
    const v = viewport();
    const margins = hudInsets(dt);
    const markers: ColoredMarker[] = [];
    for (const u of s.units) {
      if (!u.alive || u.hp <= 0 || u.team === s.activeTeam) continue;
      const c = unitCenter(u);
      const m = edgeMarker(cam, v, c.x, c.y, margins);
      if (m) {
        const color = TEAM_COLORS[(looks[u.team]?.color ?? u.team) % TEAM_COLORS.length] as number;
        markers.push({ ...m, color });
      }
    }
    indicators.draw(markers, dt);
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
    // A touch during the match-start tour only skips it.
    if (intro) {
      endIntro();
      return;
    }
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
    const color = TEAM_COLORS[(looks[u.team]?.color ?? u.team) % TEAM_COLORS.length] as number;
    const weapon = WEAPONS[aim ? store.get().weapon : (bot?.chosen?.weapon ?? 'bazooka')];
    if (weapon.aim === 'direction') {
      const fixed = weapon.id === 'drill' ? weapon.range : 0;
      view.drawSight(c.x, c.y, shown.angle, sightLength(settings(), fixed), color);
    } else {
      const speed = (fxToFloat(MAX_LAUNCH_SPEED) * weapon.speedPct) / 100;
      const gravity =
        (((fxToFloat(GRAVITY) * weapon.gravityPct) / 100) * s.config.gravityPct) / 100;
      const pts = previewArc(shown, speed, gravity, aimPreviewTicks(settings()), 3);
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
    ...shop.actions,
    startHotseat(seed) {
      const sd = seed ?? `hs-${Date.now().toString(36)}`;
      startMatch({ mode: 'hotseat', setup: versusSetup(sd, null, 3, 'hills'), bot: null });
    },
    startBotMatch(difficulty, seed) {
      actions.setDifficulty(difficulty);
      const st = store.get();
      const sd = seed ?? `bot-${Date.now().toString(36)}`;
      const style =
        st.mapStyle === 'random'
          ? pick(createRng(`style:${sd}`), ownedMapStyles(st.fullVersion))
          : st.mapStyle;
      startMatch({
        mode: 'quick',
        setup: versusSetup(sd, difficulty, st.teamSize, style),
        bot: difficulty,
      });
    },
    setTeamSize(n) {
      const teamSize = Math.min(4, Math.max(2, Math.round(n)));
      store.set({ teamSize });
      if (getSave().quick.teamSize !== teamSize)
        updateSave((d) => void (d.quick.teamSize = teamSize));
    },
    setMapStyle(style) {
      store.set({ mapStyle: style });
      if (getSave().quick.mapStyle !== style) updateSave((d) => void (d.quick.mapStyle = style));
    },
    openCampaign() {
      const save = getSave();
      // Open on the newest unlocked chapter.
      const chapter = [3, 2, 1].find((c) => chapterUnlocked(save, c)) ?? 1;
      store.set({ screen: 'campaign', chapter, missionIntro: null, overlay: null, result: null });
    },
    selectChapter(chapter) {
      store.set({ chapter, missionIntro: null });
    },
    openMission(id) {
      const m = id ? missionById(id) : undefined;
      if (id && (!m || !missionUnlocked(getSave(), m))) return;
      store.set({ missionIntro: m ? m.id : null });
    },
    startMission(id) {
      const m = missionById(id);
      if (!m || !missionUnlocked(getSave(), m)) return;
      store.set({ chapter: m.chapter });
      startMatch({
        mode: 'campaign',
        setup: missionSetup(m, missionNames(m)),
        bot: m.bot,
        missionId: m.id,
      });
    },
    nextMission() {
      const r = store.get().result;
      if (r?.kind === 'campaign' && r.nextId) {
        const m = missionById(r.nextId);
        actions.toMissions();
        if (m) store.set({ chapter: m.chapter, missionIntro: m.id });
      }
    },
    toMissions() {
      actions.toMenu();
      store.set({ screen: 'campaign' });
    },
    startDaily() {
      const day = today();
      let official = false;
      updateSave((d) => {
        official = beginDaily(d, day).official;
      });
      const seed = dailySeed(day);
      startMatch({
        mode: 'daily',
        setup: dailySetup(seed, [ownName(), t(`bot.name.${DAILY_BOT}`)]),
        bot: DAILY_BOT,
        daily: { day, official },
      });
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
      startIntro();
    },
    rematch() {
      const o = lastOptions;
      if (!o) return;
      if (o.mode === 'online') {
        actions.onlineLeave();
        return;
      }
      if (o.mode === 'campaign' && o.missionId) actions.startMission(o.missionId);
      else if (o.mode === 'daily') actions.startDaily();
      else startMatch({ ...o, setup: { ...o.setup, seed: `${o.setup.seed}+` } });
    },
    toMenu() {
      match = null;
      intro = null;
      introPending = false;
      bot = null;
      onlinePlay = null;
      onlineMatch = null;
      stopOnlinePoll();
      patchOnline({ matchId: null, replaying: false, desync: null });
      loop.pause();
      setDrawing(false);
      view.clearAim();
      tally = null;
      store.set({ screen: 'menu', overlay: null, sheet: null, result: null, today: today() });
    },
    pause() {
      const overlay = store.get().overlay;
      if (overlay && overlay !== 'pass') return;
      // Over the hand-over screen the loop is already paused; resuming goes back to it.
      pausedOverPass = overlay === 'pass';
      loop.pause();
      store.set({ overlay: 'pause' });
    },
    resume() {
      if (store.get().overlay !== 'pause') return;
      if (pausedOverPass) {
        store.set({ overlay: 'pass' });
        return;
      }
      store.set({ overlay: null });
      // Paused during the match-start tour: the tour's end resumes the simulation.
      if (!intro) loop.resume();
    },
    restart() {
      const o = lastOptions;
      if (!o || !match || o.mode === 'online') return;
      if (o.mode === 'campaign' && o.missionId) actions.startMission(o.missionId);
      else if (o.mode === 'daily') actions.startDaily();
      else startMatch(o);
    },
    setDifficulty(d) {
      store.set({ difficulty: d });
      if (getSave().quick.difficulty !== d) updateSave((sv) => void (sv.quick.difficulty = d));
    },
    openSheet(sheet) {
      store.set({ sheet, weaponsOpen: false });
    },
    updateSettings(patch) {
      const before = settings();
      const next = sanitizeSettings({ ...before, ...patch });
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      updateSave((d) => void (d.settings = next));
      if (next.sound && !before.sound) audio.play('tap');
      if (next.haptics && !before.haptics) haptics.impact('light');
    },
    updateProfile(patch) {
      const next = sanitizeProfile({ ...getSave().profile, ...patch });
      if (JSON.stringify(next) === JSON.stringify(getSave().profile)) return;
      updateSave((d) => void (d.profile = next));
    },
    resetProgress() {
      updateSave((d) => resetProgress(d));
    },
    openLink(url) {
      platform.links.open(url);
    },
    back() {
      const st = store.get();
      switch (backAction(st)) {
        case 'closeSheet':
          store.set({ sheet: null });
          break;
        case 'closeWeapons':
          actions.toggleWeapons(false);
          break;
        case 'closeIntro':
          actions.openMission(null);
          break;
        case 'pause':
          actions.pause();
          break;
        case 'resume':
          actions.resume();
          break;
        case 'leaveMatch':
          if (st.mode === 'campaign') actions.toMissions();
          else if (st.mode === 'online') actions.onlineLeave();
          else actions.toMenu();
          break;
        case 'toMenu':
          actions.toMenu();
          break;
        case 'minimize':
          platform.lifecycle.minimizeApp();
          break;
        case 'none':
          break;
      }
    },
    ...online.actions,
    onlineSkipReplay() {
      const s = match;
      if (!s || !onlinePlay?.replaying) return;
      onlinePlay.fastForward(s, (st, cmds) => {
        step(st, cmds);
        handleEvents(st);
      });
      prev = null;
      view.setMatch(s);
      publishHud();
      if (onlinePlay.desync) showDesync(onlinePlay.desync);
    },
    onlineLeave() {
      actions.toMenu();
      actions.openOnline();
    },
  };
  shop.gate(actions);
  // Claiming the win from the waiting card ends the match on screen too.
  const claimOnline = actions.onlineClaimTimeout;
  actions.onlineClaimTimeout = async (id) => {
    await claimOnline(id);
    const m = store.get().online.matches.find((x) => x.id === id);
    if (m && onlineMatch?.id === id && endedEarly(m)) {
      onlineMatch = m;
      showResigned(m);
    }
  };
  // A rematch asked for on the game-over card leaves the finished match first.
  const rematchOnline = actions.onlineRematch;
  actions.onlineRematch = async (id) => {
    if (match) actions.toMenu();
    await rematchOnline(id);
  };
  // Register for "your turn" pushes once the player takes part in an online match.
  for (const name of ['onlineCreate', 'onlineJoin', 'onlineRematch'] as const) {
    const inner = actions[name];
    actions[name] = async (id?: string) => {
      await inner(id as string);
      // Not after an error, nor while the Full Version sheet is asking first.
      if (store.get().online.error || store.get().paywall.open) return;
      const reg = await platform.push.register();
      if (reg)
        await onlineService
          .registerPushToken(reg.token, reg.platform, getLanguage())
          .catch(() => undefined);
    };
  }
  // Invite links (`craterpult://join/CODE`; `?join=CODE` on the web) and push taps.
  const openInvite = (code: string): void => {
    if (code && store.get().screen !== 'playing') actions.openOnline(code);
  };
  platform.lifecycle.onAppUrl((url) => openInvite(inviteCodeFromUrl(url)));
  if (params.has('join')) openInvite(inviteCodeFromUrl(location.search));
  platform.push.onOpen((data) => {
    if (store.get().screen === 'playing') return;
    if (data.matchId) void actions.onlineOpen(data.matchId);
    else actions.openOnline();
  });

  // Android back button / Escape: close, pause or go back; minimizes (never exits) from the menu.
  platform.lifecycle.onBackButton(() => actions.back());

  // Mobile shell (T7.1): app sent to the background (or tab hidden) pauses a running match.
  platform.lifecycle.onPause(() => {
    if (match) actions.pause();
  });

  if (testMode) {
    const purchasesTestApi = await shop.testSetup(new URLSearchParams(location.search));
    (window as unknown as { __craterpult: unknown }).__craterpult = {
      ready: true,
      actions,
      purchases: purchasesTestApi,
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
      getSave: () => getSave(),
      back: () => actions.back(),
      chapterMissions: (c: number) => chapterMissions(c).map((m) => m.id),
      /** Knock out every enemy unit and end the human's turn: the match resolves as a win. */
      finishEnemies: (): boolean => {
        const s = match;
        if (!s) return false;
        for (const u of s.units) {
          if (u.team !== 0 && u.alive) {
            u.hp = 0;
            u.pendingDamage = 0;
          }
        }
        if (s.phase === 'aiming' && isHuman(s.activeTeam)) pending.push({ t: 'skip' });
        return true;
      },
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
      /** The match-start camera tour is running (only with `?test&intro`). */
      introActive: () => intro !== null,
      stepTicks: (n: number) => loop.stepTicks(n),
      unitScreen: () => activeUnitScreen(),
      stopRendering: () => {
        renderingStopped = true;
        setDrawing(false);
      },
      renderFrames: (n: number) => {
        for (let i = 0; i < n; i++) {
          if (!match) break;
          updateCamera(1);
          view.render(match, null, 1, 1 / 60, cam);
          drawAimOverlay();
          drawIndicators(1 / 60);
        }
        publishHud();
        app.render();
      },
    };
  }

  return { store, actions };
}
