import type { Purchases, Unsubscribe } from '../platform';
import type { PaywallReason } from './entitlement';
import { PRIVACY_URL, TERMS_URL } from './links';
import type { Store } from './store';

/** Terms of Use / Privacy Policy links shown in the Full Version sheet (store requirement). */
export const LEGAL_URLS = { terms: TERMS_URL, privacy: PRIVACY_URL } as const;

/** Purchase flow state of the Full Version sheet. */
export type PaywallStatus = 'idle' | 'buying' | 'success' | 'pending' | 'failed' | 'cancelled';
export type RestoreStatus = 'idle' | 'busy' | 'restored' | 'nothing' | 'failed';

export interface PaywallState {
  /** The sheet is shown. */
  open: boolean;
  /** What opened it (context line); null = the menu button. */
  reason: PaywallReason | null;
  /** Store product: price loading, loaded (`price` set) or unavailable (offline, no store). */
  product: 'loading' | 'ready' | 'unavailable';
  /** Localised price string from the store, e.g. "$4.99" / "1 990 Ft". */
  price: string | null;
  status: PaywallStatus;
  /** How `success` was reached (thank-you vs welcome-back copy). */
  via: 'purchase' | 'restore' | null;
  /** Increments on every success (restarts the celebration). */
  key: number;
  restore: RestoreStatus;
}

export const INITIAL_PAYWALL: PaywallState = {
  open: false,
  reason: null,
  product: 'loading',
  price: null,
  status: 'idle',
  via: null,
  key: 0,
  restore: 'idle',
};

/** The part of the UI state the purchase flow reads and writes. */
export interface PaywallSlice {
  fullVersion: boolean;
  paywall: PaywallState;
}

/** Sound / haptic hooks of the purchase flow. */
export interface PaywallFeedback {
  tap(): void;
  /** Purchase or restore succeeded. */
  celebrate(): void;
  /** Failure / cancel. */
  warn(): void;
}

export interface PaywallHost {
  store: Store<PaywallSlice>;
  purchases: Purchases;
  /** Resolves when `purchases.init()` has settled. */
  ready: Promise<unknown>;
  /** Publish the entitlement (the app also re-checks locked selections). */
  setFullVersion(value: boolean): void;
  /** Back button / Escape while the sheet is open (defaults to none). */
  onBack?(listener: () => void): Unsubscribe;
  feedback: PaywallFeedback;
}

export interface Paywall {
  /** Show the sheet; `onUnlock` runs once if the Full Version is unlocked while it is open. */
  open(reason: PaywallReason | null, onUnlock?: () => void): void;
  close(): void;
  buy(): Promise<void>;
  restore(): Promise<void>;
  /** Entitlement changed outside the sheet's own calls (store listener, deferred purchase). */
  entitlementChanged(full: boolean): void;
  /** Load the store price in the background (menu button). */
  prefetch(): void;
}

/**
 * Full Version purchase flow (mirrors Swaplight): loads the store price, runs purchase / restore
 * and publishes every state (`buying`, `pending`, `failed`, `cancelled`, `success`) to the store.
 */
export function createPaywall(host: PaywallHost): Paywall {
  const { store, purchases } = host;
  const pw = (): PaywallState => store.get().paywall;
  const patch = (p: Partial<PaywallState>): void => store.set({ paywall: { ...pw(), ...p } });

  let onUnlock: (() => void) | null = null;
  let unBack: Unsubscribe | null = null;

  let loading: Promise<void> | null = null;
  const loadProduct = (): Promise<void> => {
    if (pw().product === 'ready') return Promise.resolve();
    loading ??= (async () => {
      patch({ product: 'loading' });
      try {
        await host.ready;
        const [product] = await purchases.getProducts();
        if (product) patch({ product: 'ready', price: product.priceString });
        else patch({ product: 'unavailable' });
      } catch {
        patch({ product: 'unavailable' });
      } finally {
        loading = null;
      }
    })();
    return loading;
  };

  const succeed = (via: 'purchase' | 'restore'): void => {
    host.setFullVersion(true);
    patch({ status: 'success', via, key: pw().key + 1 });
    host.feedback.celebrate();
    const run = onUnlock;
    onUnlock = null;
    run?.();
  };

  const paywall: Paywall = {
    open(reason, then) {
      const busy = pw().status === 'buying';
      onUnlock = then ?? null;
      patch({ open: true, reason, status: busy ? 'buying' : 'idle', via: null, restore: 'idle' });
      unBack ??= host.onBack?.(() => paywall.close()) ?? null;
      void loadProduct();
    },

    close() {
      onUnlock = null;
      unBack?.();
      unBack = null;
      if (!pw().open) return;
      const busy = pw().status === 'buying';
      patch({ open: false, status: busy ? 'buying' : 'idle', via: null });
    },

    async buy() {
      const s = store.get();
      if (s.paywall.status === 'buying' || s.paywall.restore === 'busy') return;
      host.feedback.tap();
      if (s.fullVersion) {
        succeed('restore');
        return;
      }
      patch({ status: 'buying', restore: 'idle' });
      await loadProduct();
      if (pw().product !== 'ready') {
        patch({ status: 'failed' });
        host.feedback.warn();
        return;
      }
      let outcome: 'purchased' | 'cancelled' | 'pending' | 'failed';
      try {
        const result = await purchases.purchaseFullVersion();
        outcome =
          result.outcome === 'purchased' && !result.fullVersion ? 'pending' : result.outcome;
      } catch {
        outcome = 'failed';
      }
      if (outcome === 'purchased') {
        succeed('purchase');
      } else {
        // An entitlement listener may already have turned a pending purchase into a success.
        if (pw().status === 'success') return;
        patch({ status: outcome });
        if (outcome !== 'pending') host.feedback.warn();
      }
    },

    async restore() {
      if (pw().restore === 'busy' || pw().status === 'buying') return;
      host.feedback.tap();
      // The restore result replaces an earlier purchase note in the sheet.
      patch({ restore: 'busy', ...(pw().status !== 'idle' ? { status: 'idle' as const } : {}) });
      try {
        await host.ready;
        const full = await purchases.restore();
        host.setFullVersion(full);
        patch({ restore: full ? 'restored' : 'nothing' });
        if (full && pw().open) succeed('restore');
      } catch {
        patch({ restore: 'failed' });
        if (pw().open) host.feedback.warn();
      }
    },

    prefetch() {
      void loadProduct();
    },

    entitlementChanged(full) {
      const status = pw().status;
      if (full && pw().open && (status === 'idle' || status === 'pending')) succeed('purchase');
    },
  };
  return paywall;
}
