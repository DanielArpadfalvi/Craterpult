import { expect, test } from '@playwright/test';
import { boot, call, layoutProblems, summary, winNow } from './helpers';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

test('daily challenge: official attempt, score and streak, then practice', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await boot(page, '&today=2026-10-06&full');
  const card = page.getByTestId('daily-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('2026-10-06');
  await expect(page.getByTestId('daily-streak')).toHaveText('Streak 0');
  await card.screenshot({ path: `${SHOTS}/daily-card-en.png` });

  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-daily').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  expect((await summary(page))?.activeTeam).toBe(0);
  const end = await winNow(page);
  expect(end.winner).toBe(0);
  await call(page, (a) => a.renderFrames(2));
  await expect(page.getByTestId('result')).toBeVisible();
  const score = Number(await page.getByTestId('daily-score').textContent());
  expect(score).toBeGreaterThan(1000);
  await expect(page.getByTestId('daily-attempt')).toHaveText('Official attempt');
  await expect(page.getByTestId('result-streak')).toHaveText('1-day streak');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/daily-result-en.png` });

  await page.getByTestId('to-menu').click();
  await expect(page.getByTestId('start-daily')).toHaveText('Practice again');
  await expect(page.getByTestId('daily-today')).toHaveText(`Today: ${score}`);
  await expect(page.getByTestId('daily-streak')).toHaveText('Streak 1');

  await page.getByTestId('start-daily').click();
  await winNow(page);
  await call(page, (a) => a.renderFrames(2));
  await expect(page.getByTestId('daily-attempt')).toContainText('Practice');
  await page.getByTestId('to-menu').click();
  await expect(page.getByTestId('daily-today')).toHaveText(`Today: ${score}`);
  expect(errors).toEqual([]);
});

test('daily card and result in Hungarian', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await boot(page, '&today=2026-10-07&full', 'hu');
  await expect(page.getByTestId('start-daily')).toHaveText('Mai kihívás indítása');
  await page.getByTestId('daily-card').screenshot({ path: `${SHOTS}/daily-card-hu.png` });
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-daily').click();
  await winNow(page);
  await call(page, (a) => a.renderFrames(2));
  await expect(page.getByTestId('daily-attempt')).toHaveText('Hivatalos próbálkozás');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/daily-result-hu.png` });
  expect(errors).toEqual([]);
});

test('quick match options: team size and map style', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await boot(page, '&full');
  await page.getByTestId('team-size-4').click();
  await page.getByTestId('map-style-cavern').click();
  await expect(page.getByTestId('map-style-cavern')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('start-bot').scrollIntoViewIfNeeded();
  await page.locator('.quick-card').screenshot({ path: `${SHOTS}/quick-options-en.png` });
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  const s = await summary(page);
  expect(s?.units.filter((u) => u.team === 0)).toHaveLength(4);
  expect(s?.units.filter((u) => u.team === 1)).toHaveLength(4);
  await call(page, (a) => a.stopRendering());
  await call(page, (a) => a.renderFrames(3));
  await page.screenshot({ path: `${SHOTS}/quick-cavern.png` });
  expect(errors).toEqual([]);
});
