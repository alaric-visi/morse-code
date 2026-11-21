/**
 * The speed ladder: every right answer nudges the speed up, every miss drops it
 * back a little further, so it settles just above what you can comfortably copy.
 */
export interface Ladder {
  wpm: number;
  best: number;
  /** Right answers in a row. */
  run: number;
}

export interface LadderRules {
  up: number;
  down: number;
  min: number;
  max: number;
}

export const LADDER_RULES: LadderRules = { up: 1, down: 2, min: 10, max: 60 };

export const startLadder = (wpm: number): Ladder => ({ wpm, best: wpm, run: 0 });

export function climb(l: Ladder, correct: boolean, r: LadderRules = LADDER_RULES): Ladder {
  if (correct) {
    const wpm = Math.min(r.max, l.wpm + r.up);
    return { wpm, best: Math.max(l.best, wpm), run: l.run + 1 };
  }
  return { wpm: Math.max(r.min, l.wpm - r.down), best: l.best, run: 0 };
}

/** Instant character recognition: the answer counts as instant within this many seconds. */
export const ICR_WINDOW = 1;

/** The speed milestones a copy test can certify. */
export const MILESTONES = [5, 10, 15, 20, 25, 30, 40] as const;
export type Milestone = (typeof MILESTONES)[number];
/** A certificate needs a minute of copy at this accuracy. */
export const CERT_ACCURACY = 0.9;
export const CERT_SECONDS = 60;
