import { expect, test, type Page } from '@playwright/test';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

/** Simulate the app going to the background / foreground (web lifecycle = visibilitychange). */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (h ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('backgrounding the app pauses a running match, but not the menu', async ({ page }) => {
  await page.goto('/?test');
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: { ready: boolean } }).__craterpult?.ready,
  );

  // On the menu nothing happens.
  await setHidden(page, true);
  await setHidden(page, false);
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);

  // During a match (vs bot: no pass screen) the pause overlay appears and stays after resume.
  await page.getByTestId('start-bot').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await setHidden(page, true);
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await setHidden(page, false);
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
});
