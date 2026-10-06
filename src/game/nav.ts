import type { UiState } from './state';

/**
 * What the hardware back button (Android) or Escape does: close the topmost sheet / panel /
 * dialog, pause a running match (also from the hand-over screen), or go back from a sub-screen.
 * On the main menu it sends the app to the background (minimize, never exit: progress and the
 * WebView state survive).
 */
export type BackAction =
  | 'closeSheet'
  | 'closeWeapons'
  | 'closeIntro'
  | 'pause'
  | 'resume'
  | 'leaveMatch'
  | 'toMenu'
  | 'minimize'
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
      case 'waiting':
      case 'desync':
        return 'leaveMatch';
      // Pause over the hand-over screen; resuming returns to it.
      case 'pass':
        return 'pause';
    }
  }
  if (s.screen === 'campaign') return s.missionIntro ? 'closeIntro' : 'toMenu';
  if (s.screen === 'menu') return 'minimize';
  return 'none';
}
