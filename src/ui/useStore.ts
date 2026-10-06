import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../game/store';

export function useStore<T>(store: Store<T>): T {
  const [state, setState] = useState(store.get());
  useEffect(() => store.subscribe(setState), [store]);
  return state;
}
