import {
  BACKFLIP_VX,
  BACKFLIP_VY,
  DEFAULT_CONFIG,
  JUMP_VX,
  JUMP_VY,
  MAX_LAUNCH_SPEED,
  SETTLE_MAX_TICKS,
  SETTLE_MIN_TICKS,
  UNIT_HEIGHT,
  UNIT_HIT_RADIUS,
} from './constants';
import { explode } from './explosion';
import { clamp, fcos, fmul, fsin, fxFloor, normAngle, ONE } from './fixed';
import { DEFAULT_MAP, findSpawns, generateTerrain, type MapOptions } from './mapgen';
import { stepProjectiles } from './projectiles';
import { createRng, randInt } from './rng';
import { isSolid } from './terrain';
import type { Command, MatchConfig, MatchState, Team, Unit, WeaponId } from './types';
import { launchUnit, stepUnit, unitCenter, walk } from './units';
import { DEFAULT_FUSE_SECONDS, WEAPON_IDS, WEAPONS } from './weapons';

export interface TeamSetup {
  name: string;
  units: string[];
  bot?: boolean;
}

export interface MatchSetup {
  seed: string;
  teams: TeamSetup[];
  config?: Partial<MatchConfig>;
  map?: MapOptions;
}

export function createMatch(setup: MatchSetup): MatchState {
  if (setup.teams.length < 2) throw new RangeError('createMatch: need at least two teams');
  const map = setup.map ?? DEFAULT_MAP;
  const config: MatchConfig = { ...DEFAULT_CONFIG, ...setup.config };
  const rng = createRng(setup.seed);
  const terrain = generateTerrain(setup.seed, map);
  const total = setup.teams.reduce((n, t) => n + t.units.length, 0);
  const spawns = findSpawns(terrain, total, map.waterLevel, rng);
  // Interleave teams across the spawn slots (A B A B …) so nobody starts clustered.
  const order: { team: number; index: number }[] = [];
  const maxUnits = Math.max(...setup.teams.map((t) => t.units.length));
  for (let i = 0; i < maxUnits; i++) {
    setup.teams.forEach((t, ti) => {
      if (i < t.units.length) order.push({ team: ti, index: i });
    });
  }
  const units: Unit[] = [];
  const slots = order.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    // Light shuffle keeps the interleave mostly intact but varies it per seed.
    if (randInt(rng, 3) === 0) {
      const j = i - 1;
      const tmp = slots[i] as number;
      slots[i] = slots[j] as number;
      slots[j] = tmp;
    }
  }
  order.forEach((o, i) => {
    const sp = spawns[slots[i] as number] as { x: number; y: number };
    units.push({
      id: i,
      team: o.team,
      name: setup.teams[o.team]?.units[o.index] ?? `#${i}`,
      x: sp.x * ONE + (ONE >> 1),
      y: sp.y * ONE,
      vx: 0,
      vy: 0,
      grounded: false,
      hp: config.unitHp,
      alive: true,
      facing: sp.x < map.width / 2 ? 1 : -1,
      pendingDamage: 0,
    });
  });
  const teams: Team[] = setup.teams.map((t, i) => ({
    id: i,
    name: t.name,
    ammo: Object.fromEntries(WEAPON_IDS.map((w) => [w, WEAPONS[w].ammo])) as Record<
      WeaponId,
      number
    >,
    nextUnit: 0,
    bot: !!t.bot,
  }));
  const s: MatchState = {
    seed: setup.seed,
    config,
    tick: 0,
    rng,
    terrain,
    waterLevel: map.waterLevel,
    wind: 0,
    teams,
    units,
    projectiles: [],
    nextProjectileId: 1,
    phase: 'settling',
    activeTeam: setup.teams.length - 1,
    activeUnit: -1,
    turnNumber: 0,
    turnTicksLeft: 0,
    phaseTicks: 0,
    shotsLeft: 0,
    turnWeapon: null,
    moveDir: 0,
    winner: null,
    events: [],
  };
  // Drop everyone onto the ground before the first turn.
  for (let i = 0; i < 240 && s.units.some((u) => u.alive && !u.grounded); i++) {
    for (const u of s.units) stepUnit(s.terrain, u, s.waterLevel, s.events);
  }
  for (const u of s.units) u.pendingDamage = 0;
  s.events = [];
  startNextTurn(s);
  return s;
}

export function activeUnit(s: MatchState): Unit | null {
  return s.units[s.activeUnit] ?? null;
}

export function teamAlive(s: MatchState, team: number): boolean {
  return s.units.some((u) => u.team === team && u.alive && u.hp > 0);
}

