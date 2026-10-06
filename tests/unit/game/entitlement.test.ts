import { describe, expect, it } from 'vitest';
import { MAP_STYLES } from '../../../src/core/mapgen';
import {
  allowedQuickOptions,
  chapterNeedsFull,
  dailyNeedsFull,
  difficultyNeedsFull,
  FREE_MAP_STYLES,
  hatsNeedFull,
  mapStyleNeedsFull,
  ownedMapStyles,
  teamSizeNeedsFull,
} from '../../../src/game/entitlement';

describe('Full Version gating rules', () => {
  it('campaign: only chapter 1 is free', () => {
    expect(chapterNeedsFull(1)).toBe(false);
    expect(chapterNeedsFull(2)).toBe(true);
    expect(chapterNeedsFull(3)).toBe(true);
  });

  it('bots: difficulty 1–2 free, 3–5 locked', () => {
    expect([1, 2, 3, 4, 5].map(difficultyNeedsFull)).toEqual([false, false, true, true, true]);
  });

  it('team size up to 3 is free', () => {
    expect([2, 3, 4].map(teamSizeNeedsFull)).toEqual([false, false, true]);
  });

  it('maps: hills + islands (and random) are free, the rest locked', () => {
    expect(mapStyleNeedsFull('random')).toBe(false);
    for (const m of MAP_STYLES) expect(mapStyleNeedsFull(m)).toBe(!FREE_MAP_STYLES.includes(m));
    expect(FREE_MAP_STYLES).toEqual(['hills', 'islands']);
    expect(ownedMapStyles(false)).toEqual(['hills', 'islands']);
    expect(ownedMapStyles(true)).toEqual(MAP_STYLES);
  });

  it('daily challenge and hats need the Full Version', () => {
    expect(dailyNeedsFull()).toBe(true);
    expect(hatsNeedFull()).toBe(true);
  });

  it('allowedQuickOptions drops locked picks to free ones only without the Full Version', () => {
    const o = { difficulty: 5 as const, teamSize: 4, mapStyle: 'cavern' as const };
    expect(allowedQuickOptions(true, o)).toEqual(o);
    expect(allowedQuickOptions(false, o)).toEqual({
      difficulty: 2,
      teamSize: 3,
      mapStyle: 'random',
    });
    const free = { difficulty: 1 as const, teamSize: 2, mapStyle: 'islands' as const };
    expect(allowedQuickOptions(false, free)).toEqual(free);
  });
});
