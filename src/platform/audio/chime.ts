/*
 * Pandaro's original three-note chime, synthesised with the Web Audio API.
 * No audio files are bundled. Each note is a sine with a quiet triangle overtone and a soft
 * exponential decay, like a small wooden temple bell.
 */

export type ChimeVariant = 'toBreak' | 'toFocus';

const NOTES: Record<ChimeVariant, readonly number[]> = {
  // G4 – B4 – D5, rising: focus finished, time to rest.
  toBreak: [392.0, 493.88, 587.33],
  // E5 – C5 – G4, gently falling: rest is over.
  toFocus: [659.25, 523.25, 392.0],
};

const NOTE_SPACING = 0.2;
const NOTE_LENGTH = 1.3;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class Chime {
  private ctx: AudioContext | null = null;
  private played = new Set<string>();

  constructor(private readonly makeContext: () => AudioContext | null = defaultContext) {}

  /** Call from a user gesture (Start, a settings change). Creates or resumes the context. */
  unlock(): void {
    try {
      if (!this.ctx) this.ctx = this.makeContext();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get supported(): boolean {
    return audioContextCtor() !== null;
  }

  /**
   * Play the chime once for `key` (normally the session id). Returns true if sound was scheduled.
   * `volume` is 0–1. Plays nothing when muted, at zero volume, or before a gesture unlocked audio.
   */
  play(variant: ChimeVariant, volume: number, key?: string): boolean {
    if (volume <= 0 || !this.ctx) return false;
    if (key !== undefined) {
      if (this.played.has(key)) return false;
      this.played.add(key);
      if (this.played.size > 50) this.played = new Set([...this.played].slice(-20));
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    try {
      const master = ctx.createGain();
      master.gain.value = Math.min(1, volume) * 0.35;
      master.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.05;
      NOTES[variant].forEach((freq, i) => {
        const at = t0 + i * NOTE_SPACING;
        this.note(ctx, master, freq, 'sine', at, 1);
        this.note(ctx, master, freq * 2, 'triangle', at, 0.12);
      });
      return true;
    } catch {
      return false;
    }
  }

  private note(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    type: OscillatorType,
    at: number,
    level: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH);
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + NOTE_LENGTH + 0.05);
  }
}

function defaultContext(): AudioContext | null {
  const Ctor = audioContextCtor();
  return Ctor ? new Ctor() : null;
}

export const chime = new Chime();
