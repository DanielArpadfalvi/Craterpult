import { describe, expect, it } from 'vitest';
import { sanitizeParams } from '../../../src/core/online';
import { createOnline } from '../../../src/game/online';
import { INITIAL_UI } from '../../../src/game/state';
import { createStore } from '../../../src/game/store';
import { MockOnline, type KeyValue } from '../../../src/net/mock';
import { createMemoryStorage } from '../../../src/platform/storage';

function kv(): KeyValue {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** One phone: the online controller on its own store and storage, recording stats calls. */
function phone(db: KeyValue) {
  const results: boolean[] = [];
  const service = new MockOnline({ db, identity: kv() });
  const c = createOnline({
    store: createStore({ ...INITIAL_UI }),
    service,
    storage: createMemoryStorage(),
    playerName: () => 'P',
    seed: () => 'seed',
    play: () => undefined,
    share: () => Promise.resolve('copied'),
    toast: () => undefined,
    recordResult: (won) => results.push(won),
    t: (k) => k,
  });
  return { c, service, results };
}

describe('online controller stats', () => {
  it('counts a match that ended by resignation once, for both players, without opening it', async () => {
    const db = kv();
    const a = phone(db);
    const b = phone(db);
    const m = await a.service.createMatch(
      sanitizeParams({ seed: 's', teamSize: 2, style: 'hills', turnSeconds: 30 }),
      'A',
    );
    await b.service.joinMatch(m.code, 'B');
    await b.c.actions.onlineRefresh();
    await flush();
    expect(b.results).toEqual([]);

    await b.service.resign(m.id);
    await a.c.actions.onlineRefresh();
    await b.c.actions.onlineRefresh();
    await flush();
    expect(a.results).toEqual([true]);
    expect(b.results).toEqual([false]);

    // Seen again (list refresh, the match watched to its end): not counted twice.
    await a.c.actions.onlineRefresh();
    await flush();
    expect(await a.c.firstFinish(m.id)).toBe(false);
    expect(a.results).toEqual([true]);
  });
});
