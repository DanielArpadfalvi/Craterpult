import { ListenerSet } from './listeners';
import type { Unsubscribe } from './types';

export type PushPlatform = 'android' | 'ios';

export interface PushRegistration {
  token: string;
  platform: PushPlatform;
}

/**
 * "Your turn" notifications of online matches (M9). Natively @capacitor/push-notifications
 * (FCM on Android, APNs on iOS); it is only switched on by a build flag because Android
 * crashes on `register()` without a Firebase config (`android/app/google-services.json`).
 */
export interface Push {
  readonly available: boolean;
  /** Ask for permission and register; the device token, or null (denied / unavailable). */
  register(): Promise<PushRegistration | null>;
  /** A notification was tapped; `data` is its payload (e.g. `{ matchId }`). */
  onOpen(listener: (data: Record<string, string>) => void): Unsubscribe;
}

export function createNoPush(): Push {
  return {
    available: false,
    register: () => Promise.resolve(null),
    onOpen: () => () => undefined,
  };
}

/** The subset of the plugin used here (injectable for tests). */
export interface NativePushPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(
    event: 'registration' | 'registrationError' | 'pushNotificationActionPerformed',
    fn: (e: never) => void,
  ): Promise<unknown>;
}

const REGISTER_TIMEOUT_MS = 15_000;

export function createNativePush(
  platform: PushPlatform,
  load: () => Promise<NativePushPlugin> = async () =>
    (await import('@capacitor/push-notifications'))
      .PushNotifications as unknown as NativePushPlugin,
): Push {
  const opened = new ListenerSet<[Record<string, string>]>();
  /** A tap that launched the app before anyone listened. */
  let early: Record<string, string> | null = null;
  let plugin: Promise<NativePushPlugin> | null = null;
  let token: ((t: string | null) => void) | null = null;

  const get = (): Promise<NativePushPlugin> => {
    plugin ??= load().then(async (p) => {
      await p.addListener('registration', ((e: { value: string }) => token?.(e.value)) as never);
      await p.addListener('registrationError', (() => token?.(null)) as never);
      await p.addListener('pushNotificationActionPerformed', ((e: {
        notification?: { data?: Record<string, unknown> };
      }) => {
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.notification?.data ?? {}))
          if (typeof v === 'string') data[k] = v;
        if (opened.size > 0) opened.emit(data);
        else early = data;
      }) as never);
      return p;
    });
    return plugin;
  };
  // Attach the tap listener at startup so a launch from a notification is not missed.
  void get().catch(() => undefined);

  return {
    available: true,
    async register() {
      try {
        const p = await get();
        const perm = await p.requestPermissions();
        if (perm.receive !== 'granted') return null;
        const value = await new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), REGISTER_TIMEOUT_MS);
          token = (t) => {
            clearTimeout(timer);
            token = null;
            resolve(t);
          };
          p.register().catch(() => token?.(null));
        });
        return value ? { token: value, platform } : null;
      } catch {
        return null;
      }
    },
    onOpen(listener) {
      const off = opened.add(listener);
      if (early) {
        const data = early;
        early = null;
        listener(data);
      }
      return off;
    },
  };
}