/** Can the active unit act right now (move/jump), and can it fire? */
export function canMove(s: MatchState): boolean {
  const u = activeUnit(s);
  return !!u && u.alive && (s.phase === 'aiming' || s.phase === 'retreat');
}

export function canFire(s: MatchState, weapon: WeaponId): boolean {
  const u = activeUnit(s);
  if (!u || !u.alive || s.phase !== 'aiming') return false;
  if (s.shotsLeft > 0) return weapon === s.turnWeapon;
  return (s.teams[s.activeTeam]?.ammo[weapon] ?? 0) !== 0;
}

/** Advance the match by one tick, applying this tick's commands first. */
export function step(s: MatchState, commands: readonly Command[] = []): void {
  s.events = [];
  if (s.phase === 'over') return;
  s.tick++;
  s.phaseTicks++;
  for (const c of commands) applyCommand(s, c);

  const u = activeUnit(s);
  if (u && s.moveDir !== 0 && canMove(s) && u.grounded) walk(s.terrain, u, s.moveDir);

  const hpBefore = u ? u.hp : 0;
  for (const unit of s.units) stepUnit(s.terrain, unit, s.waterLevel, s.events);
  stepProjectiles(s);

  switch (s.phase) {
    case 'aiming':
      s.turnTicksLeft--;
      // Hurting yourself (a fall) or running out of time ends the turn.
      if (!u || !u.alive || u.hp < hpBefore || s.turnTicksLeft <= 0) enterPhase(s, 'settling');
      break;
    case 'firing':
      if (s.projectiles.length === 0 && s.phaseTicks >= 2) {
        if (s.shotsLeft > 0 && u && u.alive && u.hp > 0 && s.turnTicksLeft > 0) {
          enterPhase(s, 'aiming');
        } else if (u && u.alive && u.hp > 0) {
          enterPhase(s, 'retreat');
        } else {
          enterPhase(s, 'settling');
        }
      }
      break;
    case 'retreat':
      if (s.phaseTicks >= s.config.retreatTicks || !u || !u.alive) enterPhase(s, 'settling');
      break;
    case 'settling':
      if (s.phaseTicks >= SETTLE_MAX_TICKS || (s.phaseTicks >= SETTLE_MIN_TICKS && atRest(s))) {
        finishTurn(s);
      }
      break;
  }
}

function enterPhase(s: MatchState, phase: MatchState['phase']): void {
  s.phase = phase;
  s.phaseTicks = 0;
  if (phase !== 'aiming' && phase !== 'retreat') s.moveDir = 0;
}

function atRest(s: MatchState): boolean {
  return s.projectiles.length === 0 && s.units.every((u) => !u.alive || u.grounded);
}

function applyCommand(s: MatchState, c: Command): void {
  const u = activeUnit(s);
  if (!u || !u.alive) return;
  switch (c.t) {
    case 'move':
      if (canMove(s)) s.moveDir = c.dir;
      if (c.dir !== 0 && canMove(s)) u.facing = c.dir;
      break;
    case 'jump':
      if (canMove(s) && u.grounded) {
        launchUnit(u, u.facing * JUMP_VX, JUMP_VY);
        s.events.push({ type: 'jumped', unit: u.id });
      }
      break;
    case 'backflip':
      if (canMove(s) && u.grounded) {
        launchUnit(u, u.facing * BACKFLIP_VX, BACKFLIP_VY);
        s.events.push({ type: 'jumped', unit: u.id });
      }
      break;
    case 'fire':
      fire(s, u, c.weapon, c.angle, c.power, c.fuse);
      break;
    case 'skip':
      if (s.phase === 'aiming' || s.phase === 'retreat') enterPhase(s, 'settling');
      break;
  }
}

