import { describe, expect, it } from 'vitest';
import { windText } from '../../../src/ui/wind';

describe('windText', () => {
  it('shows the strength with an arrow pointing where the wind blows', () => {
    expect(windText(-7)).toBe('←7');
    expect(windText(3)).toBe('3→');
    expect(windText(10)).toBe('10→');
    expect(windText(0)).toBe('0');
    expect(windText(-0)).toBe('0');
  });
});
