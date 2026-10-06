import { UNIT_HIT_RADIUS } from '../constants';
import { fatan2 } from '../fixed';
import { activeUnit, canFire, step } from '../match';
import { createRng, randInt, type RngState } from '../rng';
import { cloneTerrain } from '../terrain';
import type { Command, MatchState, Unit, WeaponId } from '../types';
import { unitCenter } from '../units';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Profile {
  /** Angle step of the coarse grid (deci-degrees). */
  angleStep: number;
  powerStep: number;
  /** Refinement passes around the best shot. */
  refine: number;
  /** Execution error: ± deci-degrees and ± power. */
  angleNoise: number;
  powerNoise: number;
  weapons: WeaponId[];
  /** Weight of damage to its own team (higher = more careful). */
  caution: number;
}

/**
 * Aim noise (T8.3): levels 4–5 used to aim within ±1° / ±0.3°, far beyond any human; the campaign
 * sim (`npm run sim:campaign`) showed even a ±1° stand-in losing most of chapter 3. They now miss
 * by up to ±2° / ±1.8° — still the sharpest shooters, still ordered by level.
 */
const PROFILES: Record<Difficulty, Profile> = {
  1: {
    angleStep: 300,
    powerStep: 25,
    refine: 0,
    angleNoise: 90,
    powerNoise: 14,
    weapons: ['bazooka', 'grenade'],
    caution: 0.3,
  },
  2: {
    angleStep: 220,
    powerStep: 20,
    refine: 1,
    angleNoise: 50,
    powerNoise: 9,
    weapons: ['bazooka', 'grenade', 'shotgun'],
    caution: 0.6,
  },
  3: {
    angleStep: 160,
    powerStep: 15,
    refine: 1,
    angleNoise: 25,
    powerNoise: 5,
    weapons: ['bazooka', 'grenade', 'shotgun', 'cluster', 'punch'],
    caution: 1,
  },
  4: {
    angleStep: 120,
    powerStep: 12,
    refine: 2,
    angleNoise: 20,
    powerNoise: 5,
    weapons: ['bazooka', 'grenade', 'shotgun', 'cluster', 'mortar', 'homing', 'punch', 'dynamite'],
    caution: 1.2,
  },
  5: {
    angleStep: 100,
    powerStep: 10,
    refine: 2,
    angleNoise: 18,
    powerNoise: 4,
    weapons: [
      'bazooka',
      'grenade',
      'shotgun',
      'cluster',
      'mortar',
      'homing',
      'airstrike',
      'punch',
      'dynamite',
    ],
    caution: 1.5,
  },
};

/** A copy of a difficulty's search profile (tools and tests). */
export function botProfile(d: Difficulty): Profile {
  return { ...PROFILES[d], weapons: [...PROFILES[d].weapons] };
}

/** Weapons the search knows how to aim, tried when none of the profile's weapons can fire. */
const FALLBACK_WEAPONS: WeaponId[] = [
  'bazooka',
  'grenade',
  'cluster',
  'mortar',
  'shotgun',
  'homing',
  'airstrike',
  'punch',
  'dynamite',
];

type FireCmd = Extract<Command, { t: 'fire' }>;

interface Scored {
  cmd: FireCmd;
  score: number;
}

/** Ticks a candidate shot is simulated for at most. */
const EVAL_TICKS = 420;
const KILL_BONUS = 60;
/** Lowest score of a shot that hurts nobody (see `evaluate`: -0.001 per px of miss, capped). */
const NEAR_MISS_FLOOR = -5;

/**
 * Incremental shot search for the active unit: each `next()` simulates one candidate on a cloned
 * match, so the caller can spread the work over frames. Deterministic for the given seed.
 */
export class BotSearch {
  private readonly queue: FireCmd[] = [];
  private best: Scored | null = null;
  private refinesLeft: number;
  private readonly profile: Profile;
  private readonly rng: RngState;
  private readonly me: Unit;
  evaluated = 0;

