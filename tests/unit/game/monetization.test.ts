// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../../src/audio/engine';
import type { GameActions } from '../../../src/game/app';
import { createMonetization } from '../../../src/game/monetization';
import { INITIAL_UI, type UiState } from '../../../src/game/state';
import { createStore } from '../../../src/game/store';
import { createMemoryStorage, createPlatform, MockPurchases } from '../../../src/platform';

function fakeActions(): GameActions {
  return new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      target[key] ??= vi.fn();
      return target[key];
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as GameActions;
}

async function setup(owned = false) {
  const storage = createMemoryStorage();
  const purchases = new MockPurchases(storage);
  if (owned) await purchases.setFullVersion(true);
  const platform = createPlatform({ native: false, overrides: { storage, purchases } });
  const store = createStore<UiState>({ ...INITIAL_UI });
  const audio = { play: vi.fn() } as unknown as AudioEngine;
  const shop = createMonetization({ store, platform, audio });
  const actions = fakeActions();
  const orig = {
    setDifficulty: actions.setDifficulty,
    setTeamSize: actions.setTeamSize,
    setMapStyle: actions.setMapStyle,
    startDaily: actions.startDaily,
    startMission: actions.startMission,
    startBotMatch: actions.startBotMatch,
    selectChapter: actions.selectChapter,
  };
  shop.gate(actions);
  await shop.testSetup(new URLSearchParams());
  return { store, shop, actions, orig, purchases };
}

describe('monetization gating', () => {
  it('free: locked picks open the paywall instead of applying', async () => {
    const { store, actions, orig } = await setup();
    expect(store.get().fullVersion).toBe(false);
    actions.setDifficulty(4);
    expect(orig.setDifficulty).not.toHaveBeenCalled();
    expect(store.get().paywall).toMatchObject({ open: true, reason: 'difficulty' });
    actions.setDifficulty(2);
    expect(orig.setDifficulty).toHaveBeenCalledWith(2);

    actions.setTeamSize(4);
    expect(orig.setTeamSize).not.toHaveBeenCalled();
    actions.setMapStyle('towers');
    expect(orig.setMapStyle).not.toHaveBeenCalled();
    actions.setMapStyle('islands');
    expect(orig.setMapStyle).toHaveBeenCalledWith('islands');

    actions.startDaily();
    expect(orig.startDaily).not.toHaveBeenCalled();
    expect(store.get().paywall.reason).toBe('daily');

    actions.startMission('c2-01');
    expect(orig.startMission).not.toHaveBeenCalled();
    actions.startMission('c1-01');
    expect(orig.startMission).toHaveBeenCalledWith('c1-01');

    actions.selectChapter(3);
    expect(orig.selectChapter).toHaveBeenCalledWith(3);
    expect(store.get().paywall.reason).toBe('campaign');
  });

  it('buying applies the pick that opened the sheet', async () => {
    const { store, actions, orig, shop } = await setup();
    actions.setDifficulty(5);
    await shop.paywall.buy();
    expect(store.get().fullVersion).toBe(true);
    expect(orig.setDifficulty).toHaveBeenCalledWith(5);
    actions.setTeamSize(4);
    expect(orig.setTeamSize).toHaveBeenCalledWith(4);
  });

  it('a quick match never starts with locked options', async () => {
    const { store, actions, orig } = await setup();
    store.set({ teamSize: 4, mapStyle: 'cavern' });
    actions.startBotMatch(5, 'seed');
    expect(orig.startBotMatch).toHaveBeenCalledWith(2, 'seed');
    expect(store.get()).toMatchObject({ teamSize: 3, mapStyle: 'random' });
  });

  it('owned: everything passes through; losing the entitlement resets locked picks', async () => {
    const { store, actions, orig, purchases } = await setup(true);
    expect(store.get().fullVersion).toBe(true);
    actions.setDifficulty(5);
    expect(orig.setDifficulty).toHaveBeenCalledWith(5);
    actions.startDaily();
    expect(orig.startDaily).toHaveBeenCalled();
    store.set({ difficulty: 5, teamSize: 4, mapStyle: 'flats' });
    await purchases.setFullVersion(false);
    expect(store.get()).toMatchObject({
      fullVersion: false,
      difficulty: 2,
      teamSize: 3,
      mapStyle: 'random',
    });
  });
});
