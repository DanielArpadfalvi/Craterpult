import { expect, test, type Page } from '@playwright/test';
import { boot, call, layoutProblems, summary, winNow, type Summary } from './helpers';

const SHOTS = 'tests/e2e/__screenshots__';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

async function stepUntil(
  page: Page,
  pred: (s: Summary) => boolean,
  maxTicks = 4000,
): Promise<Summary> {
  let s = (await summary(page)) as Summary;
  for (let t = 0; t < maxTicks && !pred(s); t += 30) {
    await call(page, (a) => a.stepTicks(30));
    s = (await summary(page)) as Summary;
  }
  return s;
}

/** A v2 save with some progress, written before the first load of the session. */
async function seedSave(page: Page): Promise<void> {
  const stars: Record<string, number> = {};
  for (let c = 1; c <= 2; c++)
    for (let i = 1; i <= 7; i++) stars[`c${c}-${String(i).padStart(2, '0')}`] = 3;
  const save = {
    version: 2,
    campaign: { stars },
    daily: { days: {}, best: 1340, streak: { current: 0, best: 5, last: '2026-09-01' } },
    stats: {
      modes: {
        quick: { played: 14, won: 9 },
        campaign: { played: 22, won: 16 },
        daily: { played: 6, won: 4 },
        hotseat: { played: 3, won: 2 },
      },
      kills: 87,
      unitsLost: 41,
      shots: 212,
      hits: 131,
      bestShot: 146,
      weapons: { bazooka: 90, grenade: 61, cluster: 30 },
      winStreak: 2,
      bestWinStreak: 6,
    },
  };
  await page.addInitScript((text) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('craterpult:save', text);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(save));
}

test('settings: language, sound and haptics persist across a reload', async ({ page }) => {
  const errors = await boot(page);
  // The old language key was moved into the save.
  expect(await page.evaluate(() => localStorage.getItem('craterpult:lang'))).toBeNull();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toggle-haptics')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('lang-hu').click();
  await expect(page.locator('.page h1')).toHaveText('Beállítások');
  await page.getByTestId('toggle-sound').click();
  await page.getByTestId('toggle-haptics').click();
  await page.getByTestId('turn-time-30').click();
  await page.getByTestId('aim-preview-long').click();
  await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false');
  // Sound and haptics are separate switches.
  const saved = await call(page, (a) => a.getSave().settings);
  expect(saved).toMatchObject({
    language: 'hu',
    sound: false,
    haptics: false,
    turnTime: 30,
    aimPreview: 'long',
  });

  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: { ready: boolean } }).__craterpult?.ready,
  );
  await expect(page.getByTestId('open-settings')).toHaveText('Beállítások');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('lang-hu')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('toggle-haptics')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('turn-time-30')).toHaveAttribute('aria-checked', 'true');

  // The turn time applies to the next match.
  await page.getByTestId('settings-back').click();
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await call(page, (a) => a.renderFrames(1));
  await expect(page.getByTestId('turn-time')).toHaveText('30 mp');
  // Leave the bot match for the menu: a test that ends mid-match leaves the page drawing (and the
  // bot thinking), which made the context teardown hang on a loaded machine.
  await page.getByTestId('pause').click();
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('reset progress asks twice in the page and keeps settings', async ({ page }) => {
  await seedSave(page);
  const errors = await boot(page);
  let dialogs = 0;
  page.on('dialog', () => dialogs++);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('toggle-large-text').click();
  await page.getByTestId('reset-progress').click();
  await expect(page.getByTestId('reset-confirm')).toBeVisible();
  await page.getByTestId('reset-cancel').click();
  expect(Object.keys((await call(page, (a) => a.getSave())).campaign.stars).length).toBe(14);
  await page.getByTestId('reset-progress').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('reset-done')).toBeVisible();
  const save = await call(page, (a) => a.getSave());
  expect(save.campaign.stars).toEqual({});
  expect(save.stats.kills).toBe(0);
  expect(save.settings.largeText).toBe(true);
  expect(dialogs).toBe(0);
  expect(errors).toEqual([]);
});

