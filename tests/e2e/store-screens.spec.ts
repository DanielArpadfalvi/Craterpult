import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { opaquePng } from '../../scripts/png-opaque';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { evaluate } from '../../src/core/ai/bot';
import type { Command, MatchState } from '../../src/core/types';
import { createDefaultSave, SAVE_KEY, type SaveData } from '../../src/game/save';
import {
  SCENES,
  STORE_TARGETS,
  frameHtml,
  sceneFileName,
  type SceneDef,
  type SceneId,
  type StoreLang,
  type StoreTarget,
} from '../../scripts/store-frames';

/**
 * Store screenshots from the real game (`npm run store:screens`, config:
 * `playwright.store.config.ts`). Every scene boots a fresh context with a staged save (Full
 * Version, campaign progress, a daily streak, a customized team), drives the game through the
 * `?test` hooks with the render loop stopped, captures the raw frame at the store device size and
 * composes the captioned marketing frame into `store/screenshots/<lang>/<target>/NN-scene.png`.
 * Shots are planned in Node with the core's own shot evaluator on a copy of the live match, so
 * every capture is deterministic (seeded maps, no real-time bot thinking).
 */

const OUT = 'store/screenshots';
const RAW = 'node_modules/.cache/craterpult-store/raw';
const TODAY = '2026-10-06';
const LANGS: readonly StoreLang[] = ['en', 'hu'];
/** Optional scene filter: `STORE_SCENES=aim,blast npm run store:screens`. */
const ONLY = (process.env.STORE_SCENES ?? '').split(',').filter(Boolean);
/** `STORE_COMPOSE_ONLY=1`: rebuild the frames from the last raw captures. */
const COMPOSE_ONLY = process.env.STORE_COMPOSE_ONLY === '1';

type FireCmd = Extract<Command, { t: 'fire' }>;

interface Api {
  ready: boolean;
  actions: Record<string, (...args: unknown[]) => void>;
  getMatch(): MatchState | null;
  summary(): { tick: number; phase: string; activeTeam: number; winner: number | null } | null;
  command(c: Command): void;
  stepTicks(n: number): void;
  stopRendering(): void;
  renderFrames(n: number): void;
  playBotTurn(): boolean;
  unitScreen(): { x: number; y: number } | null;
}

// ------------------------------------------------------------------------------- staged save

