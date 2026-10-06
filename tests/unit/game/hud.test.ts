import { describe, expect, it } from 'vitest';
import {
  hudPatch,
  reuseArray,
  reuseRecord,
  shallowEqual,
  type HudFields,
} from '../../../src/game/hud';
import { INITIAL_UI, type UiState } from '../../../src/game/state';
import { createStore } from '../../../src/game/store';

function fields(hp = 300, ammo = 2): HudFields {
  return {
    phase: 'aiming',
    activeTeam: 0,
    activeName: 'You',
    activeColor: '#3ef0ff',
    turnSeconds: 45,
    wind: 3,
    teams: [
      { id: 0, name: 'You', hp, maxHp: 300, alive: 3, color: '#3ef0ff' },
      { id: 1, name: 'Bots', hp: 200, maxHp: 200, alive: 2, color: '#ff4fd8' },
    ],
    canMove: true,
    canFire: true,
    botTurn: false,
    weaponInfo: {
      bazooka: { ammo: -1, ok: true, fromTurn: 0, unlocked: true },
      grenade: { ammo, ok: true, fromTurn: 0, unlocked: true },
    },
  };
}

describe('hud publishing', () => {
  it('compares shallowly', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
    const prev = [{ a: 1 }];
    expect(reuseArray(prev, [{ a: 1 }])).toBe(prev);
    expect(reuseArray(prev, [{ a: 2 }])).not.toBe(prev);
    const rec = { x: { a: 1 } };
    expect(reuseRecord(rec, { x: { a: 1 } })).toBe(rec);
    expect(reuseRecord(rec, { y: { a: 1 } })).not.toBe(rec);
  });

  it('does not notify the UI when an unchanged HUD is published again', () => {
    const store = createStore<UiState>({ ...INITIAL_UI });
    let renders = 0;
    store.subscribe(() => renders++);
    const publish = (f: HudFields): void => {
      const patch = hudPatch(store.get(), f);
      if (Object.keys(patch).length > 0) store.set(patch);
    };
    publish(fields());
    expect(renders).toBe(1);
    const teams = store.get().teams;
    const weapons = store.get().weaponInfo;
    // Ten publishes of fresh but equal objects (one second of the 100 ms HUD timer).
    for (let i = 0; i < 10; i++) publish(fields());
    expect(renders).toBe(1);
    expect(hudPatch(store.get(), fields())).toEqual({});
    // A real change publishes only what changed and keeps the untouched objects.
    publish({ ...fields(250), turnSeconds: 44 });
    expect(renders).toBe(2);
    expect(store.get().teams).not.toBe(teams);
    expect(store.get().teams[0]!.hp).toBe(250);
    expect(store.get().weaponInfo).toBe(weapons);
    expect(Object.keys(hudPatch(store.get(), fields(250, 1)))).toEqual([
      'turnSeconds',
      'weaponInfo',
    ]);
  });
});
