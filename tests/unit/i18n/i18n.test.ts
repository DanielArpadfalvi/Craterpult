import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en';
import { deviceLanguage, DICTIONARIES, format, LANGUAGES } from '../../../src/i18n';
import { MISSIONS } from '../../../src/core/campaign';
import { DAILY_MODIFIERS } from '../../../src/core/daily';
import { MAP_STYLES } from '../../../src/core/mapgen';

describe('i18n', () => {
  it('has every key translated in every language with the same placeholders', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const lang of LANGUAGES)
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const text = DICTIONARIES[lang][key];
        expect(text, `${lang} ${key}`).toBeTruthy();
        expect(ph(text), `${lang} ${key}`).toBe(ph(en[key]));
      }
  });

  it('names every language in its own language, the same in every dictionary', () => {
    for (const lang of LANGUAGES)
      for (const other of LANGUAGES)
        expect(DICTIONARIES[other][`lang.${lang}`]).toBe(DICTIONARIES[lang][`lang.${lang}`]);
  });

  it('picks the device language when the game has it, else English', () => {
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const as = (language: string) => {
      Object.defineProperty(globalThis, 'navigator', { value: { language }, configurable: true });
      return deviceLanguage();
    };
    try {
      expect(as('de-AT')).toBe('de');
      expect(as('hu')).toBe('hu');
      expect(as('en-GB')).toBe('en');
      expect(as('fr-FR')).toBe('en');
      expect(as('dex')).toBe('en');
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', nav);
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
