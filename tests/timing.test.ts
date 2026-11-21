import { describe, expect, it } from 'vitest';
import { encodeText } from '../src/core/codec';
import { timing, type Spacing } from '../src/core/timing';
import { buildSchedule, elementsStarted, eventIndexAt, fmtClock, fmtDuration, isKeyDown, letterAt } from '../src/core/schedule';

const sched = (text: string, charWpm: number, spacing: Spacing = 'standard', effWpm?: number) =>
  buildSchedule(encodeText(text).words, timing({ charWpm, effWpm, spacing }));
const total = (...a: Parameters<typeof sched>) => sched(...a).total;
/** Seconds one PARIS word takes, including its word gap. */
const paris = (...a: [number, Spacing?, number?]) => total('PARIS PARIS', ...a) - total('PARIS', ...a);

describe('timing', () => {
  it('uses one unit = 1.2 / WPM', () => {
    expect(timing({ charWpm: 20 })).toEqual({ unit: 0.06, letterGap: 0.18, wordGap: 0.42 });
  });

  it('stretched modes do nothing when effective ≥ character speed', () => {
    for (const spacing of ['farnsworth', 'wordsworth'] as const) {
      expect(timing({ charWpm: 18, effWpm: 18, spacing })).toEqual(timing({ charWpm: 18 }));
      expect(timing({ charWpm: 18, effWpm: 25, spacing })).toEqual(timing({ charWpm: 18 }));
    }
  });

  it('standard ignores the effective speed', () => {
    expect(timing({ charWpm: 20, effWpm: 5 })).toEqual(timing({ charWpm: 20 }));
  });

  it('matches the legacy Farnsworth (18 WPM characters)', () => {
    const t = timing({ charWpm: 18, effWpm: 10, spacing: 'farnsworth' });
    const ta = (60 * 18 - 37.2 * 10) / (10 * 18);
    expect(t.unit).toBeCloseTo(1.2 / 18);
    expect(t.letterGap).toBeCloseTo((3 * ta) / 19);
    expect(t.wordGap).toBeCloseTo((7 * ta) / 19);
  });

  it('Wordsworth keeps letter gaps at 3 units', () => {
    const t = timing({ charWpm: 25, effWpm: 10, spacing: 'wordsworth' });
    expect(t.letterGap).toBeCloseTo(3 * t.unit);
    expect(t.wordGap).toBeGreaterThan(7 * t.unit);
  });
});

describe('every spacing hits its overall speed', () => {
  it.each([5, 10, 15, 20, 30, 60])('standard %i WPM', (wpm) => expect(paris(wpm)).toBeCloseTo(60 / wpm));
  it.each([
    [18, 5], [18, 10], [25, 12], [40, 20],
  ])('farnsworth %i/%i WPM', (c, s) => expect(paris(c, 'farnsworth', s)).toBeCloseTo(60 / s));
  it.each([
    [18, 5], [20, 10], [30, 15],
  ])('wordsworth %i/%i WPM', (c, s) => expect(paris(c, 'wordsworth', s)).toBeCloseTo(60 / s));
});

describe('buildSchedule', () => {
  it('PARIS is 43 units on its own', () => {
    expect(total('PARIS', 20)).toBeCloseTo(43 * 0.06);
  });

  it('times dits, dahs and gaps, and indexes letters', () => {
    const s = sched('A E', 12);
    const u = 0.1;
    const shape = s.events.map((e) => [+(e.t0 / u).toFixed(6), +(e.t1 / u).toFixed(6), e.wi, e.li, e.n, e.j]);
    expect(shape).toEqual([[0, 1, 0, 0, 0, 0], [2, 5, 0, 0, 0, 1], [12, 13, 1, 0, 1, 0]]);
    expect(s.total / u).toBeCloseTo(13);
    expect(s.letterStart.map((t) => +(t / u).toFixed(6))).toEqual([0, 12]);
    expect(s.letterEnd.map((t) => +(t / u).toFixed(6))).toEqual([5, 13]);
  });

  it('sends a prosign with no letter gaps', () => {
    // SK = ...-.- : 3 dits + dah + dit + dah = 3+3+1+3 + 5 gaps = 15 units
    expect(total('<SK>', 12) / 0.1).toBeCloseTo(15);
  });

  it('skips letters with no code but keeps their gaps', () => {
    const s = sched('E%E', 12);
    expect(s.events.map((e) => e.n)).toEqual([0, 2]);
    expect(s.total / 0.1).toBeCloseTo(1 + 3 + 3 + 1);
  });

  it('has no events when nothing can be sent', () => {
    expect(sched('%%', 20).events).toEqual([]);
    expect(buildSchedule([], timing({ charWpm: 20 })).total).toBe(0);
  });
});

describe('position lookups', () => {
  const s = sched('A E', 12); // A dit 0–0.1, dah 0.2–0.5; E dit 1.2–1.3
  it('eventIndexAt', () => {
    expect(eventIndexAt(s.events, 0)).toBe(0);
    expect(eventIndexAt(s.events, 0.1)).toBe(1);
    expect(eventIndexAt(s.events, 0.7)).toBe(2);
    expect(eventIndexAt(s.events, 2)).toBe(3);
  });
  it('isKeyDown', () => {
    expect(isKeyDown(s.events, 0.05)).toBe(true);
    expect(isKeyDown(s.events, 0.15)).toBe(false);
    expect(isKeyDown(s.events, 1.25)).toBe(true);
    expect(isKeyDown(s.events, 9)).toBe(false);
  });
  it('elementsStarted', () => {
    expect(elementsStarted(s.events, 0.05)).toBe(1);
    expect(elementsStarted(s.events, 0.15)).toBe(1);
    expect(elementsStarted(s.events, 0.3)).toBe(2);
    expect(elementsStarted(s.events, 0.7)).toBe(0); // gap before E
    expect(elementsStarted(s.events, 1.25)).toBe(1);
  });
  it('letterAt', () => {
    expect(letterAt(s, 0.3)).toBe(0);
    expect(letterAt(s, 0.7)).toBe(1);
    expect(letterAt(s, 9)).toBe(-1);
  });
});

describe('formatting', () => {
  it.each([
    [4.24, '4.2 s'], [9.96, '10.0 s'], [12.4, '12 s'], [59.4, '59 s'],
    [59.6, '1 min 0 s'], [119.6, '2 min 0 s'], [125, '2 min 5 s'],
  ])('fmtDuration %f → %s', (s, out) => expect(fmtDuration(s)).toBe(out));
  it.each([[0, '0:00'], [7.9, '0:07'], [65, '1:05'], [-1, '0:00']])('fmtClock %f → %s', (s, out) =>
    expect(fmtClock(s)).toBe(out));
});
