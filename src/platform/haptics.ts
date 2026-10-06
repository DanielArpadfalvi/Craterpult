/** Haptic feedback behind an interface (Capacitor implementation arrives with the mobile shell). */
export type HapticStrength = 'light' | 'medium' | 'heavy';

export interface Haptics {
  impact(strength: HapticStrength): void;
}

const MS: Record<HapticStrength, number> = { light: 8, medium: 18, heavy: 35 };

/** Web fallback: the Vibration API where available (Android browsers). */
export function createWebHaptics(): Haptics {
  return {
    impact(strength) {
      try {
        globalThis.navigator?.vibrate?.(MS[strength]);
      } catch {
        // Vibration blocked: ignore.
      }
    },
  };
}
