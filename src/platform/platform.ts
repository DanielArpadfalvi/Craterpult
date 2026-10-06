import { Capacitor } from '@capacitor/core';
import { createNativeHaptics, createWebHaptics, type Haptics } from './haptics';
import { createNativeLifecycle, createWebLifecycle } from './lifecycle';
import type { Purchases } from './purchases';
import { revenueCatApiKey } from './purchasesRevenueCat';
import { selectPurchases } from './purchasesSelect';
import { createNativeStorage, createWebStorage } from './storage';
import { createNativeSystemUI, createWebSystemUI } from './systemUi';
import type { Lifecycle, Storage, SystemUI } from './types';

export interface Platform {
  /** True when running inside the Capacitor iOS/Android shell. */
  readonly native: boolean;
  readonly storage: Storage;
  readonly haptics: Haptics;
  readonly lifecycle: Lifecycle;
  readonly systemUi: SystemUI;
  /** Full Version in-app purchase (RevenueCat on device, persisted mock on web). */
  readonly purchases: Purchases;
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
    purchases,
  };
}

let shared: Platform | null = null;

/** The app-wide platform instance (created on first use, so listeners are attached once). */
export function getPlatform(): Platform {
  shared ??= createPlatform();
  return shared;
}
