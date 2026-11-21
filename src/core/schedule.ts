import type { Words } from './codec';
import type { Timing } from './timing';

/** One key-down: a dit or dah from t0 to t1 (seconds), belonging to letter `n`. */
export interface ToneEvent {
  t0: number;
  t1: number;
  /** Word and letter index, and the letter's index across the whole message. */
  wi: number;
  li: number;
  n: number;
  /** Which element of its letter this is (0 = first dit/dah). */
  j: number;
}

export interface Schedule {
  events: ToneEvent[];
  /** Seconds from the first key-down to the last key-up. */
  total: number;
  /** Start time of every letter, by flat index (letters with no code get their slot time). */
  letterStart: number[];
  /** End time of every letter, by flat index. */
  letterEnd: number[];
}

/** Turn words into timed tone events. Letters with no code produce no tones. */
export function buildSchedule(words: Words, { unit, letterGap, wordGap }: Timing): Schedule {
  const events: ToneEvent[] = [];
  const letterStart: number[] = [];
  const letterEnd: number[] = [];
  let t = 0;
  let n = 0;
  words.forEach((word, wi) => {
    word.forEach((letter, li) => {
      const m = letter.morse;
      letterStart.push(t);
      for (let j = 0; j < m.length; j++) {
        const dur = m[j] === '.' ? unit : 3 * unit;
        events.push({ t0: t, t1: t + dur, wi, li, n, j });
        t += dur;
        if (j < m.length - 1) t += unit;
      }
      letterEnd.push(t);
      n++;
      if (li < word.length - 1) t += letterGap;
    });
    if (wi < words.length - 1) t += wordGap;
  });
  return { events, total: t, letterStart, letterEnd };
}

/** Index of the first event that hasn't finished by `pos` (events.length if none). */
export function eventIndexAt(events: readonly ToneEvent[], pos: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t1 <= pos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Flat index of the letter being sent (or next to be sent) at `pos`; -1 when finished. */
export function letterAt(schedule: Schedule, pos: number): number {
  const e = schedule.events[eventIndexAt(schedule.events, pos)];
  return e ? e.n : -1;
}

/** Is a tone sounding at `pos`? */
export function isKeyDown(events: readonly ToneEvent[], pos: number): boolean {
  const e = events[eventIndexAt(events, pos)];
  return !!e && pos >= e.t0 && pos < e.t1;
}

/**
 * How many elements of the current letter have started by `pos` (0 in the gap
 * before a letter). With letterAt, this drives element-by-element highlighting.
 */
export function elementsStarted(events: readonly ToneEvent[], pos: number): number {
  const e = events[eventIndexAt(events, pos)];
  if (!e) return 0;
  return e.j + (pos >= e.t0 ? 1 : 0);
}

/** "4.2 s", "37 s", "2 min 5 s". Rounds to whole seconds first so it never says "1 min 60 s". */
export function fmtDuration(s: number): string {
  if (s < 10) return `${s.toFixed(1)} s`;
  const whole = Math.round(s);
  if (whole < 60) return `${whole} s`;
  return `${Math.floor(whole / 60)} min ${whole % 60} s`;
}

/** "0:07", "12:30" — for the transport clock. */
export function fmtClock(s: number): string {
  const whole = Math.max(0, Math.floor(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