function isoDay(offset: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** A seasoned player's save: campaign progress, a daily streak and a customized crew. */
function stagedSave(lang: StoreLang): SaveData {
  const s = createDefaultSave();
  s.settings.language = lang;
  s.settings.sound = false;
  s.settings.aimPreview = 'long';
  s.profile = { name: lang === 'hu' ? 'Kráterkirályok' : 'Crater Kings', color: 0, hat: 'crown' };
  s.quick = { difficulty: 3, teamSize: 3, mapStyle: 'hills' };
  const ch1 = [3, 3, 2, 3, 3, 3, 2, 3, 3, 3];
  const ch2 = [3, 2, 3, 3, 2, 3, 3];
  ch1.forEach((n, i) => (s.campaign.stars[`c1-${String(i + 1).padStart(2, '0')}`] = n));
  ch2.forEach((n, i) => (s.campaign.stars[`c2-${String(i + 1).padStart(2, '0')}`] = n));
  const scores = [1180, 1420, 960, 1610, 1290, 1530, 1840, 1350, 1475, 1220, 1690, 1390];
  scores.forEach((score, i) => {
    s.daily.days[isoDay(i - scores.length)] = {
      score,
      won: true,
      official: true,
      done: true,
      practiceBest: 0,
    };
  });
  s.daily.best = Math.max(...scores);
  s.daily.streak = { current: scores.length, best: scores.length, last: isoDay(-1) };
  return s;
}

// ------------------------------------------------------------------------------- page helpers

async function openGame(
  browser: Browser,
  target: StoreTarget,
  lang: StoreLang,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: target.capture.viewport,
    deviceScaleFactor: target.capture.scale,
    isMobile: true,
    hasTouch: true,
    locale: lang === 'hu' ? 'hu-HU' : 'en-US',
  });
  await context.addInitScript(
    ([key, data]) => {
      try {
        localStorage.setItem(key, data);
      } catch {
        // ignore
      }
    },
    [SAVE_KEY, JSON.stringify(stagedSave(lang))] as const,
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test&full&today=${TODAY}`);
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: Api }).__craterpult?.ready === true,
  );
  await hook(page, (api) => api.stopRendering());
  expect(errors).toEqual([]);
  return { context, page };
}

const hook = <R, A = undefined>(page: Page, fn: (api: Api, arg: A) => R, arg?: A): Promise<R> =>
  page.evaluate(
    ([src, a]) => {
      const api = (window as unknown as { __craterpult: unknown }).__craterpult;
      return new Function('api', 'arg', `return (${src})(api, arg);`)(api, a) as R;
    },
    [fn.toString(), arg] as const,
  ) as Promise<R>;

const summary = (page: Page) => hook(page, (api) => api.summary());
const stepTicks = (page: Page, n: number) => hook(page, (api, k: number) => api.stepTicks(k), n);
const renderFrames = (page: Page, n: number) =>
  hook(page, (api, k: number) => api.renderFrames(k), n);

/** Step the sim and render every frame, as in real time (effects and trails age naturally). */
const playFrames = (page: Page, n: number): Promise<void> =>
  hook(
    page,
    (api, k: number) => {
      for (let i = 0; i < k; i++) {
        api.stepTicks(1);
        api.renderFrames(1);
      }
    },
    n,
  );

/** Copy of the live match (terrain cells travel as base64). */
async function liveMatch(page: Page): Promise<MatchState> {
  const json = await hook(page, (api) => {
    const m = api.getMatch();
    return JSON.stringify(m, (_k, v: unknown) => {
      if (!(v instanceof Uint8Array)) return v;
      let bin = '';
      for (let i = 0; i < v.length; i += 0x8000) {
        bin += String.fromCharCode(...v.subarray(i, i + 0x8000));
      }
      return { __u8: btoa(bin) };
    });
  });
  return JSON.parse(json, (_k, v: unknown) =>
    v && typeof v === 'object' && '__u8' in v
      ? new Uint8Array(Buffer.from((v as { __u8: string }).__u8, 'base64'))
      : v,
  ) as MatchState;
}

/**
 * The best bazooka shot for the active (human) unit, by the bot's own evaluator. Among shots that
 * do about as much damage, a higher lob wins: the arc reads better in a screenshot.
 */
function planShot(s: MatchState): FireCmd {
  let best: FireCmd = { t: 'fire', weapon: 'bazooka', angle: 450, power: 60 };
  let bestScore = -Infinity;
  for (let angle = 150; angle <= 1650; angle += 25) {
    // No near-vertical shots: the preview would leave the screen.
    if (angle > 700 && angle < 1100) continue;
    for (let power = 35; power <= 100; power += 5) {
      const cmd: FireCmd = { t: 'fire', weapon: 'bazooka', angle, power };
      const lob = Math.sin((angle / 1800) * Math.PI); // 1 = straight up
      const score = evaluate(s, cmd, s.activeTeam, 1) + lob * 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = cmd;
      }
    }
  }
  return best;
}

async function stepUntil(
  page: Page,
  pred: (s: NonNullable<Awaited<ReturnType<typeof summary>>>) => boolean,
  maxTicks = 3000,
): Promise<void> {
  let s = await summary(page);
  for (let t = 0; t < maxTicks && s && !pred(s) && s.phase !== 'over'; t += 15) {
    await stepTicks(page, 15);
    s = await summary(page);
  }
}

/** Seeded quick match against medium bots; plays `rounds` full rounds (you, then the bot). */
async function startMatch(page: Page, seed: string, rounds: number): Promise<void> {
  await hook(page, (api, sd: string) => api.actions.startBotMatch?.(3, sd), seed);
  await expect(page.getByTestId('hud')).toBeVisible();
  await stepTicks(page, 30);
  for (let r = 0; r < rounds; r++) {
    const cmd = planShot(await liveMatch(page));
    await hook(page, (api, c: Command) => api.command(c), cmd);
    await stepUntil(page, (s) => s.activeTeam === 1 && s.phase === 'aiming');
    expect(await hook(page, (api) => api.playBotTurn())).toBe(true);
    await stepTicks(page, 5);
    await stepUntil(page, (s) => s.activeTeam === 0 && s.phase === 'aiming');
  }
  await stepTicks(page, 20);
  // Let the last blast, damage numbers and toasts fade.
  await renderFrames(page, 120);
  await page.waitForTimeout(2400);
}

/**
 * A wheel event on the game canvas (zoom) also pins the camera for 2.5 s against auto-follow.
 * Dispatched on the canvas itself: the DOM HUD lies on top of it.
 */
async function wheel(page: Page, deltaY: number): Promise<void> {
  await page.locator('canvas').dispatchEvent('wheel', { deltaY, bubbles: true, cancelable: true });
}

async function pinCamera(page: Page): Promise<void> {
  await wheel(page, 1);
  await wheel(page, -1);
}

// ------------------------------------------------------------------------------- scenes

async function sceneAim(page: Page): Promise<void> {
  await startMatch(page, 'store-aim-2', 1);
  const cmd = planShot(await liveMatch(page));
  await hook(page, (api) => api.actions.selectWeapon?.('bazooka'));
  // Zoom out a little so the target crew is in frame too.
  await wheel(page, 240);
  await renderFrames(page, 3);
  const box = (await page.locator('canvas').boundingBox())!;
  const u = (await hook(page, (api) => api.unitScreen()))!;
  const ux = box.x + u.x;
  const uy = box.y + u.y;
  // Drag back opposite the shot direction (aimFromDrag: 140 px = full power).
  const rad = ((cmd.angle ?? 0) / 10) * (Math.PI / 180);
  const len = ((cmd.power ?? 0) / 100) * 140;
  await page.mouse.move(ux, uy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ux - Math.cos(rad) * len * (i / 8), uy + Math.sin(rad) * len * (i / 8));
  }
  await renderFrames(page, 2);
  await page.waitForTimeout(300);
}

async function sceneBlast(page: Page): Promise<void> {
  await startMatch(page, 'store-blast-1', 1);
  const cmd = planShot(await liveMatch(page));
  await hook(page, (api, c: Command) => api.command(c), cmd);
  // Follow the shell frame by frame (trail particles are spawned while rendering).
  let flying = false;
  for (let i = 0; i < 600; i++) {
    await stepTicks(page, 1);
    const n = await hook(page, (api) => api.getMatch()?.projectiles.length ?? 0);
    if (n > 0) flying = true;
    else if (flying) break;
    await renderFrames(page, 1);
  }
  // Impact: hold the camera on the blast (it would snap back to the shooter) while it grows.
  await pinCamera(page);
  await renderFrames(page, 1);
  await playFrames(page, Number(process.env.STORE_BLAST_FRAMES ?? 6));
  await page.waitForTimeout(200);
}

async function sceneWeapons(page: Page): Promise<void> {
  // Turn 4: every weapon is unlocked.
  await startMatch(page, 'store-weapons-1', 3);
  await page.getByTestId('weapon').click();
  await expect(page.getByTestId('weapon-panel')).toBeVisible();
  await renderFrames(page, 2);
  await page.waitForTimeout(600);
}

async function sceneCampaign(page: Page): Promise<void> {
  await page.getByTestId('open-campaign').click();
  await expect(page.getByTestId('campaign')).toBeVisible();
  await page.getByTestId('chapter-tab-1').click();
  await page.waitForTimeout(900);
}

async function sceneDaily(page: Page): Promise<void> {
  await hook(page, (api) => api.actions.setDifficulty?.(3));
  await expect(page.getByTestId('daily-card')).toBeVisible();
  await page.waitForTimeout(900);
}

async function sceneTeam(page: Page): Promise<void> {
  await page.getByTestId('open-team').click();
  await expect(page.getByTestId('team')).toBeVisible();
  await page.waitForTimeout(900);
}

const SCENE_FNS: Record<SceneId, (page: Page) => Promise<void>> = {
  aim: sceneAim,
  blast: sceneBlast,
  weapons: sceneWeapons,
  campaign: sceneCampaign,
  daily: sceneDaily,
  team: sceneTeam,
};

// ------------------------------------------------------------------------------- composition

async function compose(
  browser: Browser,
  target: StoreTarget,
  scene: SceneDef,
  lang: StoreLang,
  raw: Buffer,
): Promise<string> {
  const context = await browser.newContext({
    viewport: target.output.viewport,
    deviceScaleFactor: target.output.scale,
  });
  const page = await context.newPage();
  const html = frameHtml({
    target,
    scene,
    lang,
    shot: `data:image/png;base64,${raw.toString('base64')}`,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const file = join(OUT, lang, target.id, sceneFileName(scene));
  mkdirSync(dirname(file), { recursive: true });
  // Opaque, lossless; no alpha channel (App Store rejects screenshots with transparency).
  const png = await page.screenshot();
  writeFileSync(file, opaquePng(png));
  await context.close();
  return file;
}

for (const lang of LANGS) {
  test(`store screenshots (${lang})`, async ({ browser }, testInfo) => {
    const target = STORE_TARGETS.find((t) => t.id === testInfo.project.name);
    expect(target, `unknown store target ${testInfo.project.name}`).toBeDefined();
    for (const scene of SCENES) {
      if (ONLY.length > 0 && !ONLY.includes(scene.id)) continue;
      const rawFile = join(RAW, lang, target!.id, sceneFileName(scene));
      let raw: Buffer;
      if (COMPOSE_ONLY) {
        raw = readFileSync(rawFile);
      } else {
        const { context, page } = await openGame(browser, target!, lang);
        await SCENE_FNS[scene.id](page);
        raw = await page.screenshot();
        mkdirSync(dirname(rawFile), { recursive: true });
        writeFileSync(rawFile, raw);
        await context.close();
      }
      await compose(browser, target!, scene, lang, raw);
    }
  });
}
