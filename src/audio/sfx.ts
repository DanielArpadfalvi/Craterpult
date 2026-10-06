// Procedural sound effects: a few oscillators / noise bursts per sound.
import { noise, tone, type Voice } from './synth';

export type SfxId =
  | 'fire'
  | 'shotgun'
  | 'explosion'
  | 'bounce'
  | 'jump'
  | 'land'
  | 'splash'
  | 'hurt'
  | 'crate'
  | 'pickup'
  | 'turn'
  | 'beep'
  | 'quake'
  | 'teleport'
  | 'girder'
  | 'win'
  | 'tap';

/** `a` is a size/intensity parameter (0..1) where meaningful. Returns the end time. */
export const SFX: Record<SfxId, (v: Voice, t: number, a: number) => number> = {
  fire(v, t) {
    noise(v, t, { peak: 0.35, decay: 0.18, filter: 'lowpass', freq: 1800, freqEnd: 300 });
    return tone(v, t, { freq: 160, freqEnd: 60, peak: 0.6, decay: 0.2 });
  },
  shotgun(v, t) {
    noise(v, t, { peak: 0.5, decay: 0.12, filter: 'bandpass', freq: 2200, q: 0.6 });
    return tone(v, t, {
      type: 'square',
      freq: 120,
      freqEnd: 50,
      peak: 0.25,
      decay: 0.1,
      cutoff: 900,
    });
  },
  explosion(v, t, a) {
    const size = 0.4 + 0.6 * a;
    noise(v, t, {
      peak: 0.55 * size,
      decay: 0.4 + 0.6 * size,
      filter: 'lowpass',
      freq: 2400,
      freqEnd: 120,
    });
    tone(v, t, { freq: 110, freqEnd: 30, peak: 0.9 * size, decay: 0.35 + 0.4 * size });
    return noise(v, t + 0.02, { peak: 0.2 * size, decay: 0.25, filter: 'highpass', freq: 3000 });
  },
  bounce(v, t) {
    return tone(v, t, { type: 'triangle', freq: 420, freqEnd: 260, peak: 0.22, decay: 0.06 });
  },
  jump(v, t) {
    return tone(v, t, {
      type: 'square',
      freq: 300,
      freqEnd: 620,
      peak: 0.08,
      decay: 0.12,
      cutoff: 2400,
    });
  },
  land(v, t, a) {
    noise(v, t, { peak: 0.08 + 0.2 * a, decay: 0.05, filter: 'bandpass', freq: 500, q: 1.2 });
    return tone(v, t, { freq: 160, freqEnd: 70, peak: 0.2 + 0.3 * a, decay: 0.08 });
  },
  splash(v, t) {
    return noise(v, t, {
      peak: 0.35,
      attack: 0.01,
      decay: 0.45,
      filter: 'bandpass',
      freq: 900,
      freqEnd: 2600,
      q: 0.8,
    });
  },
  hurt(v, t) {
    tone(v, t, { type: 'square', freq: 520, freqEnd: 330, peak: 0.08, decay: 0.12, cutoff: 1800 });
    return tone(v, t + 0.06, {
      type: 'square',
      freq: 400,
      freqEnd: 220,
      peak: 0.07,
      decay: 0.14,
      cutoff: 1600,
    });
  },
  crate(v, t) {
    return tone(v, t, { type: 'triangle', freq: 660, freqEnd: 990, peak: 0.12, decay: 0.25 });
  },
  pickup(v, t) {
    tone(v, t, { type: 'triangle', freq: 784, peak: 0.14, decay: 0.12 });
    return tone(v, t + 0.08, { type: 'triangle', freq: 1175, peak: 0.14, decay: 0.2 });
  },
  turn(v, t) {
    tone(v, t, { type: 'sine', freq: 523, peak: 0.12, decay: 0.2 });
    return tone(v, t + 0.1, { type: 'sine', freq: 784, peak: 0.12, decay: 0.3 });
  },
  beep(v, t) {
    return tone(v, t, { type: 'square', freq: 1400, peak: 0.06, decay: 0.05, cutoff: 3000 });
  },
  quake(v, t) {
    noise(v, t, { peak: 0.4, attack: 0.15, decay: 1.4, filter: 'lowpass', freq: 220 });
    return tone(v, t, { freq: 45, freqEnd: 30, peak: 0.7, attack: 0.1, decay: 1.5 });
  },
  teleport(v, t) {
    return tone(v, t, {
      type: 'sawtooth',
      freq: 200,
      freqEnd: 2400,
      peak: 0.08,
      decay: 0.35,
      cutoff: 4000,
    });
  },
  girder(v, t) {
    noise(v, t, { peak: 0.2, decay: 0.08, filter: 'bandpass', freq: 3000, q: 4 });
    return tone(v, t, { type: 'triangle', freq: 880, freqEnd: 860, peak: 0.12, decay: 0.5 });
  },
  win(v, t) {
    const notes = [523, 659, 784, 1047];
    let end = t;
    notes.forEach((f, i) => {
      end = tone(v, t + i * 0.12, {
        type: 'triangle',
        freq: f,
        peak: 0.16,
        decay: i === 3 ? 0.6 : 0.18,
      });
    });
    return end;
  },
  tap(v, t) {
    return tone(v, t, { type: 'triangle', freq: 880, peak: 0.06, decay: 0.05 });
  },
};
