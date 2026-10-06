import { describe, expect, it, vi } from 'vitest';
import { createPaywall, INITIAL_PAYWALL, type PaywallSlice } from '../../../src/game/paywall';
import { createStore } from '../../../src/game/store';
import { createMemoryStorage, MockPurchases, type Purchases } from '../../../src/platform';

async function setup(purchases?: Purchases) {
  const p = purchases ?? new MockPurchases(createMemoryStorage());
  await p.init();
  const store = createStore<PaywallSlice>({ fullVersion: false, paywall: INITIAL_PAYWALL });
  const feedback = { tap: vi.fn(), celebrate: vi.fn(), warn: vi.fn() };
  const setFullVersion = vi.fn((v: boolean) => store.set({ fullVersion: v }));
  const backs: (() => void)[] = [];
  const paywall = createPaywall({
    store,
    purchases: p,
    ready: Promise.resolve(),
    setFullVersion,
    onBack: (l) => {
      backs.push(l);
      return () => backs.splice(backs.indexOf(l), 1);
    },
    feedback,
  });
  p.onEntitlementChange((full) => paywall.entitlementChanged(full));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { p: p as MockPurchases, store, feedback, setFullVersion, paywall, flush, backs };
}

describe('paywall flow', () => {
  it('open shows the sheet with its reason and loads the store price', async () => {
    const { store, paywall, flush } = await setup();
    paywall.open('difficulty');
    expect(store.get().paywall).toMatchObject({ open: true, reason: 'difficulty', status: 'idle' });
    await flush();
    expect(store.get().paywall).toMatchObject({ product: 'ready', price: '$4.99' });
  });

  it('close hides the sheet; the back button closes it too', async () => {
    const { store, paywall, backs } = await setup();
    paywall.open(null);
    expect(backs).toHaveLength(1);
    paywall.close();
    expect(store.get().paywall.open).toBe(false);
    expect(backs).toHaveLength(0);
    paywall.open('daily');
    backs[0]?.();
    expect(store.get().paywall.open).toBe(false);
  });

  it('buy → success unlocks, celebrates and runs the pending unlock action once', async () => {
    const { store, paywall, feedback, setFullVersion } = await setup();
    const then = vi.fn();
    paywall.open('difficulty', then);
    await paywall.buy();
    expect(store.get().paywall).toMatchObject({ status: 'success', via: 'purchase', key: 1 });
    expect(store.get().fullVersion).toBe(true);
    expect(setFullVersion).toHaveBeenCalledWith(true);
    expect(feedback.celebrate).toHaveBeenCalledTimes(1);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it.each(['cancelled', 'pending', 'failed'] as const)(
    'buy → %s keeps the lock',
    async (outcome) => {
      const { p, store, paywall, feedback } = await setup();
      p.setNextOutcome(outcome);
      const then = vi.fn();
      paywall.open('campaign', then);
      await paywall.buy();
      expect(store.get().paywall.status).toBe(outcome);
      expect(store.get().fullVersion).toBe(false);
      expect(feedback.celebrate).not.toHaveBeenCalled();
      expect(feedback.warn).toHaveBeenCalledTimes(outcome === 'pending' ? 0 : 1);
      expect(then).not.toHaveBeenCalled();
    },
  );

  it('a pending purchase that clears later turns into success', async () => {
    const { p, store, paywall } = await setup();
    p.setNextOutcome('pending');
    paywall.open(null);
    await paywall.buy();
    expect(store.get().paywall.status).toBe('pending');
    await p.setFullVersion(true);
    expect(store.get().paywall.status).toBe('success');
  });

  it('shows the busy state while the store answers', async () => {
    const { p, store, paywall } = await setup();
    p.setLatency(20);
    paywall.open(null);
    const buying = paywall.buy();
    await new Promise((r) => setTimeout(r, 5));
    expect(store.get().paywall.status).toBe('buying');
    await buying;
    expect(store.get().paywall.status).toBe('success');
  });

  it('store unavailable → failed without calling purchase', async () => {
    const purchases: Purchases = {
      init: async () => undefined,
      getProducts: async () => {
        throw new Error('offline');
      },
      purchaseFullVersion: vi.fn(),
      restore: async () => false,
      isFullVersion: () => false,
      onEntitlementChange: () => () => undefined,
    };
    const { store, paywall } = await setup(purchases);
    paywall.open('daily');
    await paywall.buy();
    expect(store.get().paywall).toMatchObject({ status: 'failed', product: 'unavailable' });
    expect(purchases.purchaseFullVersion).not.toHaveBeenCalled();
  });

  it('restore: nothing → message; owned elsewhere → success', async () => {
    const { p, store, paywall } = await setup();
    paywall.open(null);
    await paywall.restore();
    expect(store.get().paywall).toMatchObject({ restore: 'nothing', status: 'idle' });
    await p.simulateOwnedElsewhere();
    await paywall.restore();
    expect(store.get().paywall).toMatchObject({
      restore: 'restored',
      status: 'success',
      via: 'restore',
    });
    expect(store.get().fullVersion).toBe(true);
  });

  it('restore failure is reported', async () => {
    const { p, store, paywall } = await setup();
    vi.spyOn(p, 'restore').mockRejectedValueOnce(new Error('store down'));
    paywall.open(null);
    await paywall.restore();
    expect(store.get().paywall.restore).toBe('failed');
  });

  it('buying when already owned shows the success screen without charging', async () => {
    const { p, store, paywall } = await setup();
    await p.setFullVersion(true);
    store.set({ fullVersion: true });
    const spy = vi.spyOn(p, 'purchaseFullVersion');
    paywall.open(null);
    await paywall.buy();
    expect(spy).not.toHaveBeenCalled();
    expect(store.get().paywall).toMatchObject({ status: 'success', via: 'restore' });
  });

  it('ignores a second buy while one is in flight', async () => {
    const { p, paywall } = await setup();
    const spy = vi.spyOn(p, 'purchaseFullVersion');
    paywall.open(null);
    await Promise.all([paywall.buy(), paywall.buy()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('closing drops the pending unlock action', async () => {
    const { paywall } = await setup();
    const then = vi.fn();
    paywall.open('teamSize', then);
    paywall.close();
    paywall.open(null);
    await paywall.buy();
    expect(then).not.toHaveBeenCalled();
  });
});
