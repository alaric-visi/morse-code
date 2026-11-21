import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';

export { Rating, State };
export type { Card, Grade };

/**
 * One FSRS card per thing to remember (a character today; words and prosigns
 * later). Cards are stored as JSON, so dates are revived on load.
 */
export type Cards = Record<string, Card>;

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false, maximum_interval: 180 }));

export const charCardId = (ch: string) => `c:${ch}`;

/**
 * Grade from correctness and response time (seconds after the sound ended).
 * A slow right answer means you had to work it out, so it counts as Hard.
 */
export function gradeFrom(correct: boolean, rt: number): Grade {
  if (!correct) return Rating.Again;
  if (rt > 2.5) return Rating.Hard;
  if (rt < 0.8) return Rating.Easy;
  return Rating.Good;
}

/** Start tracking an item (due straight away). Leaves existing cards alone. */
export function introduce(cards: Cards, id: string, now: Date) {
  if (!cards[id]) cards[id] = createEmptyCard(now);
}

export function review(cards: Cards, id: string, grade: Grade, now: Date) {
  const card = cards[id] ?? createEmptyCard(now);
  cards[id] = scheduler.next(card, now, grade).card;
}

/** Ids due by `now`, most overdue first. */
export function dueIds(cards: Cards, now: Date, among?: ReadonlySet<string>): string[] {
  return Object.entries(cards)
    .filter(([id, c]) => (!among || among.has(id)) && c.due.getTime() <= now.getTime())
    .sort((a, b) => a[1].due.getTime() - b[1].due.getTime())
    .map(([id]) => id);
}

/** Turn a parsed-from-JSON card back into a Card (dates revived), or null if it's junk. */
export function reviveCard(raw: unknown): Card | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const due = new Date(r.due as string);
  if (Number.isNaN(due.getTime())) return null;
  const num = (k: string) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : 0);
  const last = r.last_review ? new Date(r.last_review as string) : undefined;
  return {
    due,
    stability: num('stability'),
    difficulty: num('difficulty'),
    elapsed_days: num('elapsed_days'),
    scheduled_days: num('scheduled_days'),
    reps: num('reps'),
    lapses: num('lapses'),
    learning_steps: num('learning_steps'),
    state: num('state') as State,
    last_review: last && !Number.isNaN(last.getTime()) ? last : undefined,
  };
}
