/// <reference types="node" />
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENES, STORE_LANGS, STORE_LOCALE } from '../../../scripts/store-frames';

describe('store screenshot captions', () => {
  it('cover every store listing language for every scene', () => {
    const listed = readdirSync('store/listing', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...STORE_LANGS].sort()).toEqual(listed);
    for (const scene of SCENES)
      for (const lang of STORE_LANGS) {
        const c = scene.caption[lang];
        expect(c?.title, `${scene.id} ${lang}`).toMatch(/\*[^*]+\*/);
        expect(c?.sub.length, `${scene.id} ${lang}`).toBeGreaterThan(0);
        // Long headlines wrap into a third line and push the device down.
        expect(c!.title.replace(/\*/g, '').length, `${scene.id} ${lang}`).toBeLessThanOrEqual(40);
      }
  });

  it('gives each language a crew name that fits the 16-character limit', () => {
    for (const lang of STORE_LANGS)
      expect([...STORE_LOCALE[lang].crew].length, lang).toBeLessThanOrEqual(16);
  });
});
