import { describe, expect, it, vi } from 'vitest';
import { createExternalLinks } from '../../../src/platform';

describe('createExternalLinks', () => {
  it('opens https pages in a new browsing context without an opener', () => {
    const open = vi.fn();
    createExternalLinks(open).open('https://example.com/privacy.html');
    expect(open).toHaveBeenCalledWith(
      'https://example.com/privacy.html',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('ignores anything that is not an https URL', () => {
    const open = vi.fn();
    const links = createExternalLinks(open);
    links.open('javascript:alert(1)');
    links.open('http://example.com');
    expect(open).not.toHaveBeenCalled();
  });

  it('is safe without window.open', () => {
    expect(() => createExternalLinks(undefined).open('https://example.com')).not.toThrow();
  });
});
