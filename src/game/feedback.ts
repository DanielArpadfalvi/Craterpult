import type { MatchEvent, MatchState } from '../core/types';
import type { SfxId } from '../audio/sfx';
import type { HapticStrength } from '../platform/haptics';

export type Feedback =
  { kind: 'sfx'; sfx: SfxId; a: number } | { kind: 'haptic'; strength: HapticStrength };

/** Map one tick's events to sounds and haptics (pure; ordering is stable). */
export function feedbackFor(
  events: readonly MatchEvent[],
  s: Pick<MatchState, 'activeUnit' | 'projectiles'>,
): Feedback[] {
  const out: Feedback[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'fired':
        if (e.weapon === 'shotgun') out.push({ kind: 'sfx', sfx: 'shotgun', a: 0.5 });
        else if (e.weapon === 'teleport') out.push({ kind: 'sfx', sfx: 'teleport', a: 0.5 });
        else if (e.weapon === 'girder') out.push({ kind: 'sfx', sfx: 'girder', a: 0.5 });
        else if (e.weapon === 'quake')
          out.push({ kind: 'sfx', sfx: 'quake', a: 1 }, { kind: 'haptic', strength: 'heavy' });
        else out.push({ kind: 'sfx', sfx: 'fire', a: 0.5 });
        if (e.weapon !== 'quake') out.push({ kind: 'haptic', strength: 'light' });
        break;
      case 'explosion': {
        const a = Math.min(1, e.radius / 60);
        out.push({ kind: 'sfx', sfx: 'explosion', a });
        if (e.radius >= 20)
          out.push({ kind: 'haptic', strength: e.radius >= 40 ? 'heavy' : 'medium' });
        break;
      }
      case 'bounce':
        out.push({ kind: 'sfx', sfx: 'bounce', a: 0.5 });
        break;
      case 'jumped':
        out.push({ kind: 'sfx', sfx: 'jump', a: 0.5 });
        break;
      case 'landed':
        if (e.damage > 0) out.push({ kind: 'sfx', sfx: 'land', a: 1 });
        break;
      case 'splash':
        out.push({ kind: 'sfx', sfx: 'splash', a: 0.5 });
        break;
      case 'damage':
        out.push({ kind: 'sfx', sfx: 'hurt', a: 0.5 });
        if (e.unit === s.activeUnit) out.push({ kind: 'haptic', strength: 'medium' });
        break;
      case 'crateDropped':
        out.push({ kind: 'sfx', sfx: 'crate', a: 0.5 });
        break;
      case 'crateCollected':
        out.push({ kind: 'sfx', sfx: 'pickup', a: 0.5 }, { kind: 'haptic', strength: 'light' });
        break;
      case 'turnStart':
        out.push({ kind: 'sfx', sfx: 'turn', a: 0.5 });
        break;
      case 'mineTriggered':
        out.push({ kind: 'sfx', sfx: 'beep', a: 0.5 });
        break;
      case 'gameOver':
        out.push({ kind: 'sfx', sfx: 'win', a: 1 }, { kind: 'haptic', strength: 'heavy' });
        break;
      default:
        break;
    }
  }
  return out;
}
