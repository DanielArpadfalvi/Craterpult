import { expect, test } from '@playwright/test';
import { boot, call } from './helpers';

test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

type ThemeApi = {
  actions: {
    setMapStyle(style: string): void;
    startBotMatch(difficulty: number, seed?: string): void;
  };
  getMatch(): { mapStyle?: string } | null;
};

const STYLES = ['hills', 'islands', 'cavern', 'towers', 'flats'] as const;

for (const style of STYLES) {
  test(`map theme: ${style}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await boot(page, '&full');
    await page.evaluate((st) => {
      const api = (window as unknown as { __craterpult: ThemeApi }).__craterpult;
      api.actions.setMapStyle(st);
      api.actions.startBotMatch(1, `theme-${st}`);
    }, style);
    await expect(page.getByTestId('hud')).toBeVisible();
    await call(page, (a) => a.stopRendering());
    const matchStyle = await page.evaluate(
      () => (window as unknown as { __craterpult: ThemeApi }).__craterpult.getMatch()?.mapStyle,
    );
    expect(matchStyle).toBe(style);
    // Let the units settle, then render enough frames for the camera and ambient life to run.
    await call(page, (a) => a.stepTicks(120));
    await call(page, (a) => a.renderFrames(90));
    await page.screenshot({ path: `tests/e2e/__screenshots__/theme-${style}.png` });
    expect(errors).toEqual([]);
  });
}
