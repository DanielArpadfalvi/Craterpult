import { GRAVITY, UNIT_HIT_RADIUS } from './constants';
import { fx, fxFloor, ONE } from './fixed';
import { randInt } from './rng';
import { isSolid } from './terrain';
import type { Crate, MatchState } from './types';
import { unitCenter } from './units';
import { CRATE_WEAPONS } from './weapons';

export const CRATE_HEALTH = 25;
export const MAX_HP = 150;
const CRATE_MAX_FALL = fx(2.2);
const PICKUP_RADIUS = UNIT_HIT_RADIUS + 8;

/** Maybe parachute a crate onto a random spot (called at turn start). */
export function maybeDropCrate(s: MatchState): void {
  if (randInt(s.rng, 100) >= s.config.crateChance) return;
  const health = randInt(s.rng, 100) < 35;
  const margin = Math.floor(s.terrain.width / 10);
  const x = margin + randInt(s.rng, s.terrain.width - 2 * margin);
  const crate: Crate = {
    id: s.nextCrateId++,
    kind: health ? 'health' : 'weapon',
    weapon: health ? null : (CRATE_WEAPONS[randInt(s.rng, CRATE_WEAPONS.length)] ?? null),
    x: x * ONE,
    y: -30 * ONE,
    vy: 0,
    grounded: false,
  };
  s.crates.push(crate);
  s.events.push({ type: 'crateDropped', crate: crate.id });
}

/** Fall (parachute speed), land, sink, and get picked up by any unit touching it. */
export function stepCrates(s: MatchState): void {
  if (s.crates.length === 0) return;
  const keep: Crate[] = [];
  for (const c of s.crates) {
    const px = fxFloor(c.x);
    if (c.grounded && !isSolid(s.terrain, px, fxFloor(c.y) + 1)) c.grounded = false;
    if (!c.grounded) {
      c.vy = Math.min(CRATE_MAX_FALL, c.vy + (GRAVITY >> 1));
      const steps = Math.max(1, Math.ceil(c.vy / ONE));
      for (let i = 0; i < steps; i++) {
        if (isSolid(s.terrain, px, fxFloor(c.y) + 1)) {
          c.grounded = true;
          c.vy = 0;
          c.y = fxFloor(c.y) * ONE;
          break;
        }
        c.y += Math.trunc(c.vy / steps);
      }
    }
    if (fxFloor(c.y) >= s.waterLevel) {
      s.events.push({ type: 'splash', x: px });
      continue;
    }
    const taker = s.units.find((u) => {
      if (!u.alive || u.hp <= 0) return false;
      const uc = unitCenter(u);
      const dx = uc.x - px;
      const dy = uc.y - (fxFloor(c.y) - 6);
      return dx * dx + dy * dy <= PICKUP_RADIUS * PICKUP_RADIUS;
    });
    if (taker) {
      if (c.kind === 'health') {
        taker.hp = Math.min(MAX_HP, taker.hp + CRATE_HEALTH);
      } else if (c.weapon) {
        const team = s.teams[taker.team];
        if (team && team.ammo[c.weapon] >= 0) team.ammo[c.weapon]++;
      }
      s.events.push({
        type: 'crateCollected',
        crate: c.id,
        unit: taker.id,
        kind: c.kind,
        weapon: c.weapon,
      });
      continue;
    }
    keep.push(c);
  }
  s.crates = keep;
}
