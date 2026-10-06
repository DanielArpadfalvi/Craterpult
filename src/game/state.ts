import type { MapStyle } from '../core/mapgen';
import type { Phase, WeaponId } from '../core/types';
import { INITIAL_PAYWALL, type PaywallState } from './paywall';
import { createDefaultSave, type SaveData } from './save';

export type Screen = 'menu' | 'campaign' | 'playing';
export type Overlay = 'pass' | 'over' | 'pause' | 'result' | null;
export type GameMode = 'hotseat' | 'quick' | 'campaign' | 'daily';
/** Full-page sub-screens opened over the current screen (menu, or a paused match for settings). */
export type Sheet = 'settings' | 'stats' | 'team' | 'quick' | null;

/** End-of-match summary for campaign and daily matches. */
export type MatchResult =
  | {
      kind: 'campaign';
      missionId: string;
      won: boolean;
      stars: number;
      /** Best stars before this match. */
      prevStars: number;
      /** A chapter that this result unlocked, or null. */
      unlockedChapter: number | null;
      /** The next mission, when it is unlocked. */
      nextId: string | null;
      /** Whether each bonus-star rule was met (only meaningful when won). */
      rulesMet: boolean[];
    }
  | {
      kind: 'daily';
      won: boolean;
      score: number;
      official: boolean;
      hpLeft: number;
      turns: number;
      winBonus: number;
      turnCost: number;
      best: number;
      streak: number;
    };

export interface TeamHud {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  alive: number;
  /** CSS color of the team. */
  color: string;
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
  sheet: Sheet;
  phase: Phase;
  activeTeam: number;
  activeName: string;
  /** CSS color of the active team. */
  activeColor: string;
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
  /** Bot difficulty last chosen in the menu. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** The active team is a bot. */
  botTurn: boolean;
  /** The bot is still searching for its shot. */
  botThinking: boolean;
  /** Bumped when the language changes so the whole UI re-renders. */
  lang: string;
  mode: GameMode;
  /** Persisted progress (read-only snapshot for the UI). */
  save: SaveData;
  /** Chapter tab shown on the campaign screen. */
  chapter: number;
  /** Mission whose intro card is open on the campaign screen. */
  missionIntro: string | null;
  /** Mission being played. */
  missionId: string | null;
  result: MatchResult | null;
  /** Quick match: units per team (2–4). */
  teamSize: number;
  /** Quick match map. */
  mapStyle: MapStyle | 'random';
  /** Today's date key (`YYYY-MM-DD`) for the daily challenge. */
  today: string;
  // T7.2 monetization (see src/game/entitlement.ts, src/game/paywall.ts).
  /** The Full Version is owned (store entitlement). */
  fullVersion: boolean;
  /** Full Version sheet and purchase flow. */
  paywall: PaywallState;
}

export const INITIAL_UI: UiState = {
  screen: 'menu',
  overlay: null,
  sheet: null,
  phase: 'aiming',
  activeTeam: 0,
  activeName: '',
  activeColor: '#3ef0ff',
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
  difficulty: 2,
  botTurn: false,
  botThinking: false,
  lang: 'en',
  mode: 'quick',
  save: createDefaultSave(),
  chapter: 1,
  missionIntro: null,
  missionId: null,
  result: null,
  teamSize: 3,
  mapStyle: 'random',
  today: '',
  fullVersion: false,
  paywall: INITIAL_PAYWALL,
};
