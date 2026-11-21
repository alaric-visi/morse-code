import { describe, expect, it } from 'vitest';
import { charToMorse } from '../src/core/codec';
import { KOCH, MAX_LEVEL, START_LEVEL, charsAt, lessonOf, newCharsAt, rhythm } from '../src/learn/koch';
import { codeDistance, gradeCopy, makeGroups, makeQuestion, passes, pickTarget } from '../src/learn/drills';
import { seeded } from '../src/learn/random';
import { dueIds, gradeFrom, introduce, Rating, review, type Cards } from '../src/learn/srs';
import { dayKey, mastery, record, streak, topConfusions, type Confusion, type Stats } from '../src/learn/stats';
import { addSession, emptyProgress, exportProgress, importProgress, sanitizeProgress } from '../src/learn/progress';
import { parseMarkdown, titleOf } from '../src/learn/markdown';
import { CARDS } from '../src/learn/cards';

describe('Koch order', () => {
  it('covers all 26 letters and 10 digits exactly once, plus punctuation', () => {
    expect(new Set(KOCH).size).toBe(KOCH.length);
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') expect(KOCH).toContain(c);
    for (const c of KOCH) expect(charToMorse[c]).toBeDefined();
  });
  it('levels and lessons', () => {
    expect(charsAt(START_LEVEL)).toEqual(['K', 'M']);
    expect(lessonOf(2)).toBe(1);
    expect(lessonOf(MAX_LEVEL)).toBe(40);
    expect(newCharsAt(2)).toEqual(['K', 'M']);
    expect(newCharsAt(3)).toEqual(['U']);
    expect(charsAt(0)).toEqual(['K', 'M']); // clamped
  });
  it('rhythm reads codes as syllables', () => {
    expect(rhythm('-.-')).toBe('dah-di-dah');
    expect(rhythm('.')).toBe('dit');
    expect(rhythm('...')).toBe('di-di-dit');
    expect(rhythm('.-')).toBe('di-dah');
  });
});

describe('recognise questions', () => {
  it('always include the answer and distinct choices from the pool', () => {
    const rng = seeded(1);
    const pool = charsAt(10);
    for (let i = 0; i < 50; i++) {
      const ans = pool[i % pool.length];
      const q = makeQuestion(ans, pool, {}, rng);
      expect(q.choices).toContain(ans);
      expect(new Set(q.choices).size).toBe(4);
      for (const c of q.choices) expect(pool).toContain(c);
    }
  });
  it('offers fewer choices when the pool is small', () => {
    expect(makeQuestion('K', ['K', 'M'], {}, seeded(2)).choices.sort()).toEqual(['K', 'M']);
  });
  it('prefers characters that sound alike or get mixed up', () => {
    expect(codeDistance('U', 'V')).toBe(1);
    expect(codeDistance('E', 'O')).toBe(3);
    const confusion: Confusion = { U: { V: 20 } };
    const rng = seeded(3);
    let withV = 0;
    for (let i = 0; i < 200; i++) if (makeQuestion('U', charsAt(30), confusion, rng).choices.includes('V')) withV++;
    expect(withV).toBeGreaterThan(150);
  });
  it('targets new and weak characters more often', () => {
    const rng = seeded(4);
    const stats: Stats = { K: { seen: 50, correct: 50, recent: 1, rtSum: 0, rtCount: 0 } };
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const c = pickTarget(['K', 'M', 'U'], ['U'], stats, rng);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    expect(counts.U).toBeGreaterThan(counts.M);
    expect(counts.M).toBeGreaterThan(counts.K);
  });
});

describe('copy groups and grading', () => {
  it('makes five-character groups from the pool', () => {
    const g = makeGroups(['K', 'M', 'U'], ['U'], {}, 6, seeded(5));
    expect(g).toHaveLength(6);
    for (const x of g) expect(x).toMatch(/^[KMU]{5}$/);
  });
  it('grades perfect copy, ignoring case and spacing', () => {
    const r = gradeCopy('KMUKM UUKMK', 'kmukmuukmk');
    expect(r).toMatchObject({ correct: 10, total: 10, accuracy: 1, extra: 0 });
  });
  it('a dropped character only costs that character', () => {
    const r = gradeCopy('KMUKM UUKMK', 'KMKM UUKMK');
    expect(r.correct).toBe(9);
    expect(r.marks[2]).toEqual({ sent: 'U', got: null, mark: 'missed' });
  });
  it('records substitutions with what was heard', () => {
    const r = gradeCopy('KMU', 'KMV');
    expect(r.marks[2]).toEqual({ sent: 'U', got: 'V', mark: 'wrong' });
  });
  it('counts extra characters against you', () => {
    const r = gradeCopy('KM', 'KXM');
    expect(r.extra).toBe(1);
    expect(r.accuracy).toBeCloseTo(2 / 3);
    // Spamming guesses can't pad a pass.
    expect(passes(gradeCopy('KMUKM'.repeat(4), 'KMUKMR'.repeat(8)))).toBe(false);
  });
  it('passing needs 90% over at least 20 characters', () => {
    expect(passes(gradeCopy('KMKMK', 'KMKMK'))).toBe(false);
    const sent = 'KMUKM'.repeat(4);
    expect(passes(gradeCopy(sent, sent))).toBe(true);
    expect(passes(gradeCopy(sent, sent.slice(0, 17)))).toBe(false);
  });
});

