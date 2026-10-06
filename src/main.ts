import { h, render } from 'preact';
import './ui/styles.css';
import { bootGame } from './game/app';
import { getPlatform } from './platform';
import { App } from './ui/App';

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!stage || !ui) throw new Error('Missing #stage or #ui root element');
  const { systemUi } = getPlatform();
  void systemUi.setupStatusBar('dark');
  try {
    const game = await bootGame(stage);
    render(h(App, game), ui);
  } finally {
    // Native splash (no-op on the web): hide once the first UI is up, or on a boot error.
    void systemUi.hideSplash();
  }
}

void boot();
