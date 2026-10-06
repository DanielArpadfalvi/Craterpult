import { Haptics as CapHaptics, ImpactStyle } from '@capacitor/haptics';

/** Haptic feedback behind an interface: Vibration API on the web, Capacitor Haptics natively. */
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

const IMPACT_STYLE: Record<HapticStrength, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/** Minimal slice of the Capacitor Haptics plugin we use (injectable for tests). */
export interface NativeHapticsPlugin {
  impact(options: { style: ImpactStyle }): Promise<void>;
}

/** iOS Taptic Engine / Android vibrator via @capacitor/haptics. Fire-and-forget. */
export function createNativeHaptics(plugin: NativeHapticsPlugin = CapHaptics): Haptics {
  return {
    impact(strength) {
      try {
        plugin.impact({ style: IMPACT_STYLE[strength] }).catch(() => undefined);
      } catch {
        // Haptics are best-effort only.
      }
    },
  };
}
