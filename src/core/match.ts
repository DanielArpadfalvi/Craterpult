import {
  BACKFLIP_VX,
  BACKFLIP_VY,
  DEFAULT_CONFIG,
  JUMP_VX,
  JUMP_VY,
  MAX_LAUNCH_SPEED,
  scaledGravity,
  SETTLE_MAX_TICKS,
  SETTLE_MIN_TICKS,
  UNIT_HEIGHT,
  UNIT_HIT_RADIUS,
} from './constants';
import { stepCrates, maybeDropCrate } from './crates';
import { explode } from './explosion';
import { clamp, fcos, fmul, fsin, fx, fxFloor, normAngle, ONE } from './fixed';
import { DEFAULT_MAP, findSpawns, generateTerrain, type MapOptions } from './mapgen';
import { spawnProjectile, stepProjectiles } from './projectiles';
import { createRng, randInt } from './rng';
import { carveCircle, fillCircle, isSolid, METAL } from './terrain';
import type { Command, MatchConfig, MatchState, Team, Unit, WeaponId } from './types';
import { bodyCollides, launchUnit, stepUnit, unitCenter, walk } from './units';
import { DEFAULT_FUSE_SECONDS, WEAPON_IDS, WEAPONS } from './weapons';

export interface TeamSetup {
  name: string;
  /** Unit names; the length is the unit count. */
  units: string[];
  bot?: boolean;
  /** Starting HP of this team's units (default: `config.unitHp`). */
  hp?: number;
  /** Restrict the arsenal: every weapon not listed starts with 0 rounds. */
  only?: WeaponId[];
  /** Per-weapon starting rounds (-1 = unlimited), applied after `only`. */
  ammo?: Partial<Record<WeaponId, number>>;
}

export interface MatchSetup {
  seed: string;
  teams: TeamSetup[];
  config?: Partial<MatchConfig>;
  map?: MapOptions;
  /** Wind of the first turn (−10…10) instead of a random one. */
  startWind?: number;
}

/** Starting ammo of a team: weapon defaults, then `only`, then explicit overrides. */
export function teamAmmo(t: TeamSetup): Record<WeaponId, number> {
  const ammo = Object.fromEntries(
    WEAPON_IDS.map((w) => [w, t.only && !t.only.includes(w) ? 0 : WEAPONS[w].ammo]),
  ) as Record<WeaponId, number>;
  for (const w of WEAPON_IDS) {
    const v = t.ammo?.[w];
    if (v !== undefined) ammo[w] = Math.max(-1, Math.trunc(v));
  }
  return ammo;
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
    const hp = Math.max(1, Math.trunc(setup.teams[o.team]?.hp ?? config.unitHp));
    units.push({
      id: i,
      team: o.team,
      name: setup.teams[o.team]?.units[o.index] ?? `#${i}`,
      x: sp.x * ONE + (ONE >> 1),
      y: sp.y * ONE,
      vx: 0,
      vy: 0,
      grounded: false,
      hp,
      maxHp: hp,
      alive: true,
      facing: sp.x < map.width / 2 ? 1 : -1,
      pendingDamage: 0,
    });
  });
  const teams: Team[] = setup.teams.map((t, i) => ({
    id: i,
    name: t.name,
    ammo: teamAmmo(t),
    nextUnit: 0,
    bot: !!t.bot,
    used: [],
  }));
  const s: MatchState = {
    seed: setup.seed,
    config,
    tick: 0,
    rng,
    terrain,
    mapStyle: map.style ?? 'hills',
    waterLevel: map.waterLevel,
    wind: 0,
    teams,
    units,
    projectiles: [],
    nextProjectileId: 1,
    crates: [],
    nextCrateId: 1,
    phase: 'settling',
    activeTeam: setup.teams.length - 1,
    activeUnit: -1,
    turnNumber: 0,
    teamTurns: setup.teams.map(() => 0),
    turnTicksLeft: 0,
    phaseTicks: 0,
    shotsLeft: 0,
    turnWeapon: null,
    moveDir: 0,
    winner: null,
    events: [],
  };
  // Drop everyone onto the ground before the first turn.
  const g = scaledGravity(config.gravityPct);
  for (let i = 0; i < 240 && s.units.some((u) => u.alive && !u.grounded); i++) {
    for (const u of s.units) stepUnit(s.terrain, u, s.waterLevel, s.events, g);
  }
  for (const u of s.units) u.pendingDamage = 0;
  s.events = [];
  startNextTurn(s);
  if (setup.startWind !== undefined && config.windEnabled) {
    s.wind = clamp(Math.trunc(setup.startWind), -10, 10);
    const ts = s.events.find((e) => e.type === 'turnStart');
    if (ts && ts.type === 'turnStart') ts.wind = s.wind;
  }
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
  if ((s.teamTurns[s.activeTeam] ?? 0) < WEAPONS[weapon].fromTurn) return false;
  return (s.teams[s.activeTeam]?.ammo[weapon] ?? 0) !== 0;
}