describe('spaced repetition', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  it('grades from correctness and speed', () => {
    expect(gradeFrom(false, 0.2)).toBe(Rating.Again);
    expect(gradeFrom(true, 0.5)).toBe(Rating.Easy);
    expect(gradeFrom(true, 1.5)).toBe(Rating.Good);
    expect(gradeFrom(true, 4)).toBe(Rating.Hard);
  });
  it('new cards are due; reviewed cards move into the future', () => {
    const cards: Cards = {};
    introduce(cards, 'c:K', now);
    introduce(cards, 'c:M', now);
    expect(dueIds(cards, now)).toEqual(['c:K', 'c:M']);
    review(cards, 'c:K', Rating.Easy, now);
    expect(dueIds(cards, now)).toEqual(['c:M']);
    expect(cards['c:K'].due.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('stats', () => {
  it('records accuracy, response time and confusion', () => {
    const stats: Stats = {};
    const conf: Confusion = {};
    record(stats, conf, 'U', 'U', 1.2);
    record(stats, conf, 'U', 'V');
    record(stats, conf, 'U', null);
    expect(stats.U).toMatchObject({ seen: 3, correct: 1, rtCount: 1 });
    expect(conf).toEqual({ U: { V: 1 } });
    expect(topConfusions(conf)).toEqual([['U', 'V', 1]]);
  });
  it('mastery climbs with accuracy and practice', () => {
    expect(mastery(undefined)).toBe(0);
    expect(mastery({ seen: 3, correct: 1, recent: 0.4, rtSum: 0, rtCount: 0 })).toBe(1);
    expect(mastery({ seen: 10, correct: 9, recent: 0.92, rtSum: 0, rtCount: 0 })).toBe(3);
    expect(mastery({ seen: 30, correct: 30, recent: 0.99, rtSum: 0, rtCount: 0 })).toBe(4);
  });
  it('streaks count consecutive days and survive until you miss one', () => {
    const today = new Date(2026, 2, 10);
    expect(streak(['2026-03-08', '2026-03-09', '2026-03-10'], today)).toBe(3);
    expect(streak(['2026-03-08', '2026-03-09'], today)).toBe(2);
    expect(streak(['2026-03-07', '2026-03-09'], today)).toBe(1);
    expect(streak(['2026-03-01'], today)).toBe(0);
    expect(streak(['2026-02-28', '2026-03-01'], new Date(2026, 2, 1))).toBe(2); // across a month
    expect(dayKey(today)).toBe('2026-03-10');
  });
});

describe('progress', () => {
  it('sanitises junk to a fresh start', () => {
    expect(sanitizeProgress(null)).toEqual(emptyProgress());
    const p = sanitizeProgress({ level: 999, met: ['K', 'nope'], settings: { charWpm: 99, effWpm: 99, copySeconds: 7 } });
    expect(p.level).toBe(41);
    expect(p.met).toEqual(['K']);
    expect(p.settings).toEqual({ charWpm: 60, effWpm: 60, copySeconds: 60 });
  });
  it('round-trips through export and import, cards and all', () => {
    const p = emptyProgress();
    p.level = 7;
    introduce(p.cards, 'c:K', new Date('2026-03-01T10:00:00Z'));
    review(p.cards, 'c:K', Rating.Good, new Date('2026-03-01T10:00:00Z'));
    record(p.stats, p.confusion, 'K', 'R');
    addSession(p, { at: '2026-03-01T10:05:00Z', day: '2026-03-01', level: 7, seconds: 300, charWpm: 20, effWpm: 10, copyAccuracy: 0.93, copyChars: 50 });
    const back = importProgress(exportProgress(p));
    expect(back).toEqual(p);
    expect(back.cards['c:K'].due).toBeInstanceOf(Date);
  });
  it('rejects files that are not exports', () => {
    expect(() => importProgress('nope')).toThrow(/valid JSON/);
    expect(() => importProgress('{"a":1}')).toThrow(/progress export/);
  });
});

describe('teaching cards', () => {
  it('parse safely into blocks', () => {
    const b = parseMarkdown('# Title *x*\n\nOne **two** three.\n\n- a\n- *b*\n\n<script>alert(1)</script>');
    expect(titleOf(b)).toBe('Title x');
    expect(b[1]).toEqual({ t: 'p', content: [{ t: 'text', s: 'One ' }, { t: 'b', s: 'two' }, { t: 'text', s: ' three.' }] });
    expect(b[2]).toEqual({ t: 'ul', items: [[{ t: 'text', s: 'a' }], [{ t: 'i', s: 'b' }]] });
    expect(b[3]).toEqual({ t: 'p', content: [{ t: 'text', s: '<script>alert(1)</script>' }] });
  });
  it('every card loads with a title and fits the course', () => {
    expect(CARDS.length).toBeGreaterThan(8);
    for (const c of CARDS) {
      expect(c.title).not.toBe('');
      expect(c.lesson).toBeGreaterThanOrEqual(1);
      expect(c.lesson).toBeLessThanOrEqual(40);
    }
  });
});
