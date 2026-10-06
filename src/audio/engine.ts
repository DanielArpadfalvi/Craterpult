import { SFX, type SfxId } from './sfx';

/**
 * Minimal Web Audio engine: lazily created on the first user gesture, safe no-op when Web Audio is
 * missing, with a voice cap and per-sound throttling so a napalm shower does not clip.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private muted = false;
  private readonly last = new Map<SfxId, number>();
  private active = 0;

  /** Call from a user gesture (iOS / Chrome autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const g = globalThis as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = g.AudioContext ?? g.webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.8;
      this.out.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.out && this.ctx)
      this.out.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  play(id: SfxId, a = 0.5): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -1) < 0.04 || this.active > 24) return;
    this.last.set(id, now);
    this.active++;
    const end = SFX[id]({ ctx, out }, now + 0.005, Math.min(1, Math.max(0, a)));
    setTimeout(() => this.active--, Math.max(0, (end - now) * 1000));
  }
}
