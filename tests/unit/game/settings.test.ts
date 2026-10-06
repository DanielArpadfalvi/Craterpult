import { describe, expect, it, vi } from 'vitest';
import {
  aimPreviewTicks,
  applySettings,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  sightLength,
  turnTicks,
  type SettingsTargets,
} from '../../../src/game/settings';

function targets() {
  return {
    setLanguage: vi.fn<SettingsTargets['setLanguage']>(),
    setSound: vi.fn<SettingsTargets['setSound']>(),
    setReducedMotion: vi.fn<SettingsTargets['setReducedMotion']>(),
    setLargeText: vi.fn<SettingsTargets['setLargeText']>(),
  };
}

describe('settings', () => {
  it('sanitizes stored settings field by field', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({
        language: 'de',
        sound: false,
        haptics: 'yes',
        turnTime: 50,
        reducedMotion: true,
        largeText: 1,
        aimPreview: 'long',
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      sound: false,
      reducedMotion: true,
      aimPreview: 'long',
    });
    expect(sanitizeSettings({ turnTime: 90, language: 'hu' })).toMatchObject({
      turnTime: 90,
      language: 'hu',
    });
  });

  it('applies everything on boot', () => {
    const tg = targets();
    applySettings({ ...DEFAULT_SETTINGS, sound: false, largeText: true }, tg);
    expect(tg.setLanguage).toHaveBeenCalledWith(null);
    expect(tg.setSound).toHaveBeenCalledWith(false);
    expect(tg.setReducedMotion).toHaveBeenCalledWith(false);
    expect(tg.setLargeText).toHaveBeenCalledWith(true);
  });

  it('applies only what changed', () => {
    const tg = targets();
    const prev = { ...DEFAULT_SETTINGS };
    applySettings({ ...prev, language: 'hu', haptics: false, turnTime: 90 }, tg, prev);
    expect(tg.setLanguage).toHaveBeenCalledWith('hu');
    expect(tg.setSound).not.toHaveBeenCalled();
    expect(tg.setReducedMotion).not.toHaveBeenCalled();
    expect(tg.setLargeText).not.toHaveBeenCalled();
    applySettings({ ...prev, reducedMotion: true }, tg, prev);
    expect(tg.setReducedMotion).toHaveBeenCalledWith(true);
  });

  it('derives turn ticks and the aim preview length', () => {
    expect(turnTicks({ turnTime: 30 })).toBe(1800);
    expect(turnTicks(DEFAULT_SETTINGS)).toBe(45 * 60);
    expect(aimPreviewTicks({ aimPreview: 'long' })).toBeGreaterThan(
      aimPreviewTicks({ aimPreview: 'short' }),
    );
    expect(sightLength({ aimPreview: 'long' }, 0)).toBeGreaterThan(
      sightLength({ aimPreview: 'short' }, 0),
    );
    expect(sightLength({ aimPreview: 'long' }, 90)).toBe(90);
  });
});
