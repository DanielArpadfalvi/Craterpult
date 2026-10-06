import { describe, expect, it } from 'vitest';
import { feedbackFor } from '../../../src/game/feedback';

const s = { activeUnit: 0, projectiles: [] };

describe('feedbackFor', () => {
  it('scales explosion sound and haptics with the blast size', () => {
    const small = feedbackFor([{ type: 'explosion', x: 0, y: 0, radius: 10 }], s);
    const big = feedbackFor([{ type: 'explosion', x: 0, y: 0, radius: 60 }], s);
    expect(small).toEqual([{ kind: 'sfx', sfx: 'explosion', a: 10 / 60 }]);
    expect(big).toContainEqual({ kind: 'haptic', strength: 'heavy' });
  });

  it('buzzes only when the active unit is hurt', () => {
    expect(feedbackFor([{ type: 'damage', unit: 1, amount: 5 }], s)).toHaveLength(1);
    expect(feedbackFor([{ type: 'damage', unit: 0, amount: 5 }], s)).toContainEqual({
      kind: 'haptic',
      strength: 'medium',
    });
  });

  it('uses weapon-specific firing sounds', () => {
    expect(feedbackFor([{ type: 'fired', unit: 0, weapon: 'shotgun' }], s)[0]).toEqual({
      kind: 'sfx',
      sfx: 'shotgun',
      a: 0.5,
    });
    expect(feedbackFor([{ type: 'fired', unit: 0, weapon: 'quake' }], s)).toContainEqual({
      kind: 'haptic',
      strength: 'heavy',
    });
  });
});
