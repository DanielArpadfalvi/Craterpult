import { expect, test, type Page } from '@playwright/test';
import { boot, layoutProblems } from './helpers';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

const SHOTS = 'tests/e2e/__screenshots__';

type Outcome = 'purchased' | 'cancelled' | 'pending' | 'failed';

/** Run `fn` (source text) against `window.__craterpult.purchases` (PurchasesTestApi). */
const hooks = (page: Page, fn: string) =>
  page.evaluate(
    `(async (p) => { await (${fn})(p); })(window.__craterpult.purchases)`,
  ) as Promise<void>;
const setOutcome = (page: Page, o: Outcome) => hooks(page, `(p) => p.setNextOutcome('${o}')`);

/** Chapter 1 progress: 8 missions cleared, so chapter 2 is open by progress. */
async function seedChapterOne(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const stars: Record<string, number> = {};
    for (let i = 1; i <= 8; i++) stars[`c1-0${i}`] = 2;
    localStorage.setItem(
      'craterpult:save',
      JSON.stringify({ version: 1, campaign: { stars }, daily: {} }),
    );
  });
}

/** Let the sheet's entrance animations finish before a screenshot. */
const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);

test('locked chapter / difficulty → buy → everything unlocks at once and stays', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedChapterOne(page);
  const errors = await boot(page, '&today=2026-10-06');

  // Free menu: Full Version button with the store price, lock badges on Full Version items.
  await expect(page.getByTestId('open-full-version')).toBeVisible();
  await expect(page.getByTestId('full-version-price')).toHaveText('$4.99');
  await expect(page.getByTestId('start-daily')).toHaveAttribute('data-locked', 'true');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/locks-menu-en.png`, fullPage: true });

  // Quick match options (M6 sub-screen): lock badges on Full Version chips.
  await page.getByTestId('open-quick').click();
  for (const id of ['difficulty-3', 'difficulty-4', 'difficulty-5', 'team-size-4']) {
    await expect(page.getByTestId(id)).toHaveClass(/is-fv-locked/);
  }
  for (const id of ['map-style-cavern', 'map-style-towers', 'map-style-flats']) {
    await expect(page.getByTestId(id)).toHaveClass(/is-fv-locked/);
  }
  for (const id of ['difficulty-2', 'team-size-3', 'map-style-islands', 'map-style-random']) {
    await expect(page.getByTestId(id)).not.toHaveClass(/is-fv-locked/);
  }
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/locks-quick-en.png` });
  await page.getByTestId('quick-back').click();

  // Team screen: cosmetic hats are locked (16 stars would earn the crown), team shapes are free.
  await page.getByTestId('open-team').click();
  await expect(page.getByTestId('hat-crown')).toHaveClass(/is-fv-locked/);
  await expect(page.getByTestId('hat-crown')).toBeEnabled();
  await expect(page.getByTestId('hat-diamond')).not.toHaveClass(/is-fv-locked/);
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/locks-team-en.png` });
  await page.getByTestId('team-back').click();

  // The campaign opens on chapter 1 (chapter 2 is open by progress but not owned).
  await page.getByTestId('open-campaign').click();
  await expect(page.getByTestId('chapter-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('chapter-tab-2')).toHaveClass(/is-fv-locked/);
  await page.getByTestId('chapter-tab-2').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('paywall-reason')).toContainText('Chapters 2 and 3');
  await expect(page.getByTestId('paywall-buy')).toHaveText('Unlock for $4.99');
  await expect(page.getByTestId('paywall-restore')).toBeVisible();
  await expect(page.getByTestId('paywall-terms')).toHaveAttribute('href', /apple\.com\/legal/);
  await expect(page.getByTestId('paywall-privacy')).toHaveAttribute(
    'href',
    'https://danielarpadfalvi.github.io/craterpult-site/privacy.html',
  );
  await settle(page);
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/paywall-en.png` });

  await page.getByTestId('paywall-close').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('chapter-fv-locked')).toBeVisible();
  await expect(page.getByTestId('mission-c2-01')).toHaveAttribute('data-locked', 'full');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/locks-campaign-en.png` });

  // A locked mission opens the sheet; buy (with store latency to see the busy state).
  await page.getByTestId('mission-c2-01').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await hooks(page, '(p) => p.setLatency(1500)');
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'buying');
  await expect(page.getByTestId('paywall-buy')).toBeDisabled();
  await expect(page.getByTestId('paywall-success')).toBeVisible();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'success');
  await settle(page, 900);
  await page.screenshot({ path: `${SHOTS}/paywall-success-en.png` });
  await page.getByTestId('paywall-done').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);

  // Reactive unlock, no reload: the tapped mission's intro is up, chapter 2 is playable.
  await expect(page.getByTestId('mission-intro')).toBeVisible();
  await expect(page.getByTestId('intro-name')).toHaveText('Twin Barrels');
  await page.getByTestId('intro-back').click();
  await expect(page.getByTestId('chapter-fv-locked')).toHaveCount(0);
  await expect(page.getByTestId('mission-c2-01')).toHaveAttribute('data-locked', 'false');
  await expect(page.getByTestId('chapter-tab-2')).not.toHaveClass(/is-fv-locked/);

  await page.getByTestId('campaign-back').click();
  await expect(page.getByTestId('open-full-version')).toHaveCount(0);
  await expect(page.getByTestId('start-daily')).toHaveAttribute('data-locked', 'false');
  await page.getByTestId('open-quick').click();
  await page.getByTestId('difficulty-4').click();
  await expect(page.getByTestId('difficulty-4')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await page.getByTestId('quick-back').click();
  await page.getByTestId('open-team').click();
  await expect(page.getByTestId('hat-crown')).not.toHaveClass(/is-fv-locked/);
  await page.getByTestId('hat-crown').click();
  await expect(page.getByTestId('hat-crown')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await page.getByTestId('team-back').click();

  // Persisted: after a reload the game starts unlocked.
  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: { ready: boolean } }).__craterpult?.ready,
  );
  await expect(page.getByTestId('open-full-version')).toHaveCount(0);
  await page.getByTestId('open-quick').click();
  await expect(page.getByTestId('team-size-4')).not.toHaveClass(/is-fv-locked/);
  expect(errors).toEqual([]);
});

test('cancel keeps the locks; failed, pending and restore states', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await boot(page);

  // A locked chip opens the sheet; a cancelled purchase changes nothing.
  await page.getByTestId('open-quick').click();
  await page.getByTestId('difficulty-4').click();
  await expect(page.getByTestId('paywall-reason')).toContainText('Bot levels 3–5');
  await setOutcome(page, 'cancelled');
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'cancelled');
  await expect(page.getByTestId('paywall-note')).toContainText('cancelled');
  await page.getByTestId('paywall-not-now').click();
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('difficulty-4')).toHaveClass(/is-fv-locked/);
  await expect(page.getByTestId('difficulty-4')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('difficulty-2')).toHaveAttribute('aria-checked', 'true');

  // Escape (web back button) closes the sheet.
  await page.getByTestId('team-size-4').click();
  await expect(page.getByTestId('paywall-reason')).toContainText('4-unit teams');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('paywall')).toHaveCount(0);
  await expect(page.getByTestId('team-size-3')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('quick-back').click();

  // A locked hat opens the sheet with its own context line.
  await page.getByTestId('open-team').click();
  await page.getByTestId('hat-halo').click();
  await expect(page.getByTestId('paywall-reason')).toContainText('Cosmetic hats');
  await page.getByTestId('paywall-close').click();
  await expect(page.getByTestId('hat-halo')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('team-back').click();

  // Menu button → failed → "Try again".
  await page.getByTestId('open-full-version').click();
  await expect(page.getByTestId('paywall-reason')).toContainText('whole game');
  await setOutcome(page, 'failed');
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'failed');
  await expect(page.getByTestId('paywall-buy')).toHaveText('Try again');

  // Pending: waits for the store, still locked.
  await setOutcome(page, 'pending');
  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall')).toHaveAttribute('data-status', 'pending');
  await expect(page.getByTestId('paywall-note')).toContainText('Payment pending');
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/paywall-pending-en.png` });

  // Restore: nothing yet, then a purchase made on another device.
  await page.getByTestId('paywall-restore').click();
  await expect(page.getByTestId('paywall-note')).toContainText('No previous purchase');
  await hooks(page, '(p) => p.ownedElsewhere()');
  await page.getByTestId('paywall-restore').click();
  await expect(page.getByTestId('paywall-success')).toBeVisible();
  await expect(page.getByTestId('paywall-success')).toContainText('restored');
  await page.getByTestId('paywall-done').click();
  await expect(page.getByTestId('open-full-version')).toHaveCount(0);
  await page.getByTestId('open-quick').click();
  await expect(page.getByTestId('difficulty-4')).not.toHaveClass(/is-fv-locked/);
  expect(errors).toEqual([]);
});

