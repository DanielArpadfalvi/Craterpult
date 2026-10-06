import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en';
import { DICTIONARIES, format } from '../../../src/i18n';
import { MISSIONS } from '../../../src/core/campaign';
import { DAILY_MODIFIERS } from '../../../src/core/daily';
import { MAP_STYLES } from '../../../src/core/mapgen';

describe('i18n', () => {
  it('has every key translated in Hungarian with the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const hu = DICTIONARIES.hu[key];
      expect(hu, key).toBeTruthy();
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
      expect(ph(hu), key).toBe(ph(en[key]));
    }
  });

  it('substitutes placeholders', () => {
    expect(format('{team} wins {n}', { team: 'A', n: 2 })).toBe('A wins 2');
    expect(format('{missing}', {})).toBe('{missing}');
  });

  it('names every mission, chapter, daily modifier and map style', () => {
    const keys = new Set(Object.keys(en));
    for (const m of MISSIONS) {
      expect(keys.has(`mission.${m.id}.name`), m.id).toBe(true);
      expect(keys.has(`mission.${m.id}.desc`), m.id).toBe(true);
    }
    for (const c of [1, 2, 3]) expect(keys.has(`chapter.${c}`)).toBe(true);
    for (const d of DAILY_MODIFIERS) expect(keys.has(`daily.mod.${d}.desc`), d).toBe(true);
    for (const m of MAP_STYLES) expect(keys.has(`map.${m}`), m).toBe(true);
  });
});
