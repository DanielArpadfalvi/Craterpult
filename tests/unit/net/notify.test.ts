import { describe, expect, it } from 'vitest';
import { pushTarget } from '../../../src/game/online';
import { planNotify, type NotifyMatch } from '../../../supabase/functions/notify-turn/message';

const ACTIVE: NotifyMatch = {
  status: 'active',
  players: ['bob-id', 'ann-id'],
  names: ['Bob', 'Ann'],
  next_team: 1,
  rematch: null,
  rematch_by: null,
};

describe('planNotify (notify-turn edge function)', () => {
  it('"your turn" goes to the player who moves next, in their language', () => {
    const p = planNotify('turn', ACTIVE)!;
    expect(p.to).toBe('ann-id');
    expect(p.text('en')).toBe('Bob made a move – your turn!');
    expect(p.text('hu')).toBe('Bob lépett – te jössz!');
  });

  it('the reminder goes to the slow mover', () => {
    const p = planNotify('reminder', { ...ACTIVE, next_team: 0 })!;
    expect(p.to).toBe('bob-id');
    expect(p.text('en')).toBe('12 hours left to move against Ann.');
    expect(p.text('hu')).toBe('Még 12 órád van lépni Ann ellen.');
  });

  it('a rematch offer goes to the other player of the finished match', () => {
    const done = { ...ACTIVE, status: 'finished', next_team: -1, rematch: 'm2', rematch_by: 1 };
    const p = planNotify('rematch', done)!;
    expect(p.to).toBe('bob-id');
    expect(p.text('en')).toBe('Ann wants a rematch!');
    expect(p.text('hu')).toBe('Ann visszavágót kér!');
  });

  it('skips pushes the match no longer calls for', () => {
    const done = { ...ACTIVE, status: 'finished', next_team: -1 };
    expect(planNotify('turn', done)).toBeNull();
    expect(planNotify('reminder', done)).toBeNull();
    expect(planNotify('rematch', done)).toBeNull();
    expect(planNotify('rematch', ACTIVE)).toBeNull();
    expect(planNotify('turn', { ...ACTIVE, players: [null, 'ann-id'], next_team: 0 })).toBeNull();
  });
});

describe('pushTarget', () => {
  it('opens the match of a turn or reminder push, the list for a rematch offer', () => {
    expect(pushTarget({ matchId: 'm1' })).toBe('m1');
    expect(pushTarget({ matchId: 'm1', kind: 'turn' })).toBe('m1');
    expect(pushTarget({ matchId: 'm1', kind: 'reminder' })).toBe('m1');
    expect(pushTarget({ matchId: 'm1', kind: 'rematch' })).toBeNull();
    expect(pushTarget({})).toBeNull();
  });
});
