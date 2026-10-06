import { describe, expect, it } from 'vitest';
import {
  createDefaultSave,
  getSave,
  loadSave,
  onSaveChange,
  importLegacyKeys,
  LEGACY_LANG_KEY,
  LEGACY_MUTE_KEY,
  parseSave,
  resetProgress,
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
    removeItem: (k) => {
      delete data[k];
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

  it('migrates a v1 save to v2, keeping progress and adding defaults', () => {
    const v1 = {
      version: 1,
      campaign: { stars: { 'c1-01': 3, 'c1-02': 1 } },
      daily: {
        days: { '2026-10-05': { score: 900, won: true, official: true, done: true } },
        best: 900,
        streak: { current: 2, best: 4, last: '2026-10-05' },
      },
    };
    const s = parseSave(JSON.stringify(v1))!;
    expect(SAVE_VERSION).toBe(2);
    expect(s.version).toBe(2);
    expect(s.campaign.stars).toEqual({ 'c1-01': 3, 'c1-02': 1 });
    expect(s.daily.best).toBe(900);
    expect(s.daily.streak).toEqual({ current: 2, best: 4, last: '2026-10-05' });
    const fresh = createDefaultSave();
    expect(s.settings).toEqual(fresh.settings);
    expect(s.profile).toEqual(fresh.profile);
    expect(s.quick).toEqual(fresh.quick);
    expect(s.stats).toEqual(fresh.stats);
  });

  it('keeps and sanitizes v2 settings, team, quick choices and stats', () => {
    const s = parseSave(
      JSON.stringify({
        version: 2,
        settings: { sound: false, haptics: true, turnTime: 90, language: 'hu' },
        profile: { name: '  Rockets ', color: 3, hat: 'horns' },
        quick: { difficulty: 9, teamSize: 4, mapStyle: 'cavern' },
        stats: { kills: 7, modes: { quick: { played: 3, won: 2 } } },
      }),
    )!;
    expect(s.settings).toMatchObject({ sound: false, turnTime: 90, language: 'hu' });
    expect(s.profile).toEqual({ name: 'Rockets', color: 3, hat: 'horns' });
    expect(s.quick).toEqual({ difficulty: 5, teamSize: 4, mapStyle: 'cavern' });
    expect(s.stats.kills).toBe(7);
    expect(s.stats.modes.quick).toEqual({ played: 3, won: 2 });
  });

  it('moves the old mute and language keys into the save once', () => {
    const v1 = JSON.stringify({ version: 1, campaign: { stars: { 'c1-01': 2 } } });
    const st = memory({ [SAVE_KEY]: v1, [LEGACY_MUTE_KEY]: '1', [LEGACY_LANG_KEY]: 'hu' });
    const s = loadSave(st);
    expect(s.settings.sound).toBe(false);
    expect(s.settings.language).toBe('hu');
    expect(s.campaign.stars['c1-01']).toBe(2);
    expect(st.data[LEGACY_MUTE_KEY]).toBeUndefined();
    expect(st.data[LEGACY_LANG_KEY]).toBeUndefined();
    const stored = JSON.parse(st.data[SAVE_KEY]!);
    expect(stored.version).toBe(2);
    expect(stored.settings.sound).toBe(false);
    // A later change sticks: the legacy keys are gone.
    updateSave((d) => void (d.settings.sound = true));
    expect(loadSave(st).settings.sound).toBe(true);
  });

  it('imports legacy values only when they are valid', () => {
    const s = createDefaultSave();
    expect(importLegacyKeys(s, { muted: null, lang: null })).toBe(false);
    expect(importLegacyKeys(s, { muted: 'maybe', lang: 'fr' })).toBe(false);
    expect(s.settings).toEqual(createDefaultSave().settings);
    expect(importLegacyKeys(s, { muted: '0', lang: 'en' })).toBe(true);
    expect(s.settings).toMatchObject({ sound: true, language: 'en' });
  });

  it('reset progress wipes campaign, daily and stats but keeps settings and the team', () => {
    const s = createDefaultSave();
    s.campaign.stars['c1-01'] = 3;
    s.daily.best = 1500;
    s.stats.kills = 12;
    s.settings.sound = false;
    s.profile.name = 'Boomers';
    s.quick.teamSize = 4;
    const r = resetProgress(s);
    expect(r.campaign.stars).toEqual({});
    expect(r.daily.best).toBe(0);
    expect(r.stats.kills).toBe(0);
    expect(r.settings.sound).toBe(false);
    expect(r.profile.name).toBe('Boomers');
    expect(r.quick.teamSize).toBe(4);
  });
});