/** Explosives still doing something (armed-but-idle mines do not hold up the turn). */
export function projectilesBusy(s: MatchState): boolean {
  return s.projectiles.some((p) => !(p.weapon === 'mine' && p.resting && p.fuse < 0));
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
  const g = scaledGravity(s.config.gravityPct);
  for (const unit of s.units) stepUnit(s.terrain, unit, s.waterLevel, s.events, g);
  stepProjectiles(s);
  stepCrates(s);

  switch (s.phase) {
    case 'aiming':
      s.turnTicksLeft--;
      // Hurting yourself (a fall) or running out of time ends the turn.
      if (!u || !u.alive || u.hp < hpBefore || s.turnTicksLeft <= 0) enterPhase(s, 'settling');
      break;
    case 'firing':
      if (!projectilesBusy(s) && s.phaseTicks >= 2) {
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
  return !projectilesBusy(s) && s.units.every((u) => !u.alive || u.grounded);
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
      fire(s, u, c);
      break;
    case 'skip':
      if (s.phase === 'aiming' || s.phase === 'retreat') enterPhase(s, 'settling');
      break;
  }
}

type FireCommand = Extract<Command, { t: 'fire' }>;

function fire(s: MatchState, u: Unit, c: FireCommand): void {
  const weapon = c.weapon;
  if (!canFire(s, weapon)) return;
  const def = WEAPONS[weapon];
  const team = s.teams[s.activeTeam] as Team;
  const a = normAngle(Math.trunc(c.angle ?? (u.facing === 1 ? 0 : 1800)));
  const cos = fcos(a);
  const sin = fsin(a);
  const center = unitCenter(u);
  const tx = Math.trunc(c.tx ?? center.x);
  const ty = Math.trunc(c.ty ?? center.y);
  if (def.aim === 'arc' || def.aim === 'direction') u.facing = cos < 0 ? -1 : 1;

  // Validate placements before spending ammo.
  if (weapon === 'teleport' && !teleportOk(s, tx, ty)) return;
  if (weapon === 'girder' && !girderOk(s, tx, ty, a, def.range)) return;

  if (s.shotsLeft === 0) {
    if (team.ammo[weapon] > 0) team.ammo[weapon]--;
    s.shotsLeft = def.shots;
    s.turnWeapon = weapon;
    // Replace (never mutate) so shallow clones (bot lookahead) cannot leak into the real match.
    if (!team.used.includes(weapon)) team.used = [...team.used, weapon];
  }
  s.shotsLeft--;
  s.moveDir = 0;
  s.events.push({ type: 'fired', unit: u.id, weapon });
  const fuseTicks = def.fuse
    ? clamp(Math.trunc(c.fuse ?? DEFAULT_FUSE_SECONDS), 1, 5) * 60
    : def.fixedFuse;

  switch (weapon) {
    case 'shotgun':
      hitscan(
        s,
        u,
        center.x,
        center.y,
        cos,
        sin,
        def.range,
        def.blastRadius,
        def.damage,
        def.knockback,
      );
      break;
    case 'drill':
      for (let d = 4; d <= def.range; d += 5) {
        const rect = carveCircle(
          s.terrain,
          center.x + fxFloor(d * cos),
          center.y - fxFloor(d * sin),
          def.blastRadius,
        );
        if (rect) s.events.push({ type: 'carved', rect });
      }
      break;
    case 'punch':
      punch(s, u, def.range, def.damage, def.knockback);
      break;
    case 'quake':
      s.events.push({ type: 'quake' });
      for (const o of s.units) {
        if (!o.alive) continue;
        o.hp -= def.damage;
        o.pendingDamage += def.damage;
        s.events.push({ type: 'damage', unit: o.id, amount: def.damage });
        launchUnit(o, (randInt(s.rng, 5) - 2) * fx(1), -fx(def.knockback));
      }
      break;
    case 'teleport':
      u.x = tx * ONE + (ONE >> 1);
      u.y = ty * ONE;
      u.vx = 0;
      u.vy = 0;
      u.grounded = false;
      s.events.push({ type: 'teleported', unit: u.id });
      break;
    case 'girder':
      placeGirder(s, tx, ty, a, def.range);
      break;
    case 'airstrike':
      for (let i = 0; i < def.fragments; i++) {
        const mx = tx + (i - (def.fragments - 1) / 2) * 26;
        spawnProjectile(s, 'missile', mx * ONE, (-40 - i * 6) * ONE, s.wind * fx(0.1), fx(4), u.id);
      }
      break;
    case 'homing':
      spawnProjectile(
        s,
        weapon,
        center.x * ONE,
        (center.y - 10) * ONE,
        u.facing * fx(1.5),
        -fx(5),
        u.id,
        -1,
        {
          tx,
          ty,
        },
      );
      break;
    case 'dynamite':
    case 'mine':
    case 'crawler':
      spawnProjectile(
        s,
        weapon,
        (center.x + u.facing * 8) * ONE,
        (center.y - 2) * ONE,
        u.facing * fx(0.8),
        -fx(1),
        u.id,
        fuseTicks,
        { dir: u.facing },
      );
      break;
    default: {
      const power = clamp(Math.trunc(c.power ?? 50), 5, 100);
      const speed = Math.trunc(
        (fmul(MAX_LAUNCH_SPEED, Math.floor((power * ONE) / 100)) * def.speedPct) / 100,
      );
      const muzzle = UNIT_HIT_RADIUS + 3;
      spawnProjectile(
        s,
        weapon,
        center.x * ONE + muzzle * cos,
        center.y * ONE - muzzle * sin,
        fmul(speed, cos),
        -fmul(speed, sin),
        u.id,
        fuseTicks,
      );
    }
  }
  enterPhase(s, def.noRetreat ? 'settling' : 'firing');
}

function teleportOk(s: MatchState, x: number, y: number): boolean {
  return (
    x > 4 &&
    x < s.terrain.width - 4 &&
    y > 12 &&
    y < s.waterLevel - 12 &&
    !bodyCollides(s.terrain, x, y)
  );
}

/** Girder: a metal beam of `length` px centered on (x, y), snapped to 45° steps. */
function girderPoints(
  x: number,
  y: number,
  angle: number,
  length: number,
): { x: number; y: number }[] {
  const snapped = (Math.round(angle / 450) * 450) % 1800;
  const cos = fcos(snapped);
  const sin = fsin(snapped);
  const pts: { x: number; y: number }[] = [];
  for (let d = -(length >> 1); d <= length >> 1; d += 2) {
    pts.push({ x: x + fxFloor(d * cos), y: y - fxFloor(d * sin) });
  }
  return pts;
}

function girderOk(s: MatchState, x: number, y: number, angle: number, length: number): boolean {
  if (y < 0 || y >= s.waterLevel || x < 0 || x >= s.terrain.width) return false;
  return girderPoints(x, y, angle, length).every((p) =>
    s.units.every((o) => {
      if (!o.alive) return true;
      const c = unitCenter(o);
      return (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y) > 12 * 12;
    }),
  );
}

function placeGirder(s: MatchState, x: number, y: number, angle: number, length: number): void {
  const pts = girderPoints(x, y, angle, length);
  for (const p of pts) fillCircle(s.terrain, p.x, p.y, 3, METAL);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const rect = {
    x: Math.min(...xs) - 4,
    y: Math.min(...ys) - 4,
    w: Math.max(...xs) - Math.min(...xs) + 9,
    h: Math.max(...ys) - Math.min(...ys) + 9,
  };
  s.events.push({ type: 'girder', rect }, { type: 'carved', rect });
}

/** Melee: hits units just in front of the attacker and launches them. */
function punch(s: MatchState, u: Unit, range: number, damage: number, knockback: number): void {
  const c = unitCenter(u);
  for (const o of s.units) {
    if (!o.alive || o.id === u.id) continue;
    const oc = unitCenter(o);
    const ahead = (oc.x - c.x) * u.facing;
    if (ahead < 0 || ahead > range + UNIT_HIT_RADIUS || Math.abs(oc.y - c.y) > 14) continue;
    o.hp -= damage;
    o.pendingDamage += damage;
    s.events.push({ type: 'damage', unit: o.id, amount: damage });
    launchUnit(o, u.facing * fmul(fx(knockback), fx(0.6)), -fmul(fx(knockback), fx(0.8)));
  }
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
  const focus = s.config.endOnTeamLoss;
  const focusLost = focus >= 0 && !alive.some((t) => t.id === focus);
  if (alive.length <= 1 || focusLost) {
    s.winner = alive.length === 1 ? (alive[0]?.id ?? -1) : -1;
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
  s.teamTurns[team] = (s.teamTurns[team] ?? 0) + 1;
  if (s.config.suddenDeathTurn > 0 && s.turnNumber >= s.config.suddenDeathTurn) {
    s.waterLevel = Math.max(40, s.waterLevel - s.config.waterRise);
    s.events.push({ type: 'waterRise', level: s.waterLevel });
  }
  if (s.turnNumber > s.teams.length) maybeDropCrate(s);
  s.turnTicksLeft = s.config.turnTicks;
  s.shotsLeft = 0;
  s.turnWeapon = null;
  s.moveDir = 0;
  const wind = randInt(s.rng, 21) - 10;
  s.wind = s.config.windEnabled ? wind : 0;
  enterPhase(s, 'aiming');
  s.events.push({ type: 'turnStart', team, unit: s.activeUnit, wind: s.wind });
}
