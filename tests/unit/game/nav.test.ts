import { describe, expect, it } from 'vitest';
import { backAction } from '../../../src/game/nav';

const base = {
  screen: 'playing' as const,
  overlay: null,
  sheet: null,
  weaponsOpen: false,
  missionIntro: null,
};

describe('back button', () => {
  it('closes the topmost sheet first, even over a paused match', () => {
    expect(backAction({ ...base, overlay: 'pause', sheet: 'settings' })).toBe('closeSheet');
    expect(backAction({ ...base, screen: 'menu', sheet: 'stats' })).toBe('closeSheet');
  });

  it('closes the weapon panel, then pauses and resumes a match', () => {
    expect(backAction({ ...base, weaponsOpen: true })).toBe('closeWeapons');
    expect(backAction(base)).toBe('pause');
    expect(backAction({ ...base, overlay: 'pause' })).toBe('resume');
  });

  it('leaves finished matches and waits on the hand-over screen', () => {
    expect(backAction({ ...base, overlay: 'result' })).toBe('leaveMatch');
    expect(backAction({ ...base, overlay: 'over' })).toBe('leaveMatch');
    expect(backAction({ ...base, overlay: 'pass' })).toBe('none');
  });

  it('goes back from sub-screens and does nothing on the main menu', () => {
    expect(backAction({ ...base, screen: 'campaign', missionIntro: 'c1-01' })).toBe('closeIntro');
    expect(backAction({ ...base, screen: 'campaign' })).toBe('toMenu');
    expect(backAction({ ...base, screen: 'menu' })).toBe('none');
  });
});
