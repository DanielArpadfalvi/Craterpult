import { describe, expect, it } from 'vitest';
import { chapterMissions, missionById } from '../../../src/core/campaign';
import {
  beginDaily,
  currentStreak,
  dateKey,
  finishDaily,
  previousDay,
} from '../../../src/game/daily';
import {
  chapterCompleted,
  chapterUnlocked,
  missionUnlocked,
  recordMission,
  totalStars,
} from '../../../src/game/progress';
import { createDefaultSave } from '../../../src/game/save';

describe('campaign progress', () => {
  it('unlocks missions in order and chapters after 7 wins', () => {
    const s = createDefaultSave();
    expect(missionUnlocked(s, missionById('c1-01')!)).toBe(true);
    expect(missionUnlocked(s, missionById('c1-02')!)).toBe(false);
    expect(chapterUnlocked(s, 2)).toBe(false);
    recordMission(s, 'c1-01', 1);
    expect(missionUnlocked(s, missionById('c1-02')!)).toBe(true);
    for (const m of chapterMissions(1).slice(0, 6)) recordMission(s, m.id, 2);
    expect(chapterCompleted(s, 1)).toBe(6);
    expect(chapterUnlocked(s, 2)).toBe(false);
    recordMission(s, 'c1-07', 3);
    expect(chapterUnlocked(s, 2)).toBe(true);
    expect(missionUnlocked(s, missionById('c2-01')!)).toBe(true);
    expect(chapterUnlocked(s, 3)).toBe(false);
  });

  it('keeps the best stars', () => {
    const s = createDefaultSave();
    recordMission(s, 'c1-01', 3);
    recordMission(s, 'c1-01', 1);
    expect(s.campaign.stars['c1-01']).toBe(3);
    recordMission(s, 'c1-02', 0);
    expect(s.campaign.stars['c1-02']).toBeUndefined();
    expect(totalStars(s)).toBe(3);
  });
});

describe('daily streak', () => {
  it('formats dates and steps back across month ends', () => {
    expect(dateKey(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });

  it('one official attempt per day, practice afterwards, streak over consecutive days', () => {
    const s = createDefaultSave();
    expect(beginDaily(s, '2026-10-05').official).toBe(true);
    finishDaily(s, '2026-10-05', 1100, true, true);
    expect(beginDaily(s, '2026-10-05').official).toBe(false);
    finishDaily(s, '2026-10-05', 1500, true, false);
    expect(s.daily.days['2026-10-05']).toMatchObject({ score: 1100, practiceBest: 1500 });
    expect(s.daily.best).toBe(1100);
    expect(s.daily.streak.current).toBe(1);
    expect(beginDaily(s, '2026-10-06').official).toBe(true);
    expect(s.daily.streak.current).toBe(2);
    expect(currentStreak(s, '2026-10-07')).toBe(2);
    expect(currentStreak(s, '2026-10-08')).toBe(0);
    beginDaily(s, '2026-10-09');
    expect(s.daily.streak).toEqual({ current: 1, best: 2, last: '2026-10-09' });
  });
});
