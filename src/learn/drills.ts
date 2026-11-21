import { codeOf } from './koch';
import { confusionBetween, type Confusion, type Stats } from './stats';
import { shuffle, weightedPick, type Rng } from './random';

// ------------------------------------------------------------------ recognise

export interface Question {
  answer: string;
  choices: string[];
}

/** Edit distance between two codes: how alike two characters sound. */
export function codeDistance(a: string, b: string): number {
  const x = codeOf(a);
  const y = codeOf(b);
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length][y.length];
}

/**
 * A "which one was that?" question. Wrong answers are chosen to be useful:
 * characters that sound alike, and ones this learner actually mixes up.
 */
export function makeQuestion(answer: string, pool: readonly string[], confusion: Confusion, rng: Rng, n = 4): Question {
  const others = pool.filter((c) => c !== answer);
  const distractors: string[] = [];
  const candidates = [...others];
  while (distractors.length < Math.min(n - 1, others.length)) {
    const pick = weightedPick(
      candidates,
      (c) => 1 + 6 * confusionBetween(confusion, answer, c) + 4 / (1 + codeDistance(answer, c)),
      rng,
    );
    distractors.push(pick);
    candidates.splice(candidates.indexOf(pick), 1);
  }
  return { answer, choices: shuffle([answer, ...distractors], rng) };
}

/**
 * Which character to ask next: the newest ones and the weak ones come up more.
 * `newChars` get a boost so a fresh character gets plenty of practice.
 */
export function pickTarget(pool: readonly string[], newChars: readonly string[], stats: Stats, rng: Rng, avoid?: string): string {
  const candidates = pool.length > 1 && avoid ? pool.filter((c) => c !== avoid) : pool;
  return weightedPick(
    candidates,
    (c) => {
      const s = stats[c];
      const weak = s && s.seen ? 1 - s.recent : 1;
      return 1 + 3 * weak + (newChars.includes(c) ? 3 : 0);
    },
    rng,
  );
}

// ------------------------------------------------------------------ copy

/** Random five-character groups, weighted towards new and weak characters. */
export function makeGroups(pool: readonly string[], newChars: readonly string[], stats: Stats, count: number, rng: Rng, size = 5): string[] {
  return Array.from({ length: count }, () => {
    let g = '';
    let last: string | undefined;
    for (let i = 0; i < size; i++) {
      last = pickTarget(pool, newChars, stats, rng, pool.length > 2 ? last : undefined);
      g += last;
    }
    return g;
  });
}

export type Mark = 'ok' | 'wrong' | 'missed';

export interface CopyResult {
  /** One mark per sent character, in order (spaces between groups not included). */
  marks: { sent: string; got: string | null; mark: Mark }[];
  /** Extra characters typed that matched nothing. */
  extra: number;
  correct: number;
  total: number;
  /** Right ÷ (sent + extra typed), so guessing extra characters can't pad the score. */
  accuracy: number;
}

const clean = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/**
 * Grade typed copy against what was sent, aligning the two so one dropped
 * character doesn't make everything after it "wrong".
 */
export function gradeCopy(sent: string, typed: string): CopyResult {
  const a = Array.from(clean(sent));
  const b = Array.from(clean(typed));
  const n = a.length;
  const m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));

  const marks: CopyResult['marks'] = [];
  let extra = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      marks.push({ sent: a[i - 1], got: b[j - 1], mark: a[i - 1] === b[j - 1] ? 'ok' : 'wrong' });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      marks.push({ sent: a[i - 1], got: null, mark: 'missed' });
      i--;
    } else {
      extra++;
      j--;
    }
  }
  marks.reverse();
  const correct = marks.filter((x) => x.mark === 'ok').length;
  return { marks, extra, correct, total: n, accuracy: n ? correct / (n + extra) : 0 };
}

/** Accuracy needed on a copy drill to unlock the next character. */
export const PASS_ACCURACY = 0.9;
/** …and the least copy it must be measured on, so a lucky few characters don't count. */
export const MIN_COPY_CHARS = 20;

export const passes = (r: CopyResult) => r.total >= MIN_COPY_CHARS && r.accuracy >= PASS_ACCURACY;
