import { CHAPTER_UNLOCK_COUNT, chapterMissions, MISSIONS, type Mission } from '../core/campaign';
import type { SaveData } from './save';

export function missionStars(save: SaveData, id: string): number {
  return save.campaign.stars[id] ?? 0;
}

/** Missions of a chapter finished with at least one star. */
export function chapterCompleted(save: SaveData, chapter: number): number {
  return chapterMissions(chapter).filter((m) => missionStars(save, m.id) > 0).length;
}

export function chapterStars(save: SaveData, chapter: number): number {
  return chapterMissions(chapter).reduce((n, m) => n + missionStars(save, m.id), 0);
}

/** Chapter 1 is always open; chapter N+1 opens after finishing 7 missions of chapter N. */
export function chapterUnlocked(save: SaveData, chapter: number): boolean {
  if (chapter <= 1) return true;
  return (
    chapterUnlocked(save, chapter - 1) &&
    chapterCompleted(save, chapter - 1) >= CHAPTER_UNLOCK_COUNT
  );
}

/** Within an open chapter, a mission opens once the one before it is finished. */
export function missionUnlocked(save: SaveData, m: Mission): boolean {
  if (!chapterUnlocked(save, m.chapter)) return false;
  if (m.index === 1) return true;
  const prev = chapterMissions(m.chapter).find((x) => x.index === m.index - 1);
  return !prev || missionStars(save, prev.id) > 0;
}

/** Keep the best star count (mutates and returns the draft). */
export function recordMission(save: SaveData, id: string, stars: number): SaveData {
  if (stars > missionStars(save, id)) save.campaign.stars[id] = Math.min(3, stars);
  return save;
}

export function totalStars(save: SaveData): number {
  return MISSIONS.reduce((n, m) => n + missionStars(save, m.id), 0);
}
