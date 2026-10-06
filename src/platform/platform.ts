import { Capacitor } from '@capacitor/core';
import { createNativeHaptics, createWebHaptics, type Haptics } from './haptics';
import { createNativeLifecycle, createWebLifecycle } from './lifecycle';
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
}

export interface CreatePlatformOptions {
  /** Force native/web selection (defaults to `Capacitor.isNativePlatform()`). */
  native?: boolean;
  /** Replace individual services, e.g. with mocks in tests. */
  overrides?: Partial<Omit<Platform, 'native'>>;
}

/** Builds every platform service, choosing native or web implementations at runtime. */
export function createPlatform(options: CreatePlatformOptions = {}): Platform {
  const native = options.native ?? Capacitor.isNativePlatform();
  const o = options.overrides ?? {};
  return {
    native,
    storage: o.storage ?? (native ? createNativeStorage() : createWebStorage()),
    haptics: o.haptics ?? (native ? createNativeHaptics() : createWebHaptics()),
    lifecycle: o.lifecycle ?? (native ? createNativeLifecycle() : createWebLifecycle()),
    systemUi: o.systemUi ?? (native ? createNativeSystemUI() : createWebSystemUI()),
  };
}

let shared: Platform | null = null;

/** The app-wide platform instance (created on first use, so listeners are attached once). */
export function getPlatform(): Platform {
  shared ??= createPlatform();
  return shared;
}