function fire(
  s: MatchState,
  u: Unit,
  weapon: WeaponId,
  angle: number,
  power: number,
  fuseSeconds = DEFAULT_FUSE_SECONDS,
): void {
  if (!canFire(s, weapon)) return;
  const def = WEAPONS[weapon];
  const team = s.teams[s.activeTeam] as Team;
  const a = normAngle(Math.trunc(angle));
  const cos = fcos(a);
  const sin = fsin(a);
  u.facing = cos < 0 ? -1 : 1;
  if (s.shotsLeft === 0) {
    if (team.ammo[weapon] > 0) team.ammo[weapon]--;
    s.shotsLeft = def.shots;
    s.turnWeapon = weapon;
  }
  s.shotsLeft--;
  s.moveDir = 0;
  s.events.push({ type: 'fired', unit: u.id, weapon });
  const c = unitCenter(u);
  if (def.kind === 'hitscan') {
    hitscan(s, u, c.x, c.y, cos, sin, def.range, def.blastRadius, def.damage, def.knockback);
  } else {
    const speed = fmul(
      MAX_LAUNCH_SPEED,
      Math.floor((clamp(Math.trunc(power), 5, 100) * ONE) / 100),
    );
    const muzzle = UNIT_HIT_RADIUS + 3;
    s.projectiles.push({
      id: s.nextProjectileId++,
      weapon,
      x: c.x * ONE + muzzle * cos,
      y: c.y * ONE - muzzle * sin,
      vx: fmul(speed, cos),
      vy: -fmul(speed, sin),
      fuse: def.fuse ? clamp(Math.trunc(fuseSeconds), 1, 5) * 60 : -1,
      owner: u.id,
      age: 0,
    });
  }
  enterPhase(s, 'firing');
}

/** Instant ray from (x, y): explodes at the first terrain pixel or unit (other than the shooter). */
function hitscan(
  s: MatchState,
  shooter: Unit,
  x: number,
  y: number,
  cos: number,
  sin: number,
  range: number,
  radius: number,
  damage: number,
  knockback: number,
): void {
  let hx = x;
  let hy = y;
  let hit = false;
  let victim: Unit | null = null;
  for (let d = UNIT_HIT_RADIUS; d <= range && !hit; d++) {
    hx = x + fxFloor(d * cos);
    hy = y - fxFloor(d * sin);
    if (hy >= s.waterLevel || hx < 0 || hx >= s.terrain.width) break;
    if (isSolid(s.terrain, hx, hy)) hit = true;
    for (const o of s.units) {
      if (!o.alive || o.id === shooter.id) continue;
      const c = unitCenter(o);
      const dx = c.x - hx;
      const dy = c.y - hy;
      if (dx * dx + dy * dy <= UNIT_HIT_RADIUS * UNIT_HIT_RADIUS) {
        hit = true;
        victim = o;
      }
    }
  }
  s.events.push({ type: 'shot', x0: x, y0: y, x1: hx, y1: hy });
  if (!hit) return;
  if (victim) {
    // A direct hit deals the full damage; the blast only chips the terrain and pushes.
    victim.hp -= damage;
    victim.pendingDamage += damage;
    s.events.push({ type: 'damage', unit: victim.id, amount: damage });
    explode(s, hx, hy, radius, 0, knockback);
  } else {
    explode(s, hx, hy, radius, damage, knockback);
  }
}

function finishTurn(s: MatchState): void {
  for (const u of s.units) {
    if (u.alive && u.hp <= 0) {
      u.alive = false;
      u.hp = 0;
      s.events.push({ type: 'died', unit: u.id });
      // A small blast where the unit fell, like a gravestone puff (no damage).
      const c = unitCenter(u);
      s.events.push({ type: 'explosion', x: c.x, y: c.y + (UNIT_HEIGHT >> 1), radius: 10 });
    }
    u.pendingDamage = 0;
  }
  const alive = s.teams.filter((t) => teamAlive(s, t.id));
  if (alive.length <= 1) {
    s.winner = alive[0]?.id ?? -1;
    s.phase = 'over';
    s.events.push({ type: 'gameOver', winner: s.winner });
    return;
  }
  startNextTurn(s);
}

function startNextTurn(s: MatchState): void {
  const n = s.teams.length;
  let team = s.activeTeam;
  for (let i = 0; i < n; i++) {
    team = (team + 1) % n;
    if (teamAlive(s, team)) break;
  }
  const t = s.teams[team] as Team;
  const members = s.units.filter((u) => u.team === team);
  let pick: Unit | undefined;
  for (let i = 0; i < members.length; i++) {
    const idx = (t.nextUnit + i) % members.length;
    const m = members[idx] as Unit;
    if (m.alive && m.hp > 0) {
      pick = m;
      t.nextUnit = (idx + 1) % members.length;
      break;
    }
  }
  s.activeTeam = team;
  s.activeUnit = pick ? pick.id : -1;
  s.turnNumber++;
  s.turnTicksLeft = s.config.turnTicks;
  s.shotsLeft = 0;
  s.turnWeapon = null;
  s.moveDir = 0;
  s.wind = randInt(s.rng, 21) - 10;
  enterPhase(s, 'aiming');
  s.events.push({ type: 'turnStart', team, unit: s.activeUnit, wind: s.wind });
}
