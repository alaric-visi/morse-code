import koch from '../../content/courses/koch.json';
import { charToMorse } from '../core/codec';

/** Characters in the order the course teaches them. */
export const KOCH: readonly string[] = koch.order;
/** Lesson 1 starts with two characters; each later lesson adds one. */
export const START_LEVEL = 2;
export const MAX_LEVEL = KOCH.length;
export const LAST_LESSON = MAX_LEVEL - 1;

/** Characters known at a level (level = how many are unlocked). */
export function charsAt(level: number): string[] {
  return KOCH.slice(0, clampLevel(level));
}

export const clampLevel = (level: number) => Math.min(MAX_LEVEL, Math.max(START_LEVEL, Math.round(level) || START_LEVEL));

/** Lesson number for a level: lesson 1 = 2 characters, lesson 40 = all 41. */
export const lessonOf = (level: number) => clampLevel(level) - 1;

/** The character a level's lesson introduces (both K and M for lesson 1). */
export function newCharsAt(level: number): string[] {
  const l = clampLevel(level);
  return l === START_LEVEL ? KOCH.slice(0, START_LEVEL) : [KOCH[l - 1]];
}

/** Spoken rhythm: K → "dah-di-dah", E → "dit". Final dits keep their t. */
export function rhythm(code: string): string {
  return Array.from(code, (m, i) => (m === '-' ? 'dah' : i === code.length - 1 ? 'dit' : 'di')).join('-');
}

export const codeOf = (ch: string) => charToMorse[ch] ?? '';
