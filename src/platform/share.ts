/** Hands a short text (an online invite) to the system share sheet or the clipboard. */
export interface Share {
  share(text: string): Promise<'shared' | 'copied' | 'failed'>;
}

interface NavigatorLike {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

/**
 * Web Share where it exists (mobile browsers, iOS WKWebView), otherwise the clipboard (the
 * Android WebView has no Web Share). A cancelled share sheet counts as done, not as a failure.
 */
export function createShare(nav: NavigatorLike | undefined = globalThis.navigator): Share {
  return {
    async share(text) {
      if (nav?.share) {
        try {
          await nav.share({ text });
          return 'shared';
        } catch (e) {
          if ((e as { name?: string }).name === 'AbortError') return 'shared';
        }
      }
      try {
        if (!nav?.clipboard) return 'failed';
        await nav.clipboard.writeText(text);
        return 'copied';
      } catch {
        return 'failed';
      }
    },
  };
}
