import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { StatusBarStyle, SystemUI } from './types';

async function safely(op: () => Promise<void>): Promise<void> {
  try {
    await op();
  } catch {
    // Not every plugin call is supported on every OS version; ignore.
  }
}

export function createWebSystemUI(): SystemUI {
  const noop = async (): Promise<void> => undefined;
  return { setupStatusBar: noop, hideStatusBar: noop, showStatusBar: noop, hideSplash: noop };
}

export function createNativeSystemUI(): SystemUI {
  return {
    async setupStatusBar(style: StatusBarStyle) {
      // Edge-to-edge: the game draws under the status bar; the UI pads with env(safe-area-*).
      await safely(() => StatusBar.setOverlaysWebView({ overlay: true }));
      await safely(() =>
        StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light }),
      );
    },
    hideStatusBar: () => safely(() => StatusBar.hide()),
    showStatusBar: () => safely(() => StatusBar.show()),
    hideSplash: () => safely(() => SplashScreen.hide()),
  };
}
