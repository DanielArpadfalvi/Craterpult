import { expect, test, type Page } from '@playwright/test';
import { boot, call, summary } from './helpers';

test.use({ deviceScaleFactor: 1, viewport: { width: 360, height: 640 } });

type IntroApi = {
  actions: { startMission(id: string): void };
  introActive(): boolean;
};
const introActive = (page: Page) => call(page, (a) => (a as unknown as IntroApi).introActive());

test('first turn: camera tour over the enemies (skippable, sim paused) and edge arrows', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await boot(page, '&intro');
  await call(page, (a) => (a as unknown as IntroApi).actions.startMission('c1-01'));
  await expect(page.getByTestId('hud')).toBeVisible();
  expect(await introActive(page)).toBe(true);

  // The simulation does not advance under the tour: the turn clock and replays are untouched.
  const t0 = (await summary(page))!.tick;
  expect(t0).toBe(0);
  await page.waitForTimeout(300);
  // Read both in one call: on a loaded machine the tour may already be over by the next one.
  const mid = await call(page, (a) => ({
    active: (a as unknown as IntroApi).introActive(),
    tick: a.summary()!.tick,
  }));
  if (mid.active) expect(mid.tick).toBe(t0);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/intro-pan-360.png' });

  // It ends on its own and play starts.
  await expect.poll(() => introActive(page), { timeout: 8000 }).toBe(false);
  await expect.poll(async () => (await summary(page))!.tick, { timeout: 5000 }).toBeGreaterThan(t0);

  // Back on the active unit: the far enemies are marked at the screen edge.
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/intro-indicators-360.png' });

  // A touch on the map skips the tour of a fresh match right away.
  await call(page, (a) => (a as unknown as IntroApi).actions.startMission('c1-01'));
  expect(await introActive(page)).toBe(true);
  await page.mouse.click(180, 300);
  expect(await introActive(page)).toBe(false);
  expect((await summary(page))!.overlay).toBeNull();
  expect(errors).toEqual([]);
});

test('without ?intro, e2e matches start with no tour', async ({ page }) => {
  await boot(page);
  await call(page, (a) => (a as unknown as IntroApi).actions.startMission('c1-01'));
  expect(await introActive(page)).toBe(false);
});
