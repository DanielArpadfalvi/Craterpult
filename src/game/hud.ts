import type { UiState } from './state';

/** Same own keys with `Object.is`-equal values (one level deep). */
export function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(ra[k], rb[k]));
}

/** `prev` when every entry of `next` is shallow-equal to it, else `next`. */
export function reuseArray<T extends object>(prev: T[], next: T[]): T[] {
  if (prev.length !== next.length) return next;
  return next.every((x, i) => shallowEqual(prev[i] as T, x)) ? prev : next;
}

/** `prev` when it has the same keys and every value is shallow-equal, else `next`. */
export function reuseRecord<T extends object>(
  prev: Partial<Record<string, T>>,
  next: Partial<Record<string, T>>,
): Partial<Record<string, T>> {
  const ka = Object.keys(prev);
  const kb = Object.keys(next);
  if (ka.length !== kb.length) return next;
  return kb.every((k) => {
    const a = prev[k];
    const b = next[k];
    return a !== undefined && b !== undefined && shallowEqual(a, b);
  })
    ? prev
    : next;
}

/** HUD fields refreshed from the match ~10× per second. */
export type HudFields = Pick<
  UiState,
  | 'phase'
  | 'activeTeam'
  | 'activeName'
  | 'activeColor'
  | 'turnSeconds'
  | 'wind'
  | 'teams'
  | 'canMove'
  | 'canFire'
  | 'botTurn'
  | 'weaponInfo'
>;

/**
 * Only the HUD fields that really changed, with unchanged `teams` / `weaponInfo` kept as the very
 * same objects, so publishing an unchanged HUD is a no-op for the store (no UI re-render).
 */
export function hudPatch(state: UiState, next: HudFields): Partial<UiState> {
  const merged: HudFields = {
    ...next,
    teams: reuseArray(state.teams, next.teams),
    weaponInfo: reuseRecord(state.weaponInfo, next.weaponInfo) as UiState['weaponInfo'],
  };
  const patch: Partial<UiState> = {};
  for (const k of Object.keys(merged) as (keyof HudFields)[]) {
    if (!Object.is(state[k], merged[k])) (patch as Record<string, unknown>)[k] = merged[k];
  }
  return patch;
}
