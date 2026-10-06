// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMemoryStorage,
  createWebStorage,
  type WebStorageBackend,
} from '../../../src/platform';

describe('createMemoryStorage', () => {
  it('round-trips JSON values and removes them', async () => {
    const s = createMemoryStorage();
    expect(await s.get('missing')).toBeUndefined();
    await s.set('obj', { a: 1, b: [true, null, 'x'] });
    expect(await s.get('obj')).toEqual({ a: 1, b: [true, null, 'x'] });
    await s.remove('obj');
    expect(await s.get('obj')).toBeUndefined();
  });

  it('stores copies, not references', async () => {
    const s = createMemoryStorage();
    const value = { n: 1 };
    await s.set('k', value);
    value.n = 2;
    expect(await s.get('k')).toEqual({ n: 1 });
  });
});

describe('createWebStorage', () => {
  beforeEach(() => localStorage.clear());

  it('persists to localStorage with the craterpult: prefix', async () => {
    const s = createWebStorage();
    await s.set('settings', { muted: true });
    expect(localStorage.getItem('craterpult:settings')).toBe('{"muted":true}');
    expect(await createWebStorage().get('settings')).toEqual({ muted: true });
    await s.remove('settings');
    expect(localStorage.getItem('craterpult:settings')).toBeNull();
  });

  it('returns undefined for corrupt JSON', async () => {
    localStorage.setItem('craterpult:bad', '{not json');
    expect(await createWebStorage().get('bad')).toBeUndefined();
  });

  it('falls back to memory when the backend is missing', async () => {
    const s = createWebStorage(undefined);
    await s.set('k', 42);
    expect(await s.get('k')).toBe(42);
  });

  it('falls back to memory when the backend throws', async () => {
    const throwing: WebStorageBackend = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const s = createWebStorage(throwing);
    await s.set('k', 'v');
    expect(await s.get('k')).toBe('v');
    await s.remove('k');
    expect(await s.get('k')).toBeUndefined();
  });
});
