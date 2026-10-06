import { HAT_STYLES, type HatStyle } from '../render/hats';
import { hatsNeedFull } from './entitlement';
import { TEAM_COLORS, TEAM_SHAPES } from '../render/palette';

/** The player's team customization (persisted in the save). */
export interface Profile {
  /** Custom team name; '' = the default name of the mode. */
  name: string;
  /** Index into the team colors (0 cyan, 1 pink, 2 lime, 3 amber). */
  color: number;
  /** 'auto' = the team shape of the chosen color. */
  hat: HatStyle | 'auto';
}

export const TEAM_NAME_MAX = 16;
export const COLOR_COUNT = TEAM_COLORS.length;

export const DEFAULT_PROFILE: Readonly<Profile> = { name: '', color: 0, hat: 'auto' };

/** Cosmetic hats unlocked by total campaign stars. */
export const HAT_UNLOCKS: Partial<Record<HatStyle, number>> = { crown: 12, horns: 36, halo: 66 };

/**
 * Cosmetic hats (the star unlocks above; the plain team shapes stay free for color-blind
 * players) are Full Version content (T7.2, `hatsNeedFull()`).
 */
export function hatNeedsFull(hat: HatStyle | 'auto'): boolean {
  return hat !== 'auto' && HAT_UNLOCKS[hat] !== undefined && hatsNeedFull();
}

/** A hat the player may wear: owned (Full Version, if needed) and earned by campaign stars. */
export function hatUnlocked(hat: HatStyle | 'auto', stars: number, fullVersion: boolean): boolean {
  if (hat === 'auto') return true;
  if (hatNeedsFull(hat) && !fullVersion) return false;
  return stars >= (HAT_UNLOCKS[hat] ?? 0);
}

/**
 * Clean a typed team name: no control characters or angle brackets, whitespace collapsed, trimmed,
 * at most `TEAM_NAME_MAX` characters (code points, so emoji are not split).
 */
export function sanitizeTeamName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart();
  return Array.from(cleaned).slice(0, TEAM_NAME_MAX).join('').trim();
}

export function sanitizeProfile(raw: unknown): Profile {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const color =
    typeof r.color === 'number' &&
    Number.isInteger(r.color) &&
    r.color >= 0 &&
    r.color < COLOR_COUNT
      ? r.color
      : DEFAULT_PROFILE.color;
  const hat =
    r.hat === 'auto' || (HAT_STYLES as readonly unknown[]).includes(r.hat)
      ? (r.hat as Profile['hat'])
      : DEFAULT_PROFILE.hat;
  return { name: sanitizeTeamName(r.name), color, hat };
}

/** How one team looks on screen. */
export interface TeamLook {
  /** Index into the team colors. */
  color: number;
  hat: HatStyle;
}

/**
 * Looks for a match's teams: team 0 is the player (their color and hat, if unlocked); the other
 * teams take the remaining colors in order, each with its color's team shape. If the player wears
 * another color's shape, that team gets the player's color shape instead, so every team keeps a
 * distinct hat for color-blind players.
 */
export function teamLooks(
  teamCount: number,
  profile: Profile,
  stars: number,
  fullVersion: boolean,
): TeamLook[] {
  const own = profile.color % COLOR_COUNT;
  const ownHat: HatStyle =
    profile.hat !== 'auto' && hatUnlocked(profile.hat, stars, fullVersion)
      ? profile.hat
      : (TEAM_SHAPES[own] as HatStyle);
  const others = Array.from({ length: COLOR_COUNT }, (_, i) => i).filter((c) => c !== own);
  const looks: TeamLook[] = [{ color: own, hat: ownHat }];
  for (let i = 1; i < teamCount; i++) {
    const color = others[(i - 1) % others.length] as number;
    let hat = TEAM_SHAPES[color] as HatStyle;
    if (hat === ownHat) hat = TEAM_SHAPES[own] as HatStyle;
    looks.push({ color, hat });
  }
  return looks;
}