test('stats after a quick match against the bot', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page);
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // One shot of ours, then the bot plays, then we wipe the enemy out.
  await call(page, (a) => a.command({ t: 'fire', weapon: 'bazooka', angle: 600, power: 45 }));
  let s = await stepUntil(page, (x) => x.activeTeam === 1 && x.phase === 'aiming');
  expect(s.shots[0]).toBe(1);
  if (s.phase !== 'over') {
    expect(await call(page, (a) => a.playBotTurn())).toBe(true);
    s = await stepUntil(
      page,
      (x) => (x.activeTeam === 0 && x.phase === 'aiming') || x.phase === 'over',
    );
  }
  if (s.phase !== 'over') s = await winNow(page);
  expect(s.winner).toBe(0);
  await call(page, (a) => a.renderFrames(1));
  await expect(page.getByTestId('game-over')).toBeVisible();
  await page.getByTestId('to-menu').click();

  const stats = (await call(page, (a) => a.getSave())).stats;
  expect(stats.modes.quick).toEqual({ played: 1, won: 1 });
  expect(stats.shots).toBe(1);
  expect(stats.kills).toBeGreaterThan(0);
  await page.getByTestId('open-stats').click();
  await expect(page.getByTestId('mode-quick-played')).toHaveText('1');
  await expect(page.getByTestId('mode-quick-won')).toHaveText('1');
  await expect(page.getByTestId('mode-campaign-played')).toHaveText('0');
  await expect(page.getByTestId('stat-played')).toHaveText('1');
  await expect(page.getByTestId('stat-shots')).toHaveText('1');
  await expect(page.getByTestId('stat-kills')).toHaveText(String(stats.kills));
  await expect(page.getByTestId('stat-favourite')).toHaveText('Bazooka');
  await expect(page.getByTestId('stat-streak')).toHaveText('best 1 · now 1');
  expect(await layoutProblems(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('team customization: name, color and hat show in the match', async ({ page }) => {
  test.setTimeout(120_000);
  await seedSave(page);
  // Cosmetic hats are Full Version content (their locks: paywall.spec.ts).
  const errors = await boot(page, '&full');
  await page.getByTestId('open-team').click();
  await expect(page.getByTestId('team')).toBeVisible();
  // 42 stars: two extra hats are open, the third is still locked.
  await expect(page.getByTestId('hat-crown')).toBeEnabled();
  await expect(page.getByTestId('hat-horns')).toBeEnabled();
  await expect(page.getByTestId('hat-halo')).toBeDisabled();
  await page.getByTestId('team-name').fill('  Crater <Kings>  of Doom!!');
  await page.getByTestId('color-2').click();
  await page.getByTestId('hat-crown').click();
  await expect(page.getByTestId('hat-crown')).toHaveAttribute('aria-checked', 'true');
  const profile = (await call(page, (a) => a.getSave())).profile;
  expect(profile).toEqual({ name: 'Crater Kings of', color: 2, hat: 'crown' });
  await expect(page.getByTestId('team-preview-name')).toHaveText('Crater Kings of');
  await page.getByTestId('team-name').fill('Rocket Rats');
  await page.getByTestId('team-back').click();

  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await call(page, (a) => a.renderFrames(2));
  await expect(page.locator('.turn-name')).toHaveText('Turn: Rocket Rats');
  const first = page.locator('.team').first();
  await expect(first.locator('.team-name')).toHaveText('Rocket Rats');
  // Lime for us; the bot takes the first free color (cyan).
  await expect(first).toHaveAttribute('style', /#9dff4f/);
  await expect(page.locator('.team').nth(1)).toHaveAttribute('style', /#3ef0ff/);
  await page.screenshot({ path: `${SHOTS}/team-hud.png` });
  expect(errors).toEqual([]);
});

test('back button / Escape: closes, pauses, goes back, never leaves the menu', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await boot(page);
  const back = () => page.keyboard.press('Escape');

  // Menu: the app is minimized natively (a no-op on the web), the menu stays.
  await back();
  await expect(page.getByTestId('menu')).toBeVisible();

  // Sub-screens go back to the menu.
  for (const id of ['settings', 'stats', 'team', 'quick']) {
    await page.getByTestId(`open-${id}`).click();
    await expect(page.getByTestId(id)).toBeVisible();
    await back();
    await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByTestId('menu')).toBeVisible();
  }
  await page.getByTestId('open-campaign').click();
  await page.getByTestId('mission-c1-01').click();
  await expect(page.getByTestId('mission-intro')).toBeVisible();
  await back();
  await expect(page.getByTestId('mission-intro')).toHaveCount(0);
  await expect(page.getByTestId('campaign')).toBeVisible();
  await back();
  await expect(page.getByTestId('menu')).toBeVisible();

  // In a match: weapon panel → closed; then pause; settings over the pause; resume.
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.getByTestId('weapon').click();
  await expect(page.getByTestId('weapon-panel')).toBeVisible();
  await back();
  await expect(page.getByTestId('weapon-panel')).toHaveCount(0);
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
  await back();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('pause-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await back();
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  // The hardware back button goes through the same path.
  await call(page, (a) => a.back());
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toBeVisible();

  // Restart from the pause menu: the same map from the first tick.
  await call(page, (a) => a.stepTicks(90));
  expect((await summary(page))?.tick).toBeGreaterThan(80);
  await back();
  await page.getByTestId('restart').click();
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
  expect((await summary(page))?.tick).toBeLessThan(5);

  // A finished match: back leaves for the menu.
  await winNow(page);
  await call(page, (a) => a.renderFrames(1));
  await expect(page.getByTestId('game-over')).toBeVisible();
  await back();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('back on the hotseat hand-over screen pauses; resume returns to it', async ({ page }) => {
  const errors = await boot(page);
  const back = () => page.keyboard.press('Escape');
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-hotseat').click();
  await expect(page.getByTestId('pass')).toBeVisible();
  await back();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await expect(page.getByTestId('pass')).toHaveCount(0);
  // Resume (back again) goes back to the hand-over screen, not into the turn.
  await back();
  await expect(page.getByTestId('pass')).toBeVisible();
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
  await page.getByTestId('pass-go').click();
  await expect(page.getByTestId('pass')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toBeVisible();
  // The wind gauge shows its strength and direction.
  await call(page, (a) => a.renderFrames(1));
  await expect(page.getByTestId('wind-value')).toHaveText(/^(0|←\d+|\d+→)$/);
  // Quit from the pause menu opened over the hand-over screen.
  await back();
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('settings About: privacy, support, restore purchases and version', async ({ page }) => {
  // Record links instead of opening real tabs (the platform layer calls window.open).
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = (url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    };
  });
  const errors = await boot(page);
  const opened = () => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  await page.getByTestId('open-settings').click();
  const about = page.getByTestId('about');
  await about.scrollIntoViewIfNeeded();
  await expect(about).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveText('Craterpult version 1.0.0');

  await page.getByTestId('about-privacy').click();
  await page.getByTestId('about-support').click();
  expect(await opened()).toEqual([
    'https://danielarpadfalvi.github.io/craterpult-site/privacy.html',
    'https://danielarpadfalvi.github.io/craterpult-site/support.html',
  ]);

  // Restore: nothing to restore yet, then a purchase made on another device.
  await page.getByTestId('settings-restore').click();
  await expect(page.getByTestId('restore-status')).toContainText('No previous purchase');
  await page.evaluate(
    `(async (p) => { await p.ownedElsewhere(); })(window.__craterpult.purchases)`,
  );
  await page.getByTestId('settings-restore').click();
  await expect(page.getByTestId('restore-status')).toHaveText('Full Version restored.');
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await page.getByTestId('settings-back').click();
  await expect(page.getByTestId('open-full-version')).toHaveCount(0);
  expect(await layoutProblems(page)).toEqual([]);

  // Hungarian strings.
  await page.getByTestId('open-settings').click();
  await page.getByTestId('lang-hu').click();
  await expect(page.getByTestId('about-privacy')).toContainText('Adatvédelmi tájékoztató');
  await expect(page.getByTestId('app-version')).toHaveText('Craterpult 1.0.0 verzió');
  expect(errors).toEqual([]);
});

test.describe('menu at 360x640', () => {
  test.use({ viewport: { width: 360, height: 640 } });
  for (const lang of ['en', 'hu', 'de', 'es'] as const) {
    test(`buttons keep their captions inside, nothing overlaps (${lang})`, async ({ page }) => {
      const errors = await boot(page, '&today=2026-10-06', lang);
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const kids = Array.from(document.querySelectorAll<HTMLElement>('.menu > *'));
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1]!.getBoundingClientRect();
          const b = kids[i]!.getBoundingClientRect();
          if (a.bottom > b.top + 0.5)
            out.push(`${kids[i - 1]!.className} overlaps ${kids[i]!.className}`);
        }
        for (const small of Array.from(
          document.querySelectorAll<HTMLElement>('.menu .btn small'),
        )) {
          const r = small.getBoundingClientRect();
          const btn = small.closest('.btn')!.getBoundingClientRect();
          if (r.bottom > btn.bottom - 1 || r.top < btn.top)
            out.push(`caption "${small.textContent}" leaves its button`);
        }
        return out;
      });
      expect(problems).toEqual([]);
      // The menu scrolls instead of squeezing.
      const scroll = await page.evaluate(() => {
        const m = document.querySelector('.menu')!;
        return m.scrollHeight > m.clientHeight;
      });
      expect(scroll).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});

for (const vp of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test.describe(`screens at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    for (const lang of ['en', 'hu', 'de', 'es'] as const) {
      test(`new screens in ${lang.toUpperCase()}`, async ({ page }) => {
        test.setTimeout(90_000);
        await seedSave(page);
        const errors = await boot(page, '&today=2026-10-06', lang);
        const tag = `${lang}-${vp.width}x${vp.height}`;
        const shot = async (name: string) => {
          expect(await layoutProblems(page), `${name} ${tag}`).toEqual([]);
          await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` });
        };
        const scrollEnd = () =>
          page.evaluate(() => {
            const el = document.querySelector('.page, .menu');
            if (el) el.scrollTop = el.scrollHeight;
          });

        await shot('menu');
        await scrollEnd();
        await shot('menu-end');
        for (const id of ['quick', 'settings', 'stats', 'team']) {
          await page.getByTestId(`open-${id}`).click();
          await expect(page.getByTestId(id)).toBeVisible();
          await shot(id);
          await scrollEnd();
          await shot(`${id}-end`);
          await page.getByTestId(`${id}-back`).click();
        }
        // The reset confirmation step.
        await page.getByTestId('open-settings').click();
        await page.getByTestId('reset-progress').click();
        await scrollEnd();
        await shot('settings-reset');
        await page.getByTestId('reset-cancel').click();
        await page.getByTestId('settings-back').click();

        await call(page, (a) => a.stopRendering());
        await page.getByTestId('start-bot').click();
        await expect(page.getByTestId('hud')).toBeVisible();
        await call(page, (a) => a.renderFrames(2));
        await page.getByTestId('pause').click();
        await shot('pause');

        // Larger text: menus and the HUD still fit.
        await page.getByTestId('pause-settings').click();
        await page.getByTestId('toggle-large-text').click();
        await shot('settings-large');
        await page.getByTestId('settings-back').click();
        await page.getByTestId('resume').click();
        await call(page, (a) => a.renderFrames(1));
        await shot('hud-large');
        await page.getByTestId('pause').click();
        await page.getByTestId('quit').click();
        await shot('menu-large');
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe('large phone 430x932', () => {
  test.use({ viewport: { width: 430, height: 932 } });
  test('menu and sub-screens lay out cleanly', async ({ page }) => {
    await seedSave(page);
    const errors = await boot(page);
    expect(await layoutProblems(page)).toEqual([]);
    for (const id of ['quick', 'settings', 'stats', 'team']) {
      await page.getByTestId(`open-${id}`).click();
      await expect(page.getByTestId(id)).toBeVisible();
      expect(await layoutProblems(page), id).toEqual([]);
      await page.getByTestId(`${id}-back`).click();
    }
    expect(errors).toEqual([]);
  });
});
