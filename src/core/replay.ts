import { createMatch, step, type MatchSetup } from './match';
import type { Command, MatchState } from './types';

/** One recorded command and the tick (1-based, as `step` numbers them) it was applied on. */
export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

/** Records every command passed through `stepLogged` so a match can be replayed. */
export interface Recorder {
  setup: MatchSetup;
  log: LoggedCommand[];
}

export function createRecorder(setup: MatchSetup): Recorder {
  return { setup, log: [] };
}

export function stepLogged(s: MatchState, rec: Recorder, commands: readonly Command[] = []): void {
  for (const cmd of commands) rec.log.push({ tick: s.tick + 1, cmd });
  step(s, commands);
}

/** Rebuild a match from its setup and command log, stepping until `untilTick`. */
export function replay(
  setup: MatchSetup,
  log: readonly LoggedCommand[],
  untilTick: number,
): MatchState {
  const s = createMatch(setup);
  let i = 0;
  while (s.tick < untilTick && s.phase !== 'over') {
    const next = s.tick + 1;
    const cmds: Command[] = [];
    while (i < log.length && (log[i] as LoggedCommand).tick === next)
      cmds.push((log[i++] as LoggedCommand).cmd);
    step(s, cmds);
  }
  return s;
}

/** FNV-1a hash of everything that defines the simulation (not the per-tick event list). */
export function hashState(s: MatchState): string {
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    // Fold the number in 32-bit halves so large fixed values hash exactly.
    const lo = n >>> 0;
    const hi = Math.floor(n / 4294967296) >>> 0;
    for (const w of [lo, hi]) {
      for (let k = 0; k < 4; k++) {
        h ^= (w >>> (k * 8)) & 0xff;
        h = Math.imul(h, 0x01000193);
      }
    }
  };
  mix(s.tick);
  mix(s.wind);
  mix(s.activeTeam);
  mix(s.activeUnit);
  mix(s.turnNumber);
  mix(s.turnTicksLeft);
  mix(s.phaseTicks);
  mix(s.shotsLeft);
  mix(['aiming', 'firing', 'retreat', 'settling', 'over'].indexOf(s.phase));
  mix(s.rng.a);
  mix(s.rng.b);
  mix(s.rng.c);
  mix(s.rng.d);
  for (const u of s.units) {
    mix(u.x);
    mix(u.y);
    mix(u.vx);
    mix(u.vy);
    mix(u.hp);
    mix(u.alive ? 1 : 0);
    mix(u.grounded ? 1 : 0);
    mix(u.facing);
  }
  for (const p of s.projectiles) {
    mix(p.id);
    mix(p.x);
    mix(p.y);
    mix(p.vx);
    mix(p.vy);
    mix(p.fuse);
  }
  for (const t of s.teams)
    for (const k of Object.keys(t.ammo).sort()) mix(t.ammo[k as keyof typeof t.ammo]);
  const cells = s.terrain.cells;
  for (let i = 0; i < cells.length; i++) {
    h ^= cells[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
