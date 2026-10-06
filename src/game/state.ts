import type { Phase, WeaponId } from '../core/types';

export type Screen = 'menu' | 'playing';
export type Overlay = 'pass' | 'over' | 'pause' | null;

export interface TeamHud {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  alive: number;
}

export interface WeaponInfo {
  /** Rounds left; -1 = unlimited. */
  ammo: number;
  /** Usable right now. */
  ok: boolean;
  /** Team turn from which it unlocks. */
  fromTurn: number;
  /** The active team has reached `fromTurn`. */
  unlocked: boolean;
}

export interface Toast {
  id: number;
  text: string;
}

export interface UiState {
  screen: Screen;
  overlay: Overlay;
  phase: Phase;
  activeTeam: number;
  activeName: string;
  turnSeconds: number;
  wind: number;
  teams: TeamHud[];
  weapon: WeaponId;
  fuse: number;
  /** Girder tilt in deci-degrees (0, 450, 900, 1350). */
  girderAngle: number;
  weaponsOpen: boolean;
  weaponInfo: Partial<Record<WeaponId, WeaponInfo>>;
  toast: Toast | null;
  canMove: boolean;
  canFire: boolean;
  winner: number | null;
  /** Shows the aiming hint until the first shot of the session. */
  showAimHint: boolean;
  /** Sound and haptics off. */
  muted: boolean;
  /** Bumped when the language changes so the whole UI re-renders. */
  lang: string;
}

export const INITIAL_UI: UiState = {
  screen: 'menu',
  overlay: null,
  phase: 'aiming',
  activeTeam: 0,
  activeName: '',
  turnSeconds: 0,
  wind: 0,
  teams: [],
  weapon: 'bazooka',
  fuse: 3,
  girderAngle: 0,
  weaponsOpen: false,
  weaponInfo: {},
  toast: null,
  canMove: false,
  canFire: false,
  winner: null,
  showAimHint: true,
  muted: false,
  lang: 'en',
};
