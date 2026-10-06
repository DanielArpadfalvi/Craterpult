import { expect, test } from '@playwright/test';
import { boot, call, layoutProblems, summary, winNow } from './helpers';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

test('campaign: mission 1 → win → stars → mission 2 unlocked', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await boot(page);
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/menu-en.png`, fullPage: true });

  await page.getByTestId('open-campaign').click();
  await expect(page.getByTestId('campaign')).toBeVisible();
  await expect(page.getByTestId('mission-c1-01')).toBeEnabled();
  await expect(page.getByTestId('mission-c1-02')).toBeDisabled();
  // Free version: chapter 2 is a Full Version chapter (the sheet opens; see paywall.spec.ts).
  await page.getByTestId('chapter-tab-2').click();
  await page.getByTestId('paywall-close').click();
  await expect(page.getByTestId('chapter-fv-locked')).toBeVisible();
  await page.getByTestId('chapter-tab-1').click();
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/campaign-grid-en.png` });

  await page.getByTestId('mission-c1-01').click();
  await expect(page.getByTestId('mission-intro')).toBeVisible();
  await expect(page.getByTestId('intro-name')).toHaveText('First Splash');
  await expect(page.getByTestId('star-rules').locator('li')).toHaveCount(3);
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/mission-intro-en.png` });

  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-mission').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('pass')).toHaveCount(0);
  const s0 = await summary(page);
  expect(s0?.activeTeam).toBe(0);
  expect(s0?.units.filter((u) => u.team === 0)).toHaveLength(3);
  expect(s0?.units.filter((u) => u.team === 1)).toHaveLength(2);

  const end = await winNow(page);
  expect(end.winner).toBe(0);
  await call(page, (a) => a.renderFrames(2));
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('result-title')).toHaveText('Mission complete!');
  // One turn, nobody lost: all three stars.
  await expect(page.getByTestId('result-stars')).toHaveAttribute('data-stars', '3');
  await expect(page.getByTestId('result-next')).toBeVisible();
  await expect(page.getByTestId('rule-checks').locator('li.is-met')).toHaveCount(3);
  await page.waitForTimeout(1600); // let the star animation finish
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/result-en.png` });

  expect((await call(page, (a) => a.getSave())).campaign.stars['c1-01']).toBe(3);
  await page.getByTestId('result-missions').click();
  await expect(page.getByTestId('campaign')).toBeVisible();
  await expect(page.getByTestId('mission-c1-01')).toHaveAttribute('data-stars', '3');
  await expect(page.getByTestId('mission-c1-02')).toBeEnabled();

  // Progress survives a reload.
  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: { ready: boolean } }).__craterpult?.ready,
  );
  await page.getByTestId('open-campaign').click();
  await expect(page.getByTestId('mission-c1-02')).toBeEnabled();
  await page.getByTestId('mission-c1-02').click();
  await expect(page.getByTestId('intro-name')).toHaveText('Flat Out');
  expect(errors).toEqual([]);
});

test('campaign in Hungarian: grid, intro and a lost mission', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const stars: Record<string, number> = {};
    for (let i = 1; i <= 8; i++) stars[`c1-0${i}`.replace('c1-010', 'c1-10')] = (i % 3) + 1;
    localStorage.setItem(
      'craterpult:save',
      JSON.stringify({ version: 1, campaign: { stars }, daily: {} }),
    );
  });
  const errors = await boot(page, '&full', 'hu');
  await expect(page.getByTestId('open-campaign')).toContainText('Hadjárat');
  await page.screenshot({ path: `${SHOTS}/menu-hu.png`, fullPage: true });
  expect(await layoutProblems(page)).toEqual([]);
  await page.getByTestId('open-campaign').click();
  // 8 cleared in chapter 1: chapter 2 is open, and the campaign opens on it.
  await expect(page.getByTestId('chapter-tab-2')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('mission-c2-01')).toBeEnabled();
  await page.getByTestId('chapter-tab-1').click();
  await expect(page.getByTestId('mission-c1-09')).toBeEnabled();
  await expect(page.getByTestId('mission-c1-10')).toBeDisabled();
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/campaign-grid-hu.png` });
  await page.getByTestId('chapter-tab-3').click();
  await page.screenshot({ path: `${SHOTS}/campaign-locked-hu.png` });
  await page.getByTestId('chapter-tab-2').click();
  await page.getByTestId('mission-c2-01').click();
  await expect(page.getByTestId('intro-name')).toHaveText('Iker csövek');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/mission-intro-hu.png` });

  // Lose on purpose: the player's units are knocked out.
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-mission').click();
  await page.evaluate(() => {
    const api = (
      window as unknown as {
        __craterpult: {
          getMatch(): { units: { team: number; hp: number }[] };
          command(c: unknown): void;
        };
      }
    ).__craterpult;
    for (const u of api.getMatch().units) if (u.team === 0) u.hp = 0;
    api.command({ t: 'skip' });
  });
  let s = await summary(page);
  for (let t = 0; t < 3000 && s?.phase !== 'over'; t += 30) {
    await call(page, (a) => a.stepTicks(30));
    s = await summary(page);
  }
  await call(page, (a) => a.renderFrames(2));
  await expect(page.getByTestId('result-title')).toHaveText('Küldetés elbukott');
  await expect(page.getByTestId('result-stars')).toHaveAttribute('data-stars', '0');
  await expect(page.getByTestId('result-next')).toHaveCount(0);
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/result-lose-hu.png` });
  await page.getByTestId('result-retry').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  expect(errors).toEqual([]);
});
