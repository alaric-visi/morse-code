import type { DecodedLetter, DecoderEvent, Mark } from './decoder';

/**
 * A "fist" report: how evenly someone keys. Every figure is in units of the
 * sender's own dit length, fitted from their marks, so it judges rhythm rather
 * than speed. Targets: dah = 3, gap inside a letter = 1, between letters = 3,
 * between words = 7.
 */
export interface Fist {
  /** Fitted dit length, seconds, and the speed it implies. */
  unit: number;
  wpm: number;
  /** Mean dah ÷ mean dit (target 3). */
  dahRatio: number;
  /** Gaps in units (target 1 / 3 / 7); null when there were none. */
  elementGap: number;
  letterGap: number | null;
  wordGap: number | null;
  /** How even the timing is: coefficient of variation (0 = perfectly even). */
  ditSpread: number;
  dahSpread: number;
  gapSpread: number;
  /** Speed at the start and end, and the change between them (+0.2 = 20% faster). */
  wpmStart: number;
  wpmEnd: number;
  drift: number;
  /** 0–100, higher is better. */
  score: number;
  marks: number;
}

export const MIN_FIST_MARKS = 12;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);
const cv = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
};

/** Least-squares dit length: durations ≈ k·unit with k = 1 (dit) or 3 (dah). */
export function fitUnit(items: { d: number; k: number }[]): number {
  const num = sum(items.map((i) => i.d * i.k));
  const den = sum(items.map((i) => i.k * i.k));
  return den ? num / den : NaN;
}

interface Timed {
  letter: DecodedLetter;
  /** Whether a word break came before this letter. */
  newWord: boolean;
}

export function analyseFist(events: readonly DecoderEvent[]): Fist | null {
  const letters: Timed[] = [];
  let newWord = true;
  for (const e of events) {
    if (e.kind === 'space') newWord = true;
    else if (e.marks.length === e.code.length && e.marks.length) {
      letters.push({ letter: e, newWord });
      newWord = false;
    }
  }
  const items = letters.flatMap(({ letter }) => letter.marks.map((m, i) => ({ d: m.t1 - m.t0, k: letter.code[i] === '-' ? 3 : 1 })));
  if (items.length < MIN_FIST_MARKS) return null;
  const unit = fitUnit(items);
  const dits = items.filter((i) => i.k === 1).map((i) => i.d);
  const dahs = items.filter((i) => i.k === 3).map((i) => i.d);

  const intra: number[] = [];
  const letterGaps: number[] = [];
  const wordGaps: number[] = [];
  let prevEnd: number | null = null;
  for (const { letter, newWord: nw } of letters) {
    const ms: Mark[] = letter.marks;
    if (prevEnd !== null) (nw ? wordGaps : letterGaps).push(ms[0].t0 - prevEnd);
    for (let i = 1; i < ms.length; i++) intra.push(ms[i].t0 - ms[i - 1].t1);
    prevEnd = ms[ms.length - 1].t1;
  }

  // Speed at the start and end: fit the first and last third of the marks separately.
  const third = Math.max(4, Math.floor(items.length / 3));
  const uStart = fitUnit(items.slice(0, third));
  const uEnd = fitUnit(items.slice(-third));
  const wpmStart = 1.2 / uStart;
  const wpmEnd = 1.2 / uEnd;
  const drift = (wpmEnd - wpmStart) / wpmStart;

  const dahRatio = dits.length && dahs.length ? mean(dahs) / mean(dits) : 3;
  const elementGap = intra.length ? mean(intra) / unit : 1;
  const ditSpread = cv(dits);
  const dahSpread = cv(dahs);
  const gapSpread = cv(intra);

  // Each penalty is capped, so one weakness can't zero the score on its own.
  const penalty =
    Math.min(30, Math.abs(dahRatio - 3) * 20) +
    Math.min(20, Math.abs(elementGap - 1) * 25) +
    Math.min(30, ((ditSpread + dahSpread + gapSpread) / 3) * 120) +
    Math.min(20, Math.abs(drift) * 60);

  return {
    unit,
    wpm: 1.2 / unit,
    dahRatio,
    elementGap,
    letterGap: letterGaps.length ? mean(letterGaps) / unit : null,
    wordGap: wordGaps.length ? mean(wordGaps) / unit : null,
    ditSpread,
    dahSpread,
    gapSpread,
    wpmStart,
    wpmEnd,
    drift,
    score: Math.max(0, Math.round(100 - penalty)),
    marks: items.length,
  };
}

export interface ElementCompare {
  kind: 'dit' | 'dah' | 'gap';
  /** Ideal and actual length, in units. */
  ideal: number;
  actual: number;
}

/**
 * One letter element by element against its ideal timing, in units of `unit`
 * (normally the sender's fitted unit, so a slow-but-even sender scores well).
 */
export function compareLetter(letter: DecodedLetter, unit: number, targetCode = letter.code): ElementCompare[] {
  const out: ElementCompare[] = [];
  const n = Math.min(letter.marks.length, targetCode.length);
  for (let i = 0; i < n; i++) {
    if (i) out.push({ kind: 'gap', ideal: 1, actual: (letter.marks[i].t0 - letter.marks[i - 1].t1) / unit });
    const m = letter.marks[i];
    out.push({ kind: targetCode[i] === '-' ? 'dah' : 'dit', ideal: targetCode[i] === '-' ? 3 : 1, actual: (m.t1 - m.t0) / unit });
  }
  return out;
}
