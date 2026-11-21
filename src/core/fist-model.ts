import type { Words } from './codec';
import type { Schedule, ToneEvent } from './schedule';

/**
 * A simulated human sender. Real operators don't send textbook timing, and
 * reading a poor "fist" is a skill of its own. Everything here is in units of
 * the sender's dit at `wpm`.
 */
export interface FistParams {
  wpm: number;
  /** Dah length in dits (textbook 3). */
  dah: number;
  /** Random timing variation, 0–0.4 (±fraction, roughly normal). */
  jitter: number;
  /**
   * Swing: every other element in a letter lands late by this many units, a
   * lilting rhythm (0 = none).
   */
  swing: number;
  /** Gap inside a letter (textbook 1). */
  elementGap: number;
  /** Gap between letters (textbook 3; under ~2 they run together). */
  letterGap: number;
  /** Gap between words (textbook 7). */
  wordGap: number;
  /** Speed at the end, relative to the start (1.2 = 20% faster by the end). */
  drift: number;
  /**
   * A semi-automatic "bug" key: dits come from a pendulum, perfectly even and
   * faster than the hand-made dahs (this many times the dit speed; 0 = off).
   */
  bug: number;
}

export const TEXTBOOK: Omit<FistParams, 'wpm'> = {
  dah: 3,
  jitter: 0,
  swing: 0,
  elementGap: 1,
  letterGap: 3,
  wordGap: 7,
  drift: 1,
  bug: 0,
};

export type FistPreset = 'textbook' | 'steady' | 'heavy' | 'rushed' | 'swing' | 'bug' | 'drifting' | 'beginner';

/** Named fists to practise against. */
export const FIST_PRESETS: Record<FistPreset, { label: string; about: string; params: Omit<FistParams, 'wpm'> }> = {
  textbook: { label: 'Textbook', about: 'Machine-perfect timing.', params: TEXTBOOK },
  steady: { label: 'Steady hand', about: 'A good operator: small, natural variation.', params: { ...TEXTBOOK, jitter: 0.08, dah: 3.1 } },
  heavy: { label: 'Heavy dahs', about: 'Long dahs and long gaps inside letters.', params: { ...TEXTBOOK, jitter: 0.1, dah: 4, elementGap: 1.4 } },
  rushed: { label: 'Rushed spacing', about: 'Letters run together; words barely separated.', params: { ...TEXTBOOK, jitter: 0.12, letterGap: 1.9, wordGap: 4.5 } },
  swing: { label: 'Swing', about: 'A lilting, uneven rhythm inside letters.', params: { ...TEXTBOOK, jitter: 0.08, swing: 0.5 } },
  bug: { label: 'Bug key', about: 'Fast, even dits from a pendulum, slower hand-made dahs.', params: { ...TEXTBOOK, jitter: 0.12, dah: 3.6, bug: 1.6 } },
  drifting: { label: 'Speeding up', about: 'Starts steady and gets faster as they go.', params: { ...TEXTBOOK, jitter: 0.08, drift: 1.4 } },
  beginner: { label: 'Beginner', about: 'Uneven everything: the fist of someone still learning.', params: { ...TEXTBOOK, jitter: 0.3, dah: 2.6, elementGap: 1.3, letterGap: 2.6, wordGap: 6 } },
};

/** Approximately normal noise in [-1, 1] from a uniform source. */
const bell = (rng: () => number) => (rng() + rng() + rng() - 1.5) / 1.5;

/**
 * Like buildSchedule, but sent by a person with the given fist. Same shape of
 * output, so the player, tape and instruments all work unchanged.
 */
export function humanSchedule(words: Words, p: FistParams, rng: () => number): Schedule {
  const events: ToneEvent[] = [];
  const letterStart: number[] = [];
  const letterEnd: number[] = [];
  const totalLetters = Math.max(1, words.reduce((a, w) => a + w.length, 0));
  const vary = (x: number) => Math.max(0.15, x * (1 + bell(rng) * p.jitter));
  let t = 0;
  let n = 0;
  words.forEach((word, wi) => {
    word.forEach((letter, li) => {
      const progress = n / totalLetters;
      const unit = 1.2 / (p.wpm * (1 + (p.drift - 1) * progress));
      letterStart.push(t);
      const m = letter.morse;
      for (let j = 0; j < m.length; j++) {
        const isDah = m[j] === '-';
        let dur: number;
        if (p.bug && !isDah) dur = unit / p.bug; // pendulum: even and fast
        else dur = vary(isDah ? p.dah : 1) * unit;
        if (p.swing && j % 2 === 1) t += p.swing * unit;
        events.push({ t0: t, t1: t + dur, wi, li, n, j });
        t += dur;
        if (j < m.length - 1) t += (p.bug && !isDah && m[j + 1] === '.' ? unit / p.bug : vary(p.elementGap) * unit);
      }
      letterEnd.push(t);
      n++;
      if (li < word.length - 1) t += vary(p.letterGap) * unit;
    });
    if (wi < words.length - 1) t += vary(p.wordGap) * (1.2 / (p.wpm * (1 + (p.drift - 1) * (n / totalLetters))));
  });
  return { events, total: t, letterStart, letterEnd };
}
