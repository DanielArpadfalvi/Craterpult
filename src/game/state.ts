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
  weaponsOpen: boolean;
  canMove: boolean;
  canFire: boolean;
  winner: number | null;
  /** Shows the aiming hint until the first shot of the session. */
  showAimHint: boolean;
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
  weaponsOpen: false,
  canMove: false,
  canFire: false,
  winner: null,
  showAimHint: true,
  lang: 'en',
};
