import type { AudioEngine } from '../audio/engine';
import { missionById } from '../core/campaign';
import { MockPurchases, type Platform, type PurchaseOutcome } from '../platform';
import {
  allowedQuickOptions,
  chapterNeedsFull,
  dailyNeedsFull,
  difficultyNeedsFull,
  mapStyleNeedsFull,
  onlineCreateNeedsFull,
  type PaywallReason,
  teamSizeNeedsFull,
} from './entitlement';
import { createPaywall, type Paywall } from './paywall';
import { hatNeedsFull, hatUnlocked } from './profile';
import { totalStars } from './progress';
import type { GameActions } from './app';
import type { UiState } from './state';
import type { Store } from './store';

/** UI actions of the Full Version sheet (merged into `GameActions`). */
export interface MonetizationActions {
  /** Show the Full Version sheet (`null` reason = the menu button). */
  openPaywall(reason: PaywallReason | null): void;
  closePaywall(): void;
  buyFullVersion(): void;
  restorePurchases(): void;
}

/** `window.__craterpult.purchases` (web mock store only). */
export interface PurchasesTestApi {
  /** Outcome of the next purchase (then back to `purchased`). */
  setNextOutcome(outcome: PurchaseOutcome): void;
  setLatency(ms: number): void;
  /** The store knows a purchase this install has not seen yet (for the restore flow). */
  ownedElsewhere(): Promise<void>;
  setFullVersion(value: boolean): Promise<void>;
}

export interface Monetization {
  paywall: Paywall;
  actions: MonetizationActions;
  /** Route Full Version items of the game actions through the paywall (mutates `actions`). */
  gate(actions: GameActions): void;
  /**
   * Test mode: wait for the store, apply `?full` (owned from the start), and return the mock
   * store hooks (null on a real store).
   */
  testSetup(params: URLSearchParams): Promise<PurchasesTestApi | null>;
}

interface Deps {
  store: Store<UiState>;
  platform: Platform;
  audio: AudioEngine;
}

/** Wires the store, the paywall flow and the gating of locked items (T7.2). */
export function createMonetization({ store, platform, audio }: Deps): Monetization {
  const purchases = platform.purchases;
  const full = (): boolean => store.get().fullVersion;

  function setFullVersion(value: boolean): void {
    const s = store.get();
    // Losing the entitlement (refund) drops Full Version picks back to free ones.
    const opts = allowedQuickOptions(value, {
      difficulty: s.difficulty,
      teamSize: s.teamSize,
      mapStyle: s.mapStyle,
    });
    store.set({ fullVersion: value, ...opts });
  }

  const ready = purchases
    .init()
    .then(() => setFullVersion(purchases.isFullVersion()))
    .catch(() => undefined);

  const paywall = createPaywall({
    store,
    purchases,
    ready,
    setFullVersion,
    onBack: (l) => platform.lifecycle.onBackButton(l),
    feedback: {
      tap: () => audio.play('tap'),
      celebrate() {
        audio.play('win', 0.6);
        if (store.get().save.settings.haptics) platform.haptics.impact('heavy');
      },
      warn() {
        if (store.get().save.settings.haptics) platform.haptics.impact('light');
      },
    },
  });

  purchases.onEntitlementChange((value) => {
    setFullVersion(value);
    paywall.entitlementChanged(value);
  });
  void ready.then(() => {
    if (!full()) paywall.prefetch();
  });

  const actions: MonetizationActions = {
    openPaywall: (reason) => paywall.open(reason),
    closePaywall: () => paywall.close(),
    buyFullVersion: () => void paywall.buy(),
    restorePurchases: () => void paywall.restore(),
  };

  function gate(a: GameActions): void {
    const {
      setDifficulty,
      setTeamSize,
      setMapStyle,
      startBotMatch,
      openCampaign,
      selectChapter,
      openMission,
      startMission,
      nextMission,
      startDaily,
      updateProfile,
      onlineCreate,
    } = a;
    /** Run `fn` now, or after unlocking when `locked` (the sheet opens with `reason`). */
    const guarded = (locked: boolean, reason: PaywallReason, fn: () => void): void => {
      if (locked && !full()) paywall.open(reason, fn);
      else fn();
    };
    const missionLocked = (id: string | null): boolean => {
      const m = id ? missionById(id) : undefined;
      return !!m && chapterNeedsFull(m.chapter) && !full();
    };

    a.setDifficulty = (d) => guarded(difficultyNeedsFull(d), 'difficulty', () => setDifficulty(d));
    a.setTeamSize = (n) => guarded(teamSizeNeedsFull(n), 'teamSize', () => setTeamSize(n));
    a.setMapStyle = (m) => guarded(mapStyleNeedsFull(m), 'mapStyle', () => setMapStyle(m));
    a.startBotMatch = (d, seed) => {
      const s = store.get();
      const o = allowedQuickOptions(full(), {
        difficulty: d,
        teamSize: s.teamSize,
        mapStyle: s.mapStyle,
      });
      store.set({ teamSize: o.teamSize, mapStyle: o.mapStyle });
      startBotMatch(o.difficulty, seed);
    };
    a.openCampaign = () => {
      openCampaign();
      if (chapterNeedsFull(store.get().chapter) && !full()) store.set({ chapter: 1 });
    };
    a.selectChapter = (c) => {
      selectChapter(c);
      if (chapterNeedsFull(c) && !full()) paywall.open('campaign');
    };
    a.openMission = (id) => {
      if (missionLocked(id)) paywall.open('campaign', () => openMission(id));
      else openMission(id);
    };
    a.startMission = (id) => {
      if (missionLocked(id)) paywall.open('campaign');
      else startMission(id);
    };
    a.nextMission = () => {
      nextMission();
      const intro = store.get().missionIntro;
      if (missionLocked(intro)) {
        store.set({ missionIntro: null });
        paywall.open('campaign', () => store.set({ missionIntro: intro }));
      }
    };
    a.updateProfile = (patch) => {
      const hat = patch.hat;
      if (hat === undefined || !hatNeedsFull(hat) || full()) {
        updateProfile(patch);
        return;
      }
      // After the purchase the hat is worn only if the campaign stars have earned it, too.
      paywall.open('hats', () => {
        if (hatUnlocked(hat, totalStars(store.get().save), full())) updateProfile(patch);
      });
    };
    a.startDaily = () => {
      if (dailyNeedsFull() && !full()) paywall.open('daily');
      else startDaily();
    };
    // Creating an online match needs the Full Version; joining a friend's invite stays free.
    a.onlineCreate = async () => {
      if (onlineCreateNeedsFull() && !full()) paywall.open('online', () => void onlineCreate());
      else await onlineCreate();
    };
  }

  async function testSetup(params: URLSearchParams): Promise<PurchasesTestApi | null> {
    await ready;
    if (!(purchases instanceof MockPurchases)) return null;
    const mock = purchases;
    if (params.has('full')) await mock.setFullVersion(true);
    return {
      setNextOutcome: (outcome) => mock.setNextOutcome(outcome),
      setLatency: (ms) => mock.setLatency(ms),
      ownedElsewhere: () => mock.simulateOwnedElsewhere(),
      setFullVersion: (value) => mock.setFullVersion(value),
    };
  }

  return { paywall, actions, gate, testSetup };
}
