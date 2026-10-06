/**
 * Campaign balance sim: plays campaign missions headless with a bot standing in for the player
 * against the mission's own enemy bot, over several aim-noise seeds per mission (`BotSearch` salt,
 * same map). The stand-ins are frozen copies of the original (QA, T8.3) level-4 (±1° aim) and
 * level-5 (±0.3°) bot profiles — both far steadier than a human — so tuning the enemy bots never
 * moves the yardstick. The stand-in fires its closest near miss instead of passing (a human would
 * dig through cover too). It never walks, so it can stall where a human would not ("T" = turn cap).
 *
 *   npm run sim:campaign                                  # chapters 1–3, player level 4, 3 seeds
 *   npm run sim:campaign -- --chapter 3 --level 4,5
 *   npm run sim:campaign -- --missions c3-02,c3-06 --seeds 5 --jobs 4
 *   npm run sim:campaign -- --min-wins 2                  # exit 1 if a mission wins < 2 seeds
 *
 * Read-only: never touches saves or game data. Results are deterministic for the same arguments.
 */
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BotSearch, type Difficulty, type Profile } from '../src/core/ai/bot';
import { MISSIONS, missionById, missionSetup, scoreMission } from '../src/core/campaign';
import { createMatch, step } from '../src/core/match';

interface Job {
  id: string;
  level: Difficulty;
  seed: number;
}

interface Result extends Job {
  won: boolean;
  /** Hit the turn cap (bots never walk, so they can stall where a human would not). */
  timeout: boolean;
  turns: number;
  stars: number;
  hpP: number;
  /** Player HP at the start (for the "HP kept" margin). */
  hpStart: number;
  hpE: number;
  ms: number;
}

/** Team turns before a match counts as a stalemate (sudden-death water has long topped out). */
const STANDIN_WEAPONS: Profile['weapons'] = [
  'bazooka',
  'grenade',
  'shotgun',
  'cluster',
  'mortar',
  'homing',
  'punch',
  'dynamite',
];
/** Player stand-ins by `--level` (only 4 and 5 are frozen; others use the live bot profile). */
const STANDINS: Partial<Record<Difficulty, Profile>> = {
  4: {
    angleStep: 120,
    powerStep: 12,
    refine: 2,
    angleNoise: 10,
    powerNoise: 3,
    weapons: STANDIN_WEAPONS,
    caution: 1.2,
  },
  5: {
    angleStep: 100,
    powerStep: 10,
    refine: 2,
    angleNoise: 3,
    powerNoise: 1,
    weapons: [...STANDIN_WEAPONS, 'airstrike'],
    caution: 1.5,
  },
};

const MAX_TURNS = 150;

