import { expect, test, type Page } from '@playwright/test';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

interface Summary {
  tick: number;
  phase: string;
  activeTeam: number;
  activeUnit: number;
  winner: number | null;
  overlay: string | null;
  hp: number[];
  alive: boolean[];
  units: { x: number; y: number; team: number }[];
}

type Api = {
  ready: boolean;
  actions: { startHotseat(seed?: string): void };
  summary(): Summary | null;
  stepTicks(n: number): void;
  unitScreen(): { x: number; y: number } | null;
  stopRendering(): void;
  renderFrames(n: number): void;
  command(c: unknown): void;
};

const api = (page: Page) =>
  page.evaluate(() => (window as unknown as { __craterpult: Api }).__craterpult.summary());
const step = (page: Page, n: number) =>
  page.evaluate((k) => (window as unknown as { __craterpult: Api }).__craterpult.stepTicks(k), n);
const frames = (page: Page, n = 2) =>
  page.evaluate(
    (k) => (window as unknown as { __craterpult: Api }).__craterpult.renderFrames(k),
    n,
  );

async function shot(page: Page, name: string): Promise<void> {
  await frames(page, 3);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('hotseat: menu → pass → aim by dragging → shot resolves → next team', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await page.goto('/?test');
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: Api }).__craterpult?.ready === true,
  );
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/menu.png` });

  await page.evaluate(() =>
    (window as unknown as { __craterpult: Api }).__craterpult.stopRendering(),
  );
  await page.getByTestId('start-hotseat').click();
  await expect(page.getByTestId('pass')).toBeVisible();
  await shot(page, 'pass');
  await page.getByTestId('pass-go').click();
  await expect(page.getByTestId('pass')).toBeHidden();
  await expect(page.getByTestId('aim-hint')).toBeVisible();

  let s = (await api(page))!;
  expect(s.phase).toBe('aiming');
  expect(s.activeTeam).toBe(0);

  // Walk a little to the right.
  await page.getByTestId('move-right').dispatchEvent('pointerdown');
  await step(page, 30);
  await page.getByTestId('move-right').dispatchEvent('pointerup');
  await step(page, 2);
  const moved = (await api(page))!;
  expect(moved.units[moved.activeUnit]!.x).toBeGreaterThan(s.units[s.activeUnit]!.x);
  await frames(page, 30);

  // Aim: drag back (down-left) from the active unit and release.
  const u = await page.evaluate(() =>
    (window as unknown as { __craterpult: Api }).__craterpult.unitScreen(),
  );
  expect(u).not.toBeNull();
  await page.mouse.move(u!.x, u!.y);
  await page.mouse.down();
  await page.mouse.move(u!.x - 70, u!.y + 60, { steps: 5 });
  await shot(page, 'aiming');
  await page.mouse.up();
  await step(page, 1);
  s = (await api(page))!;
  expect(['firing', 'retreat', 'settling']).toContain(s.phase);
  await expect(page.getByTestId('aim-hint')).toBeHidden();
  await step(page, 25);
  await shot(page, 'projectile');

  // Let the shot, retreat and settle play out.
  for (let i = 0; i < 40 && (await api(page))!.overlay !== 'pass'; i++) await step(page, 30);
  s = (await api(page))!;
  expect(s.overlay).toBe('pass');
  expect(s.activeTeam).toBe(1);
  await expect(page.getByTestId('pass')).toContainText('Pink Pack');
  await page.getByTestId('pass-go').click();
  await shot(page, 'team2-turn');

  // Weapon panel.
  await page.getByTestId('weapon').click();
  await expect(page.getByTestId('weapon-panel')).toBeVisible();
  await shot(page, 'weapons');
  await page.getByTestId('weapon-grenade').click();
  await expect(page.getByTestId('fuse')).toBeVisible();

  // Place weapon: dynamite via the Use button.
  await page.getByTestId('weapon').click();
  await page.getByTestId('weapon-dynamite').click();
  await expect(page.getByTestId('use')).toBeEnabled();
  await page.getByTestId('use').click();
  await step(page, 2);
  expect((await api(page))!.phase).toBe('firing');
  await step(page, 60);
  await shot(page, 'dynamite');
  for (let i = 0; i < 40 && (await api(page))!.overlay !== 'pass'; i++) await step(page, 30);
  await page.getByTestId('pass-go').click();

  // Target weapon: teleport by tapping the map.
  await page.getByTestId('weapon').click();
  await page.getByTestId('weapon-teleport').click();
  await expect(page.getByTestId('target-hint')).toBeVisible();
  const before = (await api(page))!;
  const unit = before.units[before.activeUnit]!;
  await page.mouse.click(195, 250);
  await step(page, 1);
  const after = (await api(page))!;
  expect(after.units[after.activeUnit]!.x).not.toBe(unit.x);
  expect(errors).toEqual([]);
});

test('hotseat: a match plays to a winner', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await page.goto('/?test');
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: Api }).__craterpult?.ready === true,
  );
  await page.evaluate(() => {
    const a = (window as unknown as { __craterpult: Api }).__craterpult;
    a.stopRendering();
    a.actions.startHotseat('e2e-win');
  });
  // Every unit of team 1 except one is removed by the test; then team 0 skips until it ends.
  await page.evaluate(() => {
    const w = window as unknown as {
      __craterpult: Api & { getMatch(): { units: { team: number; hp: number }[] } };
    };
    for (const u of w.__craterpult.getMatch().units) if (u.team === 1) u.hp = 0;
  });
  await page.getByTestId('pass-go').click();
  await page.getByTestId('skip').click();
  for (let i = 0; i < 20 && (await api(page))!.winner === null; i++) await step(page, 30);
  const s = (await api(page))!;
  expect(s.winner).toBe(0);
  await expect(page.getByTestId('game-over')).toContainText('Cyan Crew');
  await shot(page, 'game-over');
  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('pass')).toBeVisible();
  expect(errors).toEqual([]);
});
