import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en';
import { DICTIONARIES, format } from '../../../src/i18n';

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
});