function runJob({ id, level, seed }: Job): Result {
  const m = missionById(id);
  if (!m) throw new Error(`unknown mission ${id}`);
  const t0 = Date.now();
  const s = createMatch(missionSetup(m, ['P', 'A', 'B']));
  const hpStart = s.units.filter((u) => u.team === 0).reduce((a, u) => a + u.hp, 0);
  let turns = 0;
  // Read through a function: `step` mutates the phase behind TypeScript's narrowing.
  const phase = (): string => s.phase;
  while (s.phase !== 'over' && turns < MAX_TURNS) {
    if (s.phase !== 'aiming') {
      step(s, []);
      continue;
    }
    const team = s.activeTeam;
    const cmd =
      team === 0
        ? new BotSearch(s, level, { salt: `sim${seed}`, profile: STANDINS[level] }).finish(true)
        : new BotSearch(s, m.bot).finish();
    step(s, [cmd ?? { t: 'skip' }]);
    for (let i = 0; i < 3000 && s.activeTeam === team && phase() !== 'over'; i++)
      step(s, s.phase === 'aiming' && s.shotsLeft > 0 && cmd ? [cmd] : []);
    turns++;
  }
  const hp = (t: (n: number) => boolean): number =>
    s.units.filter((u) => t(u.team) && u.alive).reduce((a, u) => a + Math.max(0, u.hp), 0);
  const won = phase() === 'over' && s.winner === 0;
  return {
    id,
    level,
    seed,
    won,
    timeout: phase() !== 'over',
    turns,
    stars: won ? scoreMission(s, m) : 0,
    hpP: hp((t) => t === 0),
    hpStart,
    hpE: hp((t) => t !== 0),
    ms: Date.now() - t0,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const chapter = arg('chapter');
  const ids =
    arg('missions')?.split(',') ??
    MISSIONS.filter((m) => !chapter || chapter.split(',').includes(String(m.chapter))).map(
      (m) => m.id,
    );
  const levels = (arg('level') ?? '4').split(',').map(Number) as Difficulty[];
  const seeds = Number(arg('seeds') ?? 3);
  const jobsN = Number(arg('jobs') ?? Math.max(1, availableParallelism() - 1));
  const minWins = arg('min-wins') !== undefined ? Number(arg('min-wins')) : undefined;

  const jobs: Job[] = [];
  for (const id of ids)
    for (const level of levels)
      for (let seed = 0; seed < seeds; seed++) jobs.push({ id, level, seed });

  const results: Result[] = [];
  let next = 0;
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: Math.min(jobsN, jobs.length) }, () => {
    const child = fork(self, ['--worker'], { execArgv: process.execArgv });
    return new Promise<void>((resolve) => {
      const feed = (): void => {
        const job = jobs[next++];
        if (job) child.send(job);
        else {
          child.kill();
          resolve();
        }
      };
      child.on('message', (r: Result) => {
        results.push(r);
        process.stderr.write(
          `  ${r.id} lvl${r.level} seed${r.seed}: ${r.won ? 'WIN ' : r.timeout ? 'stall' : 'loss'} turns=${r.turns} hpP=${r.hpP} hpE=${r.hpE} (${r.ms} ms)\n`,
        );
        feed();
      });
      feed();
    });
  });
  await Promise.all(workers);

  let failed = 0;
  /** Mean share of the player's HP left after a win: the margin of victory. */
  const kept = (rs: Result[]): string => {
    const w = rs.filter((r) => r.won);
    if (!w.length) return '-';
    return `${Math.round((100 * w.reduce((a, r) => a + r.hpP / r.hpStart, 0)) / w.length)}%`;
  };
  console.log(`\nmission  bot  ${levels.map((l) => `p-lvl${l} wins  stars  kept`).join('  ')}`);
  for (const id of ids) {
    const m = missionById(id)!;
    const cols = levels.map((l) => {
      const rs = results.filter((r) => r.id === id && r.level === l);
      const wins = rs.filter((r) => r.won).length;
      if (minWins !== undefined && wins < minWins) failed++;
      const stars = rs.filter((r) => r.won).reduce((a, r) => a + r.stars, 0);
      const stalls = rs.filter((r) => r.timeout).length;
      return `${`${stalls ? `(${stalls}T) ` : ''}${wins}/${rs.length}`.padStart(9)}  ${(wins ? (stars / wins).toFixed(1) : '-').padStart(5)}  ${kept(rs).padStart(4)}`;
    });
    console.log(`${id.padEnd(8)} ${String(m.bot).padStart(3)}  ${cols.join('  ')}`);
  }
  for (const c of [1, 2, 3]) {
    const rs = results.filter((r) => missionById(r.id)!.chapter === c);
    if (!rs.length) continue;
    const parts = levels.map((l) => {
      const lr = rs.filter((r) => r.level === l);
      return `lvl${l} ${lr.filter((r) => r.won).length}/${lr.length} won, HP kept ${kept(lr)}`;
    });
    console.log(`chapter ${c}: ${parts.join(', ')}`);
  }
  if (minWins !== undefined && failed > 0) {
    console.error(`${failed} mission/level combos below ${minWins} wins`);
    process.exit(1);
  }
}

if (process.argv.includes('--worker')) {
  process.on('message', (job: Job) => process.send!(runJob(job)));
} else {
  void main();
}