  /**
   * @param tool Tools only (the game never passes it, so in-game shots are unaffected): `salt`
   *   adds RNG salt so the campaign balance sim can run several aim-noise seeds on one mission;
   *   `profile` replaces the difficulty's profile (the sim's fixed player stand-in).
   */
  constructor(
    private readonly s: MatchState,
    readonly difficulty: Difficulty,
    tool: { salt?: string; profile?: Profile } = {},
  ) {
    const salt = tool.salt ?? '';
    // Copy: refinement narrows the grid steps of this search only.
    this.profile = { ...(tool.profile ?? PROFILES[difficulty]) };
    this.rng = createRng(`bot:${s.seed}:${s.turnNumber}:${s.tick}${salt ? `:${salt}` : ''}`);
    this.refinesLeft = this.profile.refine;
    const me = activeUnit(s);
    if (!me) throw new Error('BotSearch: no active unit');
    this.me = me;
    this.seed();
  }

  get done(): boolean {
    return this.queue.length === 0 && this.refinesLeft === 0;
  }

  /** Evaluate one more candidate. Returns false once the search is finished. */
  next(): boolean {
    if (this.queue.length === 0) {
      if (this.refinesLeft === 0) return false;
      this.refinesLeft--;
      this.refineAround();
      if (this.queue.length === 0) return false;
    }
    const cmd = this.queue.shift() as FireCmd;
    const score = evaluate(this.s, cmd, this.me.team, this.profile.caution);
    this.evaluated++;
    if (!this.best || score > this.best.score) this.best = { cmd, score };
    return true;
  }

  /** Run the whole search synchronously (tests / headless). */
  finish(allowMiss = false): FireCmd | null {
    while (this.next());
    return this.result(allowMiss);
  }

  /**
   * The chosen shot with execution noise applied, or a skip when nothing helps. `allowMiss` fires
   * the closest near miss instead of skipping (tools only: the balance sim's player stand-in keeps
   * digging through cover like a human instead of passing forever; the game never sets it).
   */
  result(allowMiss = false): FireCmd | null {
    if (!this.best) return null;
    if (this.best.score <= 0 && !(allowMiss && this.best.score >= NEAR_MISS_FLOOR)) return null;
    const c = { ...this.best.cmd };
    const p = this.profile;
    if (c.angle !== undefined) c.angle += randInt(this.rng, 2 * p.angleNoise + 1) - p.angleNoise;
    if (c.power !== undefined) {
      c.power = Math.max(
        5,
        Math.min(100, c.power + randInt(this.rng, 2 * p.powerNoise + 1) - p.powerNoise),
      );
    }
    return c;
  }

  get bestScore(): number {
    return this.best?.score ?? -Infinity;
  }

  private enemies(): Unit[] {
    return this.s.units.filter((u) => u.alive && u.hp > 0 && u.team !== this.me.team);
  }

