import { Capacitor } from '@capacitor/core';
import { createNativeHaptics, createWebHaptics, type Haptics } from './haptics';
import { createNativeLifecycle, createWebLifecycle } from './lifecycle';
import { createExternalLinks } from './links';
import { createNativePush, createNoPush, type Push } from './push';
import { createShare, type Share } from './share';
import type { Purchases } from './purchases';
import { revenueCatApiKey } from './purchasesRevenueCat';
import { selectPurchases } from './purchasesSelect';
import { createNativeStorage, createWebStorage } from './storage';
import { createNativeSystemUI, createWebSystemUI } from './systemUi';
import type { ExternalLinks, Lifecycle, Storage, SystemUI } from './types';

export interface Platform {
  /** True when running inside the Capacitor iOS/Android shell. */
  readonly native: boolean;
  readonly storage: Storage;
  readonly haptics: Haptics;
  readonly lifecycle: Lifecycle;
  readonly systemUi: SystemUI;
  /** Opens the privacy policy / support pages in the browser. */
  readonly links: ExternalLinks;
  /** Full Version in-app purchase (RevenueCat on device, persisted mock on web). */
  readonly purchases: Purchases;
  /** Online "your turn" notifications (native builds with `VITE_PUSH_ENABLED=1` only). */
  readonly push: Push;
  /** Share sheet / clipboard for online invites. */
  readonly share: Share;
}

export interface CreatePlatformOptions {
  /** Force native/web selection (defaults to `Capacitor.isNativePlatform()`). */
  native?: boolean;
  /** RevenueCat public SDK key (defaults to the build-time key of the native platform). */
  revenueCatApiKey?: string;
  /** Replace individual services, e.g. with mocks in tests. */
  overrides?: Partial<Omit<Platform, 'native'>>;
}

/** Builds every platform service, choosing native or web implementations at runtime. */
export function createPlatform(options: CreatePlatformOptions = {}): Platform {
  const native = options.native ?? Capacitor.isNativePlatform();
  const o = options.overrides ?? {};
  const storage = o.storage ?? (native ? createNativeStorage() : createWebStorage());
  // Real store purchases on iOS/Android when a RevenueCat key was baked into the build, an
  // "unavailable" store on native without one (never the mock: it would unlock for free), and
  // the persisted mock on web / dev / tests.
  const purchases =
    o.purchases ??
    selectPurchases({
      native,
      apiKey: native
        ? (options.revenueCatApiKey ?? revenueCatApiKey(Capacitor.getPlatform()))
        : undefined,
      storage,
    });
  return {
    native,
    storage,
    haptics: o.haptics ?? (native ? createNativeHaptics() : createWebHaptics()),
    lifecycle: o.lifecycle ?? (native ? createNativeLifecycle() : createWebLifecycle()),
    systemUi: o.systemUi ?? (native ? createNativeSystemUI() : createWebSystemUI()),
    links: o.links ?? createExternalLinks(),
    purchases,
    push:
      o.push ??
      (native && pushEnabled()
        ? createNativePush(Capacitor.getPlatform() === 'ios' ? 'ios' : 'android')
        : createNoPush()),
    share: o.share ?? createShare(),
  };
}

/** Push needs a Firebase / APNs setup, so builds opt in (see docs/ONLINE.md). */
function pushEnabled(): boolean {
  return (import.meta.env as Record<string, string | undefined>).VITE_PUSH_ENABLED === '1';
}

let shared: Platform | null = null;

/** The app-wide platform instance (created on first use, so listeners are attached once). */
export function getPlatform(): Platform {
  shared ??= createPlatform();
  return shared;
}
