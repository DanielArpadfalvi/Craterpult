// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebLifecycle } from '../../../src/platform';

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('createWebLifecycle', () => {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    disposers.splice(0).forEach((d) => d());
    setVisibility('visible');
  });

  it('maps visibilitychange to pause/resume', () => {
    const lc = createWebLifecycle(document);
    disposers.push(lc.dispose);
    const pause = vi.fn();
    const resume = vi.fn();
    const unsub = lc.onPause(pause);
    lc.onResume(resume);
    setVisibility('hidden');
    setVisibility('visible');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    unsub();
    unsub();
    setVisibility('hidden');
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('treats Escape as back, invoking only the most recent handler', () => {
    const lc = createWebLifecycle(document);
    disposers.push(lc.dispose);
    const root = vi.fn();
    const modal = vi.fn();
    lc.onBackButton(root);
    const closeModal = lc.onBackButton(modal);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal).toHaveBeenCalledTimes(1);
    expect(root).not.toHaveBeenCalled();

    closeModal();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(root).toHaveBeenCalledTimes(1);
  });

  it('stops listening after dispose', () => {
    const lc = createWebLifecycle(document);
    const pause = vi.fn();
    lc.onPause(pause);
    lc.dispose();
    setVisibility('hidden');
    expect(pause).not.toHaveBeenCalled();
  });
});
