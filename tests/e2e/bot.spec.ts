import { expect, test, type Page } from '@playwright/test';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

type Summary = { activeTeam: number; phase: string; shots: number[]; overlay: string | null };
type Api = {
  ready: boolean;
  summary(): Summary;
  stepTicks(n: number): void;
  stopRendering(): void;
  renderFrames(n: number): void;
  playBotTurn(): boolean;
};
const call = <T>(page: Page, fn: (api: Api) => T) =>
  page.evaluate(`(${fn.toString()})(window.__craterpult)`) as Promise<T>;
const summary = (page: Page) => call(page, (a) => a.summary());

async function stepUntil(
  page: Page,
  pred: (s: Summary) => boolean,
  maxTicks = 4000,
): Promise<Summary> {
  let s = await summary(page);
  for (let t = 0; t < maxTicks && !pred(s); t += 30) {
    await call(page, (a) => a.stepTicks(30));
    s = await summary(page);
  }
  return s;
}

test('vs bots: no pass screen, the bot takes its turn and fires', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test&full');
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: Api }).__craterpult?.ready,
  );
  await page.getByTestId('difficulty-3').click();
  await expect(page.getByTestId('difficulty-3')).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'tests/e2e/__screenshots__/menu-bot.png' });
  await call(page, (a) => a.stopRendering());
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('pass')).toHaveCount(0);
  expect((await summary(page)).activeTeam).toBe(0);

  // The human ends the turn; the bot plays.
  await page.getByTestId('skip').click();
  let s = await stepUntil(page, (x) => x.activeTeam === 1 && x.phase === 'aiming');
  expect(s.activeTeam).toBe(1);
  await expect(page.getByTestId('move-left')).toBeDisabled();
  expect(await call(page, (a) => a.playBotTurn())).toBe(true);
  await call(page, (a) => a.stepTicks(20));
  await call(page, (a) => a.renderFrames(3));
  await page.screenshot({ path: 'tests/e2e/__screenshots__/bot-shot.png' });
  s = await stepUntil(page, (x) => x.activeTeam === 0 && x.phase === 'aiming');
  expect(s.shots[1]).toBeGreaterThan(0);
  expect(s.activeTeam).toBe(0);
  expect(errors).toEqual([]);
});
