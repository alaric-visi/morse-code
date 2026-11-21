/**
 * Turning received audio into key-down/key-up times, for the off-air decoder.
 *
 * 1. A Goertzel filter measures the energy at the signal's pitch, block by block
 *    (a few milliseconds each). It's a single-frequency DFT bin: cheap, and
 *    naturally narrow, so it rejects most noise and neighbouring signals.
 * 2. ToneKeyer follows the noise floor and the signal peak, and keys when the
 *    level crosses a threshold between them, with hysteresis and a short
 *    glitch filter so noise spikes and fades don't chop the elements up.
 */

/** Magnitude of `freq` in samples[start, start+n), normalised to ~0–1 for a full-scale sine. */
export function goertzel(samples: ArrayLike<number>, start: number, n: number, freq: number, sampleRate: number): number {
  // Exact frequency (not rounded to a bin), so the pitch finder isn't limited to bin spacing.
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = samples[start + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return (2 * Math.sqrt(Math.max(0, power))) / n;
}

/** The strongest pitch between `lo` and `hi` Hz in a stretch of audio. */
export function strongestPitch(samples: ArrayLike<number>, sampleRate: number, lo = 300, hi = 1200, step = 10): number {
  const n = Math.min(samples.length, Math.round(sampleRate * 0.05));
  let best = lo;
  let bestMag = -1;
  for (let f = lo; f <= hi; f += step) {
    let sum = 0;
    for (let start = 0; start + n <= samples.length; start += n) sum += goertzel(samples, start, n, f, sampleRate);
    if (sum > bestMag) {
      bestMag = sum;
      best = f;
    }
  }
  return best;
}

export interface Transition {
  down: boolean;
  t: number;
}

export class ToneKeyer {
  floor = 0;
  peak = 0;
  down = false;
  /** Smoothed level: short blocks are noisy, and noise spikes mustn't key. */
  level = 0;
  private pending: { down: boolean; t: number; blocks: number } | null = null;
  private started = false;
  /** Blocks seen; nothing keys until the floor has had time to settle. */
  private seen = 0;

  constructor(
    /** Blocks a change must last to count (glitch filter). */
    private confirm = 2,
    /** Peak must be this many times the floor before anything keys. */
    private minSnr = 4,
    /** Blocks to listen before keying (~200 ms at 4 ms blocks). */
    private warmup = 50,
  ) {}

  /** Feed one block's magnitude at time t (start of the block). Returns any key transitions. */
  push(t: number, raw: number): Transition[] {
    if (!this.started) {
      this.floor = raw;
      this.peak = raw;
      this.level = raw;
      this.started = true;
    }
    const mag = (this.level = this.level * 0.5 + raw * 0.5);
    // Floor: the average noise level, learned only while no signal is present
    // (tracking the dips instead would make ordinary noise peaks look like signal).
    const spanNow = this.peak - this.floor;
    const quiet = mag < this.floor + spanNow * (this.down ? 0.3 : 0.5);
    if (quiet || this.seen < this.warmup) this.floor += (mag - this.floor) * 0.05;
    // Peak: rises at once, falls slowly back towards the floor.
    this.peak = mag > this.peak ? mag : this.peak - (this.peak - this.floor) * 0.003;
    const span = this.peak - this.floor;
    if (++this.seen < this.warmup || this.peak < this.floor * this.minSnr || span <= 0) return this.settle(t, false);
    const hi = this.floor + span * 0.5;
    const lo = this.floor + span * 0.3;
    const want = this.down ? mag > lo : mag > hi;
    return this.settle(t, want);
  }

  private settle(t: number, want: boolean): Transition[] {
    if (want === this.down) {
      this.pending = null;
      return [];
    }
    if (!this.pending || this.pending.down !== want) this.pending = { down: want, t, blocks: 0 };
    if (++this.pending.blocks < this.confirm) return [];
    this.down = want;
    const out = [{ down: want, t: this.pending.t }];
    this.pending = null;
    return out;
  }
}
