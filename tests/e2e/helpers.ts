import type { Page } from '@playwright/test';

export type Summary = {
  activeTeam: number;
  phase: string;
  winner: number | null;
  overlay: string | null;
  shots: number[];
  hp: number[];
  units: { x: number; y: number; team: number }[];
};

export type Api = {
  ready: boolean;
  summary(): Summary | null;
  stepTicks(n: number): void;
  stopRendering(): void;
  renderFrames(n: number): void;
  playBotTurn(): boolean;
  finishEnemies(): boolean;
  getSave(): { campaign: { stars: Record<string, number> }; daily: Record<string, unknown> };
};

export const call = <T>(page: Page, fn: (api: Api) => T) =>
  page.evaluate(`(${fn.toString()})(window.__craterpult)`) as Promise<T>;

export const summary = (page: Page) => call(page, (a) => a.summary());

export async function boot(page: Page, query = '', lang: 'en' | 'hu' = 'en'): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((l) => {
    if (!sessionStorage.getItem('booted')) {
      localStorage.setItem('craterpult:lang', l);
      sessionStorage.setItem('booted', '1');
    }
  }, lang);
  await page.goto(`/?test${query}`);
  await page.waitForFunction(
    () => (window as unknown as { __craterpult?: Api }).__craterpult?.ready,
  );
  return errors;
}

/** Wipe the enemy out on the human's turn and step until the match is over. */
export async function winNow(page: Page): Promise<Summary> {
  await call(page, (a) => a.finishEnemies());
  let s = (await summary(page)) as Summary;
  for (let t = 0; t < 3000 && s.phase !== 'over'; t += 30) {
    await call(page, (a) => a.stepTicks(30));
    s = (await summary(page)) as Summary;
  }
  return s;
}

/** Find layout problems: horizontal overflow, clipped text, small tap targets. */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw) out.push('page scrolls horizontally');
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('#ui *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = `${el.tagName.toLowerCase()}.${el.className}[${el.dataset.testid ?? ''}]`;
      if (r.right > vw + 0.5 || r.left < -0.5) out.push(`${name} outside viewport`);
      const st = getComputedStyle(el);
      if (
        el.children.length === 0 &&
        el.scrollWidth > el.clientWidth + 1 &&
        st.overflow !== 'visible' &&
        st.textOverflow !== 'ellipsis'
      )
        out.push(`${name} text clipped`);
      if (el.tagName === 'BUTTON' && !(el as HTMLButtonElement).disabled) {
        if (r.height < 44 || r.width < 44) out.push(`${name} tap target ${r.width}x${r.height}`);
      }
    }
    return out;
  });
}
