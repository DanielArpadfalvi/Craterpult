import { describe, expect, it } from 'vitest';
import {
  createDefaultSave,
  getSave,
  loadSave,
  onSaveChange,
  parseSave,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  updateSave,
  type KeyValueStorage,
} from '../../../src/game/save';

function memory(
  init: Record<string, string> = {},
): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('save', () => {
  it('starts fresh, writes through and reloads', () => {
    const st = memory();
    expect(loadSave(st)).toEqual(createDefaultSave());
    let seen = 0;
    const off = onSaveChange(() => seen++);
    updateSave((d) => {
      d.campaign.stars['c1-01'] = 2;
    });
    off();
    expect(seen).toBe(1);
    const stored = JSON.parse(st.data[SAVE_KEY]!);
    expect(stored.version).toBe(SAVE_VERSION);
    expect(loadSave(st).campaign.stars['c1-01']).toBe(2);
    expect(getSave().campaign.stars['c1-01']).toBe(2);
  });

  it('updateSave works on a copy', () => {
    loadSave(memory());
    const before = getSave();
    updateSave((d) => {
      d.daily.best = 5;
    });
    expect(before.daily.best).toBe(0);
    expect(getSave().daily.best).toBe(5);
  });

  it('sanitizes damaged fields and drops invalid entries', () => {
    const s = parseSave(
      JSON.stringify({
        version: 1,
        campaign: { stars: { 'c1-01': 3, 'c1-02': 9, 'c1-03': 'x', 'c1-04': 0 } },
        daily: {
          days: { '2026-10-01': { score: 1200, official: true, done: true }, nope: {} },
          best: -4,
          streak: { current: 3, best: 1, last: 'yesterday' },
        },
        junk: true,
      }),
    )!;
    expect(s.campaign.stars).toEqual({ 'c1-01': 3, 'c1-02': 3 });
    expect(Object.keys(s.daily.days)).toEqual(['2026-10-01']);
    expect(s.daily.days['2026-10-01']).toMatchObject({ score: 1200, done: true, won: false });
    expect(s.daily.best).toBe(0);
    expect(s.daily.streak).toEqual({ current: 3, best: 3, last: '' });
    expect('junk' in s).toBe(false);
  });

  it('rejects unreadable or future saves and backs them up', () => {
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave('[1]')).toBeNull();
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1 }))).toBeNull();
    const st = memory({ [SAVE_KEY]: '{oops' });
    expect(loadSave(st)).toEqual(createDefaultSave());
    expect(st.data[SAVE_BACKUP_KEY]).toBe('{oops');
  });

  it('survives storage that throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSave(broken)).toEqual(createDefaultSave());
    expect(updateSave((d) => void (d.daily.best = 1)).daily.best).toBe(1);
  });
});