  private seed(): void {
    const s = this.s;
    const p = this.profile;
    const c = unitCenter(this.me);
    let usable = p.weapons.filter((w) => canFire(s, w));
    // Restricted arsenal (campaign / daily): fall back to whatever basic weapon it still has.
    if (usable.length === 0) usable = FALLBACK_WEAPONS.filter((w) => canFire(s, w)).slice(0, 2);
    const foes = this.enemies();
    for (const w of usable) {
      if (w === 'bazooka' || w === 'mortar' || w === 'grenade' || w === 'cluster') {
        for (let a = 0; a < 3600; a += p.angleStep) {
          // Shots straight down into the ground are pointless.
          if (a > 1900 && a < 3500) continue;
          for (let pw = 30; pw <= 100; pw += p.powerStep) {
            this.queue.push({
              t: 'fire',
              weapon: w,
              angle: a,
              power: pw,
              fuse: w === 'grenade' || w === 'cluster' ? 3 : undefined,
            });
          }
        }
      } else if (w === 'shotgun') {
        for (const f of foes) {
          const fc = unitCenter(f);
          const a = fatan2(c.y - fc.y, fc.x - c.x);
          for (const d of [-15, 0, 15]) this.queue.push({ t: 'fire', weapon: w, angle: a + d });
        }
      } else if (w === 'homing' || w === 'airstrike') {
        for (const f of foes) {
          const fc = unitCenter(f);
          this.queue.push({ t: 'fire', weapon: w, tx: fc.x, ty: fc.y });
        }
      } else if (w === 'punch' || w === 'dynamite') {
        const close = foes.some(
          (f) =>
            Math.abs(unitCenter(f).x - c.x) < UNIT_HIT_RADIUS * 4 &&
            Math.abs(unitCenter(f).y - c.y) < 20,
        );
        if (close) this.queue.push({ t: 'fire', weapon: w });
      }
    }
    // Shuffle a little so equal scores do not always pick the first weapon.
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = randInt(this.rng, i + 1);
      const tmp = this.queue[i] as FireCmd;
      this.queue[i] = this.queue[j] as FireCmd;
      this.queue[j] = tmp;
    }
  }

  private refineAround(): void {
    const b = this.best?.cmd;
    if (!b || b.angle === undefined || b.power === undefined) return;
    const da = Math.max(10, Math.floor(this.profile.angleStep / 3));
    const dp = Math.max(2, Math.floor(this.profile.powerStep / 3));
    for (const a of [-da, 0, da]) {
      for (const p of [-dp, 0, dp]) {
        if (a === 0 && p === 0) continue;
        this.queue.push({
          ...b,
          angle: b.angle + a,
          power: Math.max(5, Math.min(100, b.power + p)),
        });
      }
    }
    this.profile.angleStep = da;
    this.profile.powerStep = dp;
  }
}

/** Copy only what a shot simulation mutates (plain objects + terrain cells). */
function cloneForEval(s: MatchState): MatchState {
  return {
    ...s,
    config: { ...s.config },
    rng: { ...s.rng },
    terrain: cloneTerrain(s.terrain),
    teams: s.teams.map((t) => ({ ...t, ammo: { ...t.ammo } })),
    units: s.units.map((u) => ({ ...u })),
    projectiles: s.projectiles.map((p) => ({ ...p })),
    crates: s.crates.map((c) => ({ ...c })),
    teamTurns: [...s.teamTurns],
    events: [],
  };
}

/**
 * Simulate a shot to the end of its flight and score it: damage to enemies (plus a kill bonus)
 * minus weighted damage to its own team. A shot that hurts nobody scores slightly below zero by
 * how far its closest blast landed from an enemy, so near misses rank above wild ones.
 */
export function evaluate(s: MatchState, cmd: FireCmd, team: number, caution: number): number {
  const sim = cloneForEval(s);
  const before = sim.units.map((u) => (u.alive ? u.hp : 0));
  const foes = s.units.filter((u) => u.alive && u.team !== team).map(unitCenter);
  let nearest = Infinity;
  const watch = (): void => {
    for (const e of sim.events) {
      if (e.type !== 'explosion') continue;
      for (const f of foes) nearest = Math.min(nearest, Math.abs(f.x - e.x) + Math.abs(f.y - e.y));
    }
  };
  step(sim, [cmd]);
  watch();
  for (let i = 0; i < EVAL_TICKS && (sim.phase === 'firing' || sim.phase === 'aiming'); i++) {
    step(sim, sim.phase === 'aiming' && sim.shotsLeft > 0 ? [cmd] : []);
    watch();
  }
  // Let knocked-back units land (falls and drowning count).
  for (let i = 0; i < 120 && sim.units.some((u) => u.alive && !u.grounded); i++) step(sim);
  let score = 0;
  sim.units.forEach((u, i) => {
    const lost = (before[i] ?? 0) - (u.alive ? Math.max(0, u.hp) : 0);
    if (lost <= 0) return;
    const killed = (before[i] ?? 0) > 0 && (!u.alive || u.hp <= 0);
    const value = lost + (killed ? KILL_BONUS : 0);
    score += u.team === team ? -value * caution * 1.5 : value;
  });
  if (score === 0) score = -0.001 * Math.min(5000, nearest);
  return score;
}
