/** Seconds for one dit, and for the gaps between letters and between words. */
export interface Timing {
  unit: number;
  letterGap: number;
  wordGap: number;
}

/**
 * - `standard`: everything at the character speed.
 * - `farnsworth`: characters at full speed; letter and word gaps both stretched.
 * - `wordsworth`: characters and letter gaps at full speed; only word gaps stretched.
 */
export type Spacing = 'standard' | 'farnsworth' | 'wordsworth';
export const SPACINGS: readonly Spacing[] = ['standard', 'farnsworth', 'wordsworth'];

export interface TimingOptions {
  /** Speed the characters themselves are sent at. */
  charWpm: number;
  /** Overall speed including the stretched gaps. Ignored for `standard`; capped at charWpm. */
  effWpm?: number;
  spacing?: Spacing;
}

export const MIN_WPM = 5;
export const MAX_WPM = 60;

/**
 * PARIS standard: one unit = 1.2 / WPM seconds, and PARIS plus a word gap is 50
 * units — 31 units of marks and intra-character gaps, 19 units of letter and word gaps.
 *
 * Both stretched modes keep the 31 "character" units at charWpm and spend the
 * rest of the 60/effWpm seconds per word on the gaps.
 */
export function timing({ charWpm, effWpm = charWpm, spacing = 'standard' }: TimingOptions): Timing {
  const c = charWpm;
  const s = Math.min(effWpm, charWpm);
  const unit = 1.2 / c;
  if (spacing === 'standard' || s >= c) {
    return { unit, letterGap: 3 * unit, wordGap: 7 * unit };
  }
  if (spacing === 'farnsworth') {
    // ARRL formula: total gap time per PARIS word, shared 12:7 between 4 letter gaps and 1 word gap.
    const ta = (60 * c - 37.2 * s) / (s * c);
    return { unit, letterGap: (3 * ta) / 19, wordGap: (7 * ta) / 19 };
  }
  // Wordsworth: PARIS is 43 units including its letter gaps; the word gap takes up the rest.
  return { unit, letterGap: 3 * unit, wordGap: 60 / s - 43 * unit };
}
