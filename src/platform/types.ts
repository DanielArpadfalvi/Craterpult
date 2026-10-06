/** Call to remove a previously registered listener. Safe to call more than once. */
export type Unsubscribe = () => void;

/** JSON-serialisable value accepted by {@link Storage}. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Async key-value store for JSON values (settings, saves, stats). localStorage on the web,
 * Capacitor Preferences on iOS/Android (survives WebView data clears and app updates).
 */
export interface Storage {
  /** Returns the stored value, or `undefined` if missing or unreadable. */
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * App lifecycle events. On the web `visibilitychange` drives pause/resume; natively the
 * Capacitor App plugin's `pause`/`resume`. Back-button handlers form a stack: only the most
 * recently registered (still subscribed) handler is invoked.
 */
export interface Lifecycle {
  onPause(listener: () => void): Unsubscribe;
  onResume(listener: () => void): Unsubscribe;
  onBackButton(listener: () => void): Unsubscribe;
  /** Close the app (Android back on the main menu). No-op on the web. */
  exitApp(): void;
}

/** `dark` = dark app background, i.e. light status bar content. */
export type StatusBarStyle = 'dark' | 'light';

export interface SystemUI {
  /** Status bar over the WebView (edge-to-edge) with the given content style. */
  setupStatusBar(style: StatusBarStyle): Promise<void>;
  hideStatusBar(): Promise<void>;
  showStatusBar(): Promise<void>;
  hideSplash(): Promise<void>;
}
