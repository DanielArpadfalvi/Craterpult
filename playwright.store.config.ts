import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, defineConfig } from '@playwright/test';
import { STORE_TARGETS } from './scripts/store-frames';

/**
 * Store screenshots (`npm run store:screens`): drives the real game through the `?test` hooks,
 * captures raw frames at each store's device size and composes the captioned marketing frames into
 * `store/screenshots/<lang>/<target>/NN-scene.png`. Kept out of the default e2e run
 * (`playwright.config.ts` ignores `store-screens.spec.ts`).
 *
 *   npm run store:screens                            # every target, EN + HU
 *   npm run store:screens -- --project=ios-6.9       # one target
 *   STORE_SCENES=aim,blast npm run store:screens     # some scenes
 *   STORE_COMPOSE_ONLY=1 npm run store:screens       # re-frame the last raw captures
 */
const PORT = Number(process.env.PW_PORT ?? 4173);
/** Under node_modules/.cache: ignored everywhere, and a parallel e2e run does not wipe it. */
const OUT_DIR = 'node_modules/.cache/craterpult-store/dist';

function resolveChromiumExecutable(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const candidate = join(root, 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

const executablePath = resolveChromiumExecutable();

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'store-screens.spec.ts',
  outputDir: 'test-results/store',
  fullyParallel: true,
  workers: 2,
  // Software WebGL at 3x DPR is slow: generous per-test budget.
  timeout: 1_800_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    hasTouch: true,
    isMobile: true,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: STORE_TARGETS.map((t) => ({
    name: t.id,
    use: { viewport: t.capture.viewport, deviceScaleFactor: t.capture.scale },
  })),
  webServer: {
    // Own build folder: does not race a parallel `npm run test:e2e` / `npm run build` over dist/.
    command: `npx vite build --outDir ${OUT_DIR} --emptyOutDir && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
