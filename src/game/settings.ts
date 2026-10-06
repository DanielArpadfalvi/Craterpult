/** Player settings, persisted inside the save (see `save.ts`). */

export type LanguageSetting = 'auto' | 'en' | 'hu';
export type AimPreview = 'short' | 'long';

export const TURN_TIMES = [30, 45, 60, 90] as const;
export type TurnTime = (typeof TURN_TIMES)[number];

export interface Settings {
  /** 'auto' = device language until the player picks one. */
  language: LanguageSetting;
  sound: boolean;
  haptics: boolean;
  /** Seconds of aiming per turn (applies to new matches). */
  turnTime: TurnTime;
  /** In-app reduced motion (on top of the OS setting): no shake, fewer particles. */
  reducedMotion: boolean;
  /** Larger UI text. */
  largeText: boolean;
  /** Length of the dotted aim preview ("aim assist"). */
  aimPreview: AimPreview;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  language: 'auto',
  sound: true,
  haptics: true,
  turnTime: 45,
  reducedMotion: false,
  largeText: false,
  aimPreview: 'short',
};

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function oneOf<T>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

/** Coerce stored settings; every invalid or missing field falls back to its default. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    language: oneOf<LanguageSetting>(['auto', 'en', 'hu'], r.language, d.language),
    sound: bool(r.sound, d.sound),
    haptics: bool(r.haptics, d.haptics),
    turnTime: oneOf<TurnTime>(TURN_TIMES, r.turnTime, d.turnTime),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    largeText: bool(r.largeText, d.largeText),
    aimPreview: oneOf<AimPreview>(['short', 'long'], r.aimPreview, d.aimPreview),
  };
}

/** Everything a settings change can touch; implemented by the app (mocked in tests). */
export interface SettingsTargets {
  /** null = follow the device language. */
  setLanguage(language: 'en' | 'hu' | null): void;
  setSound(on: boolean): void;
  setReducedMotion(on: boolean): void;
  setLargeText(on: boolean): void;
}

/**
 * Push `next` to the targets. With `prev`, only changed fields are applied; without it everything
 * is applied (boot). Haptics, turn time and the aim preview are read where they are used.
 */
export function applySettings(
  next: Settings,
  targets: SettingsTargets,
  prev: Settings | null = null,
): void {
  const changed = <K extends keyof Settings>(k: K): boolean => !prev || prev[k] !== next[k];
  if (changed('language')) targets.setLanguage(next.language === 'auto' ? null : next.language);
  if (changed('sound')) targets.setSound(next.sound);
  if (changed('reducedMotion')) targets.setReducedMotion(next.reducedMotion);
  if (changed('largeText')) targets.setLargeText(next.largeText);
}

/** Simulation ticks of aiming per turn for a turn-time setting (60 Hz). */
export function turnTicks(s: Pick<Settings, 'turnTime'>): number {
  return s.turnTime * 60;
}

/** Ticks of flight shown by the dotted aim preview. */
export function aimPreviewTicks(s: Pick<Settings, 'aimPreview'>): number {
  return s.aimPreview === 'long' ? 66 : 30;
}

/** Length (world px) of the sight line for direction weapons. */
export function sightLength(s: Pick<Settings, 'aimPreview'>, weaponRange: number): number {
  return weaponRange > 0 ? weaponRange : s.aimPreview === 'long' ? 260 : 160;
}