test('locked Daily opens the paywall (Hungarian), buying makes it playable', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await boot(page, '&today=2026-10-06', 'hu');
  await expect(page.getByTestId('start-daily')).toHaveText('Napi kihívás feloldása');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/locks-menu-hu.png`, fullPage: true });
  await page.getByTestId('daily-card').screenshot({ path: `${SHOTS}/locks-daily-hu.png` });

  await page.getByTestId('start-daily').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await expect(page.getByTestId('hud')).toHaveCount(0);
  await expect(page.getByTestId('paywall-reason')).toContainText('Napi kihívás');
  await expect(page.getByTestId('paywall')).toContainText('Nincs reklám. Nincs energia. Soha.');
  await expect(page.getByTestId('paywall-buy')).toHaveText('Feloldás: $4.99');
  await expect(page.getByTestId('paywall-restore')).toHaveText('Vásárlások visszaállítása');
  await settle(page);
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/paywall-hu.png` });

  await page.getByTestId('paywall-buy').click();
  await expect(page.getByTestId('paywall-success')).toBeVisible();
  // (No layout check here: the confetti flies past the edges on purpose, clipped by the card.)
  await settle(page, 900);
  await page.screenshot({ path: `${SHOTS}/paywall-success-hu.png` });
  await page.getByTestId('paywall-done').click();
  await expect(page.getByTestId('start-daily')).toHaveText('Mai kihívás indítása');
  await page.getByTestId('start-daily').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Campaign locks in Hungarian', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await boot(page, '', 'hu');
  await page.getByTestId('open-campaign').click();
  await page.getByTestId('chapter-tab-3').click();
  await expect(page.getByTestId('paywall')).toBeVisible();
  await page.getByTestId('paywall-close').click();
  await expect(page.getByTestId('chapter-fv-locked')).toContainText('3. fejezet');
  expect(await layoutProblems(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/locks-campaign-hu.png` });
  expect(errors).toEqual([]);
});

test.describe('paywall on a 360x640 phone', () => {
  test.use({ viewport: { width: 360, height: 640 } });
  for (const lang of ['en', 'hu', 'de'] as const) {
    test(`buy, restore and the legal links are above the fold (${lang})`, async ({ page }) => {
      const errors = await boot(page, '', lang);
      await page.getByTestId('open-full-version').click();
      await expect(page.getByTestId('paywall-privacy')).toBeVisible();
      await settle(page);
      const fold = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('.paywall-body')!;
        const card = document.querySelector<HTMLElement>('.paywall-card')!.getBoundingClientRect();
        const ids = ['paywall-buy', 'paywall-restore', 'paywall-terms', 'paywall-privacy'];
        return {
          scrollable: body.scrollHeight > body.clientHeight + 1,
          below: ids.filter((id) => {
            const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
            // The link text (the hit areas reach past it) sits inside the card and the screen.
            const mid = r.top + r.height / 2;
            return mid < card.top || mid > Math.min(card.bottom, window.innerHeight) - 8;
          }),
        };
      });
      expect(fold).toEqual({ scrollable: false, below: [] });
      expect(await layoutProblems(page)).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/paywall-360-${lang}.png` });
      expect(errors).toEqual([]);
    });
  }
});
