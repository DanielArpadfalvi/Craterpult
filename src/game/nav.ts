import type { UiState } from './state';

/**
 * What the hardware back button (Android) or Escape does: close the topmost sheet / panel /
 * dialog, pause a running match, or go back from a sub-screen. On the main menu it does nothing
 * (it never exits the app).
 */
export type BackAction =
  | 'closeSheet'
  | 'closeWeapons'
  | 'closeIntro'
  | 'pause'
  | 'resume'
  | 'leaveMatch'
  | 'toMenu'
  | 'none';

export function backAction(
  s: Pick<UiState, 'screen' | 'overlay' | 'sheet' | 'weaponsOpen' | 'missionIntro'>,
): BackAction {
  if (s.sheet) return 'closeSheet';
  if (s.screen === 'playing') {
    switch (s.overlay) {
      case null:
        return s.weaponsOpen ? 'closeWeapons' : 'pause';
      case 'pause':
        return 'resume';
      case 'over':
      case 'result':
        return 'leaveMatch';
      // The hand-over screen waits for the next player; back would only confuse it.
      case 'pass':
        return 'none';
    }
  }
  if (s.screen === 'campaign') return s.missionIntro ? 'closeIntro' : 'toMenu';
  return 'none';
}
