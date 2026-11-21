import { charForCode, type CodecOptions } from '../codec';

/** One key-down, in seconds on whatever clock the caller uses. */
export interface Mark {
  t0: number;
  t1: number;
}

export interface DecodedLetter {
  kind: 'letter';
  /** Dots and dashes as classified. */
  code: string;
  /** The character, or '' when the code isn't one. */
  ch: string;
  marks: Mark[];
  /** Dit length the decoder believed in when it finished this letter, seconds. */
  unit: number;
}
export interface DecodedSpace {
  kind: 'space';
}
export type DecoderEvent = DecodedLetter | DecodedSpace;

/** Gaps shorter than this many units are inside a letter. */
export const LETTER_GAP = 2.2;
/** Gaps at least this many units long end a word. */
export const WORD_GAP = 5;
const HISTORY = 24;

/**
 * Turns key timing into text, following the sender's own speed.
 *
 * Each mark is a dit or a dah by comparison with 2 units; the unit then moves
 * towards what that mark implies. When recent marks fall into two clear groups,
 * a two-means split of them corrects the estimate quickly, which is how it keeps
 * up when someone speeds up or slows down. Gaps are read against the same unit.
 */
export class AdaptiveDecoder {
  unit: number;
  private marks: Mark[] = [];
  private code = '';
  private downAt: number | null = null;
  private lastUp: number | null = null;
  private letterDone = true;
  private spaceDone = true;
  private recent: number[] = [];

  constructor(
    wpm = 15,
    private opts: CodecOptions = {},
  ) {
    this.unit = 1.2 / wpm;
  }

  get wpm() {
    return 1.2 / this.unit;
  }

  /** The letter being keyed right now, as dots and dashes. */
  get pending() {
    return this.code;
  }

  keyDown(t: number): DecoderEvent[] {
    const out = this.closeGap(t);
    this.downAt = t;
    return out;
  }

  keyUp(t: number): DecoderEvent[] {
    if (this.downAt === null) return [];
    const mark = { t0: this.downAt, t1: t };
    this.downAt = null;
    this.addMarkInternal(mark);
    return [];
  }

  /** A complete mark (from a keyer that reports elements). */
  addMark(t0: number, t1: number): DecoderEvent[] {
    const out = this.closeGap(t0);
    this.addMarkInternal({ t0, t1 });
    return out;
  }

  /** Call regularly while idle: finishes the letter (and word) once the silence is long enough. */
  tick(now: number): DecoderEvent[] {
    if (this.downAt !== null || this.lastUp === null) return [];
    const gap = now - this.lastUp;
    const out: DecoderEvent[] = [];
    if (!this.letterDone && gap >= LETTER_GAP * this.unit) out.push(this.finishLetter());
    if (!this.spaceDone && gap >= WORD_GAP * this.unit) {
      this.spaceDone = true;
      out.push({ kind: 'space' });
    }
    return out;
  }

  /** End of input: finish whatever is pending. */
  flush(): DecoderEvent[] {
    return this.letterDone ? [] : [this.finishLetter()];
  }

  reset(wpm = this.wpm) {
    this.unit = 1.2 / wpm;
    this.marks = [];
    this.code = '';
    this.downAt = null;
    this.lastUp = null;
    this.letterDone = true;
    this.spaceDone = true;
    this.recent = [];
  }

  // ------------------------------------------------------------------ internals

  private closeGap(t: number): DecoderEvent[] {
    const out: DecoderEvent[] = [];
    if (this.lastUp === null) return out;
    const gap = t - this.lastUp;
    if (!this.letterDone && gap >= LETTER_GAP * this.unit) out.push(this.finishLetter());
    if (!this.spaceDone && gap >= WORD_GAP * this.unit) out.push({ kind: 'space' });
    this.spaceDone = true;
    return out;
  }

  private addMarkInternal(mark: Mark) {
    const d = mark.t1 - mark.t0;
    if (d <= 0) return;
    const isDah = d >= 2 * this.unit;
    this.code += isDah ? '-' : '.';
    this.marks.push(mark);
    this.lastUp = mark.t1;
    this.letterDone = false;
    this.spaceDone = false;
    this.learn(d, isDah);
  }

  private learn(d: number, isDah: boolean) {
    // Nudge towards what this mark says the unit is, ignoring wild outliers.
    const implied = isDah ? d / 3 : d;
    const clamped = Math.min(2 * this.unit, Math.max(0.5 * this.unit, implied));
    this.unit = this.unit * 0.8 + clamped * 0.2;

    this.recent.push(d);
    if (this.recent.length > HISTORY) this.recent.shift();
    const split = twoMeans(this.recent);
    if (split) {
      const [dits, dahs] = split;
      const ratio = mean(dahs) / mean(dits);
      if (ratio >= 2 && ratio <= 5) {
        const fitted = (sum(dits) + sum(dahs) / 3) / (dits.length + dahs.length);
        this.unit = 0.5 * this.unit + 0.5 * fitted;
      }
    }
  }

  private finishLetter(): DecodedLetter {
    const letter: DecodedLetter = {
      kind: 'letter',
      code: this.code,
      ch: charForCode(this.code, this.opts),
      marks: this.marks,
      unit: this.unit,
    };
    this.code = '';
    this.marks = [];
    this.letterDone = true;
    return letter;
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;

/** Split durations into short and long groups (1-D two-means). Null if there's only one group. */
export function twoMeans(xs: number[]): [number[], number[]] | null {
  if (xs.length < 4) return null;
  let lo = Math.min(...xs);
  let hi = Math.max(...xs);
  if (hi < lo * 1.6) return null;
  let a: number[] = [];
  let b: number[] = [];
  for (let iter = 0; iter < 8; iter++) {
    const mid = (lo + hi) / 2;
    a = xs.filter((x) => x < mid);
    b = xs.filter((x) => x >= mid);
    if (!a.length || !b.length) return null;
    const nlo = mean(a);
    const nhi = mean(b);
    if (nlo === lo && nhi === hi) break;
    lo = nlo;
    hi = nhi;
  }
  return [a, b];
}
