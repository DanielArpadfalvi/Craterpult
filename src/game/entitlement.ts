import type { Difficulty } from '../core/ai/bot';
import { MAP_STYLES, type MapStyle } from '../core/mapgen';

/**
 * Free vs. Full Version gating rules (T7.2). The Full Version is one non-consumable purchase
 * (RevenueCat entitlement `full_version`). Free: campaign chapter 1, quick match vs bots at
 * difficulty 1–2 with up to 3 units per team on the hills / islands maps, pass & play.
 * Campaign progress (finish 7 missions to open the next chapter) applies on top of this.
 */

/** Chapters playable without the Full Version. */
export const FREE_CHAPTERS = 1;
export const FREE_MAX_DIFFICULTY = 2;
export const FREE_MAX_TEAM_SIZE = 3;
export const FREE_MAP_STYLES: readonly MapStyle[] = ['hills', 'islands'];

/** What a locked item asks for (picks the context line of the Full Version sheet). */
export type PaywallReason =
  'menu' | 'campaign' | 'difficulty' | 'teamSize' | 'mapStyle' | 'daily' | 'hats' | 'online';

export function chapterNeedsFull(chapter: number): boolean {
  return chapter > FREE_CHAPTERS;
}

export function difficultyNeedsFull(d: number): boolean {
  return d > FREE_MAX_DIFFICULTY;
}

export function teamSizeNeedsFull(n: number): boolean {
  return n > FREE_MAX_TEAM_SIZE;
}

/** `random` stays free: it picks among the maps the player owns. */
export function mapStyleNeedsFull(style: MapStyle | 'random'): boolean {
  return style !== 'random' && !FREE_MAP_STYLES.includes(style);
}

/** The Daily Challenge is a Full Version mode. */
export function dailyNeedsFull(): boolean {
  return true;
}

/**
 * Creating online matches (M9) is a Full Version feature; joining a friend's invite is free so
 * anyone can accept one.
 */
export function onlineCreateNeedsFull(): boolean {
  return true;
}

/** Cosmetic hats (team customization, M6) are Full Version content. */
export function hatsNeedFull(): boolean {
  return true;
}

/** Map styles `random` may pick from. */
export function ownedMapStyles(full: boolean): readonly MapStyle[] {
  return full ? MAP_STYLES : FREE_MAP_STYLES;
}

export interface QuickOptions {
  difficulty: Difficulty;
  teamSize: number;
  mapStyle: MapStyle | 'random';
}

/**
 * Quick-match options the player may use: Full Version picks fall back to the best free choice
 * (used when the entitlement goes away, e.g. after a refund, and as a guard when a match starts).
 */
export function allowedQuickOptions(full: boolean, o: QuickOptions): QuickOptions {
  if (full) return o;
  return {
    difficulty: difficultyNeedsFull(o.difficulty) ? FREE_MAX_DIFFICULTY : o.difficulty,
    teamSize: teamSizeNeedsFull(o.teamSize) ? FREE_MAX_TEAM_SIZE : o.teamSize,
    mapStyle: mapStyleNeedsFull(o.mapStyle) ? 'random' : o.mapStyle,
  };
}
