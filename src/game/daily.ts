import type { DailyDay, SaveData } from './save';

/** Local calendar date as `YYYY-MM-DD` (the daily seed is computed here, outside the core). */
export function dateKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The day before a `YYYY-MM-DD` key. */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dateKey(new Date(y, m - 1, d - 1, 12));
}

const EMPTY_DAY: DailyDay = { score: 0, won: false, official: false, done: false, practiceBest: 0 };
const KEEP_DAYS = 60;

export function dailyDay(save: SaveData, key: string): DailyDay {
  return save.daily.days[key] ?? { ...EMPTY_DAY };
}

/** Streak as it stands today: it is broken when neither today nor yesterday was played. */
export function currentStreak(save: SaveData, key: string): number {
  const { last, current } = save.daily.streak;
  return last === key || last === previousDay(key) ? current : 0;
}

/**
 * Start a daily attempt. The first attempt of the day is the official one (spent immediately,
 * and it extends the streak); later attempts are practice. Mutates the draft.
 */
export function beginDaily(save: SaveData, key: string): { save: SaveData; official: boolean } {
  const day = dailyDay(save, key);
  const official = !day.official;
  if (official) {
    day.official = true;
    const st = save.daily.streak;
    st.current = st.last === previousDay(key) ? st.current + 1 : st.last === key ? st.current : 1;
    st.last = key;
    st.best = Math.max(st.best, st.current);
  }
  save.daily.days[key] = day;
  const keys = Object.keys(save.daily.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete save.daily.days[k];
  return { save, official };
}

/** Record a finished attempt. Mutates the draft. */
export function finishDaily(
  save: SaveData,
  key: string,
  score: number,
  won: boolean,
  official: boolean,
): SaveData {
  const day = dailyDay(save, key);
  if (official && !day.done) {
    day.score = score;
    day.won = won;
    day.done = true;
    save.daily.best = Math.max(save.daily.best, score);
  } else {
    day.practiceBest = Math.max(day.practiceBest, score);
  }
  save.daily.days[key] = day;
  return save;
}
