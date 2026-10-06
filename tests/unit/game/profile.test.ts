import { describe, expect, it } from 'vitest';
import { hatsNeedFull } from '../../../src/game/entitlement';
import {
  DEFAULT_PROFILE,
  HAT_UNLOCKS,
  hatNeedsFull,
  hatUnlocked,
  sanitizeProfile,
  sanitizeTeamName,
  teamLooks,
} from '../../../src/game/profile';

describe('team name', () => {
  it('trims, collapses whitespace and caps at 16 characters', () => {
    expect(sanitizeTeamName('  Boom   Squad  ')).toBe('Boom Squad');
    expect(sanitizeTeamName('A'.repeat(30))).toBe('A'.repeat(16));
    expect(sanitizeTeamName('ÁrvíztűrőTükörfúrógép')).toBe('ÁrvíztűrőTükörfú');
  });

  it('strips control characters, markup brackets and bidi tricks', () => {
    expect(sanitizeTeamName('<b>Hi</b>\n\u0007')).toBe('bHi/b');
    expect(sanitizeTeamName('ab‮cd​')).toBe('abcd');
    expect(sanitizeTeamName(42)).toBe('');
  });

  it('does not split emoji at the length limit', () => {
    const name = sanitizeTeamName('💥'.repeat(20));
    expect(Array.from(name)).toHaveLength(16);
    expect(name).toBe('💥'.repeat(16));
  });
});

describe('profile', () => {
  it('sanitizes stored profiles', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile({ name: ' X ', color: 2, hat: 'crown' })).toEqual({
      name: 'X',
      color: 2,
      hat: 'crown',
    });
    expect(sanitizeProfile({ color: 7, hat: 'cape' })).toEqual(DEFAULT_PROFILE);
  });

  it('unlocks extra hats by campaign stars', () => {
    expect(hatUnlocked('circle', 0, true)).toBe(true);
    expect(hatUnlocked('auto', 0, true)).toBe(true);
    expect(hatUnlocked('crown', HAT_UNLOCKS.crown! - 1, true)).toBe(false);
    expect(hatUnlocked('crown', HAT_UNLOCKS.crown!, true)).toBe(true);
    expect(Object.keys(HAT_UNLOCKS).length).toBeGreaterThanOrEqual(2);
  });

  it('cosmetic hats need the Full Version; the team shapes stay free (T7.2)', () => {
    expect(hatsNeedFull()).toBe(true);
    expect(hatNeedsFull('auto')).toBe(false);
    expect(hatNeedsFull('circle')).toBe(false);
    for (const hat of Object.keys(HAT_UNLOCKS) as (keyof typeof HAT_UNLOCKS)[]) {
      expect(hatNeedsFull(hat)).toBe(true);
      expect(hatUnlocked(hat, 999, false)).toBe(false);
      expect(hatUnlocked(hat, 999, true)).toBe(true);
    }
    expect(hatUnlocked('square', 0, false)).toBe(true);
  });
});

describe('team looks', () => {
  it('defaults to the classic team colors and shapes', () => {
    expect(teamLooks(4, DEFAULT_PROFILE, 0, true)).toEqual([
      { color: 0, hat: 'circle' },
      { color: 1, hat: 'diamond' },
      { color: 2, hat: 'triangle' },
      { color: 3, hat: 'square' },
    ]);
  });

  it('gives the bots the other colors', () => {
    const looks = teamLooks(3, { ...DEFAULT_PROFILE, color: 1 }, 0, true);
    expect(looks.map((l) => l.color)).toEqual([1, 0, 2]);
    expect(looks[0]!.hat).toBe('diamond');
  });

  it('keeps every hat distinct when the player wears another team shape', () => {
    const looks = teamLooks(4, { name: '', color: 0, hat: 'diamond' }, 0, true);
    expect(looks[0]).toEqual({ color: 0, hat: 'diamond' });
    expect(looks[1]).toEqual({ color: 1, hat: 'circle' });
    expect(new Set(looks.map((l) => l.hat)).size).toBe(4);
  });

  it('falls back to the classic hat when an unlock is not earned (e.g. after a reset)', () => {
    expect(teamLooks(2, { name: '', color: 3, hat: 'halo' }, 0, true)[0]!.hat).toBe('square');
    expect(teamLooks(2, { name: '', color: 3, hat: 'halo' }, 90, true)[0]!.hat).toBe('halo');
    // Without the Full Version (e.g. refunded) the cosmetic hat falls back as well.
    expect(teamLooks(2, { name: '', color: 3, hat: 'halo' }, 90, false)[0]!.hat).toBe('square');
  });
});
