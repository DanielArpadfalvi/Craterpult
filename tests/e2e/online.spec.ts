import { expect, test, type Page } from '@playwright/test';

/**
 * Online (M9) against the in-browser mock backend: two pages of one browser context share the
 * mock "server" (localStorage) but are two players (sessionStorage identity).
 */

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

interface Summary {
  tick: number;
  phase: string;
  activeTeam: number;
  overlay: string | null;
  hp: number[];
  units: { x: number; y: number; team: number }[];
}

type Api = {
  ready: boolean;
  summary(): Summary | null;
  stepTicks(n: number): void;
  stopRendering(): void;
  renderFrames(n: number): void;
  command(c: unknown): void;
};

const hook = <T>(page: Page, fn: (api: Api, arg: number) => T, arg = 0): Promise<T> =>
  page.evaluate(
    ([src, a]) => {
      const api = (window as unknown as { __craterpult: Api }).__craterpult;
      return (new Function('api', 'a', `return (${src})(api, a)`) as (x: Api, y: number) => T)(
        api,
        a,
      );
    },
    [fn.toString(), arg] as const,
  );

const summary = (page: Page) => hook(page, (api) => api.summary());

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test${query}`);
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: Api }).__craterpult?.ready === true,
  );
  await hook(page, (api) => api.stopRendering());
  return errors;
}

/** Step the loop until `pred(summary)` holds (the loop may pause itself while waiting). */
async function stepUntil(page: Page, pred: (s: Summary) => boolean, max = 6000): Promise<Summary> {
  for (let done = 0; done < max; done += 200) {
    const s = (await summary(page))!;
    if (pred(s)) return s;
    await hook(page, (api, n) => api.stepTicks(n), 200);
  }
  throw new Error('condition not reached');
}

test('online: invite → join → both turns are played and replayed identically', async ({
  context,
}) => {
  test.setTimeout(240_000);
  const host = await context.newPage();
  const guest = await context.newPage();
  const hostErrors = await boot(host, '&full');
  const guestErrors = await boot(guest, '');

  // The host creates an invite.
  await host.getByTestId('open-online').click();
  await expect(host.getByTestId('online')).toBeVisible();
  await host.getByTestId('online-size-2').click();
  await host.getByTestId('online-create').click();
  const code = (await host.getByTestId('invite-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await host.screenshot({ path: `${SHOTS}/online-invite.png` });

  // The guest joins with the code and moves first.
  await guest.getByTestId('open-online').click();
  await guest.getByTestId('join-code').fill(code.toLowerCase());
  await guest.getByTestId('join-submit').click();
  await expect(guest.getByTestId('hud')).toBeVisible();
  let g = (await summary(guest))!;
  expect(g.activeTeam).toBe(0);
  expect(g.units).toHaveLength(4);
  await hook(guest, (api) => api.command({ t: 'fire', weapon: 'bazooka', angle: 450, power: 60 }));
  g = await stepUntil(guest, (s) => s.overlay === 'waiting');
  await expect(guest.getByTestId('online-waiting')).toBeVisible();

  // The host sees "your turn", opens the match and watches the guest's shot (or skips it).
  await host.getByTestId('online-refresh').click();
  await expect(host.locator('[data-status="active"]')).toHaveCount(1);
  await host.locator('[data-status="active"] [data-testid="online-open"]').click();
  await expect(host.getByTestId('online-replay')).toBeVisible();
  await host.getByTestId('online-skip').click();
  let h = (await summary(host))!;
  expect(h.activeTeam).toBe(1);
  // After the replay both phones show exactly the same island.
  expect(h.tick).toBe(g.tick);
  expect(h.hp).toEqual(g.hp);
  expect(h.units).toEqual(g.units);

  await hook(host, (api) => api.command({ t: 'skip' }));
  h = await stepUntil(host, (s) => s.overlay === 'waiting');

  // The waiting guest polls, receives the reply and plays it back to its own turn.
  await guest.waitForTimeout(4500);
  // Tick by tick inside the page so it stops exactly where the host's phone is.
  g = (await hook(
    guest,
    (api, target) => {
      for (let i = 0; i < 6000; i++) {
        const s = api.summary();
        if (s && s.overlay === null && s.tick >= target) return s;
        api.stepTicks(1);
      }
      return api.summary();
    },
    h.tick,
  )) as Summary;
  expect(g.activeTeam).toBe(0);
  expect(g.tick).toBe(h.tick);
  expect(g.hp).toEqual(h.hp);
  expect(g.units).toEqual(h.units);

  // Resigning from the list ends the match for both.
  await guest.getByTestId('pause').click();
  await guest.getByTestId('quit').click();
  await expect(guest.getByTestId('online')).toBeVisible();
  await guest.getByTestId('online-resign').click();
  await guest.getByTestId('online-resign').click();
  await expect(guest.locator('[data-status="finished"]')).toHaveCount(1);
  await host.getByTestId('online-to-list').click();
  await expect(host.locator('[data-status="finished"]')).toHaveCount(1);

  // Rematch (free for both): the guest offers it, the host accepts it from the list and moves first.
  await guest.getByTestId('online-rematch').click();
  await expect(guest.getByTestId('invite-card')).toBeVisible();
  await expect(guest.getByTestId('online-rematch-sent')).toBeVisible();
  await host.getByTestId('online-refresh').click();
  const accept = host.locator('[data-testid="online-rematch"][data-offered="1"]');
  await expect(accept).toBeVisible();
  await host.screenshot({ path: `${SHOTS}/online-rematch.png` });
  await accept.click();
  await expect(host.getByTestId('hud')).toBeVisible();
  h = (await summary(host))!;
  expect(h.activeTeam).toBe(0);
  expect(h.units).toHaveLength(4);

  expect(hostErrors).toEqual([]);
  expect(guestErrors).toEqual([]);
});

test('online: creating needs the Full Version, joining does not', async ({ page }) => {
  await boot(page, '');
  await page.getByTestId('open-online').click();
  await page.getByTestId('online-create').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
});

test('online: a wrong code shows an error', async ({ page }) => {
  await boot(page, '');
  await page.getByTestId('open-online').click();
  await page.getByTestId('join-code').fill('ZZZZZZ');
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('online-error')).toBeVisible();
});

test('online: after 72 hours without a move the opponent claims the win', async ({ context }) => {
  test.setTimeout(120_000);
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors = [...(await boot(host, '&full')), ...(await boot(guest, ''))];
  await host.getByTestId('open-online').click();
  await host.getByTestId('online-create').click();
  const code = (await host.getByTestId('invite-code').textContent())!.trim();
  await guest.getByTestId('open-online').click();
  await guest.getByTestId('join-code').fill(code);
  await guest.getByTestId('join-submit').click();
  await expect(guest.getByTestId('hud')).toBeVisible();
  await guest.getByTestId('pause').click();
  await guest.getByTestId('quit').click();

  // The guest is to move; the host sees the clock running and no claim yet.
  await host.getByTestId('online-refresh').click();
  const row = host.locator('[data-status="active"]');
  await expect(row).toContainText('left');
  await expect(host.getByTestId('online-claim')).toHaveCount(0);
  await host.screenshot({ path: `${SHOTS}/online-deadline.png` });

  // Three days pass on the (mock) server.
  await host.evaluate(() => {
    const key = 'craterpult.mockOnline.v1';
    const db = JSON.parse(localStorage.getItem(key)!) as {
      matches: Record<string, { updatedAt: number }>;
    };
    for (const m of Object.values(db.matches)) m.updatedAt -= 73 * 3600 * 1000;
    localStorage.setItem(key, JSON.stringify(db));
  });
  await host.getByTestId('online-refresh').click();
  await host.screenshot({ path: `${SHOTS}/online-claim.png` });
  await host.getByTestId('online-claim').click();
  await expect(host.locator('[data-status="finished"]')).toContainText('ran out of time');

  // The guest opens the match and sees it ended.
  await guest.getByTestId('online-refresh').click();
  await expect(guest.locator('[data-status="finished"]')).toContainText('You ran out of time');
  await guest.locator('[data-status="finished"] [data-testid="online-open"]').click();
  await expect(guest.getByTestId('game-over')).toBeVisible();
  await expect(guest.getByTestId('online-end-reason')).toHaveText('You ran out of time');
  expect(errors).toEqual([]);
});
