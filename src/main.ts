import { h, render } from 'preact';
import './ui/styles.css';
import { bootGame } from './game/app';
import { App } from './ui/App';

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!stage || !ui) throw new Error('Missing #stage or #ui root element');
  const game = await bootGame(stage);
  render(h(App, game), ui);
}

void boot();
