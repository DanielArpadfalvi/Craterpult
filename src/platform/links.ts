import type { ExternalLinks } from './types';

type OpenFn = (url: string, target: string, features: string) => unknown;

/**
 * External links via `window.open`. On the web this is a new tab; inside the Capacitor shell the
 * WebView hands non-app URLs to the system browser (Android: the bridge's external intent, iOS:
 * the `createWebViewWith` delegate), so no extra native plugin is needed.
 */
export function createExternalLinks(
  open: OpenFn | undefined = globalThis.open?.bind(globalThis),
): ExternalLinks {
  return {
    open: (url) => {
      if (!/^https:\/\//.test(url)) return;
      open?.(url, '_blank', 'noopener,noreferrer');
    },
  };
}
