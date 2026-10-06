export * from './types';
export { createMemoryStorage, createWebStorage, createNativeStorage } from './storage';
export type { WebStorageBackend } from './storage';
export { createWebHaptics, createNativeHaptics } from './haptics';
export type { HapticStrength, Haptics, NativeHapticsPlugin } from './haptics';
export { createWebLifecycle, createNativeLifecycle } from './lifecycle';
export { createWebSystemUI, createNativeSystemUI } from './systemUi';
export { createPlatform, getPlatform } from './platform';
export type { CreatePlatformOptions, Platform } from './platform';
