import { App } from '@capacitor/app';
import { ListenerSet } from './listeners';
import type { Lifecycle } from './types';

/**
 * Web lifecycle: `visibilitychange` maps to pause/resume (tab hidden, phone locked), the Escape
 * key acts as the back button. DOM listeners are attached on construction.
 */
export function createWebLifecycle(
  doc: Document | undefined = globalThis.document,
): Lifecycle & { dispose(): void } {
  const pause = new ListenerSet();
  const resume = new ListenerSet();
  const back = new ListenerSet();

  const onVisibility = (): void => {
    if (!doc) return;
    if (doc.visibilityState === 'hidden') pause.emit();
    else resume.emit();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (back.emitLast()) e.preventDefault();
  };

  doc?.addEventListener('visibilitychange', onVisibility);
  doc?.addEventListener('keydown', onKey);

  return {
    onPause: (l) => pause.add(l),
    onResume: (l) => resume.add(l),
    onBackButton: (l) => back.add(l),
    exitApp: () => undefined,
    minimizeApp: () => undefined,
    // Web builds take invite codes from the page URL (`?join=CODE`) instead.
    onAppUrl: () => () => undefined,
    dispose: () => {
      doc?.removeEventListener('visibilitychange', onVisibility);
      doc?.removeEventListener('keydown', onKey);
    },
  };
}

/**
 * Native lifecycle via @capacitor/app. Registering a `backButton` listener disables Android's
 * default behaviour, so with no handler subscribed we exit the app ourselves.
 */
export function createNativeLifecycle(): Lifecycle {
  const pause = new ListenerSet();
  const resume = new ListenerSet();
  const back = new ListenerSet();
  const urls = new ListenerSet<[string]>();
  let early: string | null = null;
  const openUrl = (url: string): void => {
    if (urls.size > 0) urls.emit(url);
    else early = url;
  };

  void App.addListener('pause', () => pause.emit());
  void App.addListener('appUrlOpen', (e) => openUrl(e.url));
  void App.getLaunchUrl()
    .then((r) => r?.url && openUrl(r.url))
    .catch(() => undefined);
  void App.addListener('resume', () => resume.emit());
  void App.addListener('backButton', () => {
    if (!back.emitLast()) void App.exitApp();
  });

  return {
    onPause: (l) => pause.add(l),
    onResume: (l) => resume.add(l),
    onBackButton: (l) => back.add(l),
    exitApp: () => void App.exitApp(),
    // Android only; the iOS plugin rejects (there is no back button there anyway).
    minimizeApp: () => void App.minimizeApp().catch(() => undefined),
    onAppUrl(l) {
      const off = urls.add(l);
      if (early) {
        const url = early;
        early = null;
        l(url);
      }
      return off;
    },
  };
}
