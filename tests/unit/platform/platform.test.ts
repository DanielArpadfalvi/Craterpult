// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryStorage,
  createNativeHaptics,
  createPlatform,
  createWebHaptics,
  getPlatform,
} from '../../../src/platform';

describe('createPlatform', () => {
  it('detects the web platform by default', () => {
    expect(createPlatform().native).toBe(false);
  });

  it('web system UI calls resolve as no-ops', async () => {
    const { systemUi } = createPlatform({ native: false });
    await expect(systemUi.setupStatusBar('dark')).resolves.toBeUndefined();
    await expect(systemUi.hideStatusBar()).resolves.toBeUndefined();
    await expect(systemUi.showStatusBar()).resolves.toBeUndefined();
    await expect(systemUi.hideSplash()).resolves.toBeUndefined();
  });

  it('accepts injected services', () => {
    const storage = createMemoryStorage();
    const haptics = { impact: vi.fn() };
    const p = createPlatform({ native: false, overrides: { storage, haptics } });
    expect(p.storage).toBe(storage);
    p.haptics.impact('heavy');
    expect(haptics.impact).toHaveBeenCalledWith('heavy');
  });

  it('getPlatform returns one shared instance', () => {
    expect(getPlatform()).toBe(getPlatform());
  });
});

describe('haptics', () => {
  it('web haptics vibrate with a strength-dependent duration', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const h = createWebHaptics();
    h.impact('light');
    h.impact('heavy');
    expect(vibrate).toHaveBeenCalledTimes(2);
    const [[light], [heavy]] = vibrate.mock.calls as unknown as [[number], [number]];
    expect(heavy).toBeGreaterThan(light);
  });

  it('native haptics map strengths to Capacitor impact styles', () => {
    const impact = vi.fn(async () => undefined);
    const h = createNativeHaptics({ impact });
    h.impact('light');
    h.impact('medium');
    h.impact('heavy');
    // ImpactStyle enum values (tests may not import @capacitor/* directly).
    const styles = impact.mock.calls.map((c) => (c as unknown as [{ style: string }])[0].style);
    expect(styles).toEqual(['LIGHT', 'MEDIUM', 'HEAVY']);
  });

  it('native haptics swallow plugin failures', async () => {
    const h = createNativeHaptics({
      impact: () => Promise.reject(new Error('unavailable')),
    });
    expect(() => h.impact('medium')).not.toThrow();
    const sync = createNativeHaptics({
      impact: () => {
        throw new Error('not implemented');
      },
    });
    expect(() => sync.impact('medium')).not.toThrow();
    await Promise.resolve();
  });
});
