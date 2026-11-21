/** Per-character counters and the confusion matrix. All plain data (JSON-safe). */

export interface CharStat {
  seen: number;
  correct: number;
  /** Rolling accuracy over recent answers, 0–1 (EMA, so it follows improvement). */
  recent: number;
  /** Sum of response times for correct recognitions, seconds. */
  rtSum: number;
  rtCount: number;
}

export type Stats = Record<string, CharStat>;
/** confusion[sent][heard] = times `sent` was taken for `heard`. */
export type Confusion = Record<string, Record<string, number>>;

const EMA = 0.25;

export const emptyStat = (): CharStat => ({ seen: 0, correct: 0, recent: 0, rtSum: 0, rtCount: 0 });

/** Record one answer for `ch`. `heard` is what the learner gave (null for a miss). */
export function record(stats: Stats, confusion: Confusion, ch: string, heard: string | null, rt?: number): void {
  const s = (stats[ch] ??= emptyStat());
  const ok = heard === ch;
  s.recent = s.seen === 0 ? (ok ? 1 : 0) : s.recent * (1 - EMA) + (ok ? 1 : 0) * EMA;
  s.seen++;
  if (ok) {
    s.correct++;
    if (rt !== undefined && Number.isFinite(rt)) {
      s.rtSum += Math.max(0, rt);
      s.rtCount++;
    }
  } else if (heard) {
    const row = (confusion[ch] ??= {});
    row[heard] = (row[heard] ?? 0) + 1;
  }
}

/**
 * Mastery 0–4 for colouring: 0 not yet seen, then by recent accuracy and how much
 * practice backs it up.
 */
export function mastery(s: CharStat | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!s || s.seen === 0) return 0;
  if (s.recent >= 0.95 && s.seen >= 20) return 4;
  if (s.recent >= 0.9 && s.seen >= 8) return 3;
  if (s.recent >= 0.7) return 2;
  return 1;
}

/** The most frequent mix-ups, largest first: [sent, heard, count]. */
export function topConfusions(confusion: Confusion, limit = 8): [string, string, number][] {
  const all: [string, string, number][] = [];
  for (const [sent, row] of Object.entries(confusion)) for (const [heard, n] of Object.entries(row)) all.push([sent, heard, n]);
  return all.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0])).slice(0, limit);
}

/** How strongly `a` and `b` get mixed up, either way round. */
export const confusionBetween = (c: Confusion, a: string, b: string) => (c[a]?.[b] ?? 0) + (c[b]?.[a] ?? 0);

// ------------------------------------------------------------------ days and streaks

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const prevDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
};

/** Consecutive practice days ending today (or yesterday, so the streak survives until you practise). */
export function streak(days: readonly string[], today: Date): number {
  const set = new Set(days);
  let key = dayKey(today);
  if (!set.has(key)) key = prevDay(key);
  let n = 0;
  while (set.has(key)) {
    n++;
    key = prevDay(key);
  }
  return n;
}
