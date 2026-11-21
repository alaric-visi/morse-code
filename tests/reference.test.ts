import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import levels from './fixtures/syllabus-levels.json';
import etiquette from '../content/procedure/etiquette.json';
import contests from '../content/contests/contests.json';
import cards from '../content/courses/cards.json';
import history from '../content/reference/history.json';
import { ALLOCATION, LEVEL_INFO, LEVELS, SECTIONS, itemsFor, mockPaper, practiceOrder, show } from '../src/reference/licence';
import { ENTRIES, entryById, entryByTerm, linkTerms } from '../src/reference/glossary';
import { CODES, encodeIn, variantSchedule } from '../src/reference/codes';
import { IambicKeyer, type IambicMode } from '../src/core/keyer';
import { KEYER_MODE } from '../src/audio/keyer-node';
import { sanitizeProgress, emptyProgress } from '../src/learn/progress';
import { seeded } from '../src/learn/random';

const lessons = readdirSync('content/courses/lessons').map((f) => readFileSync(`content/courses/lessons/${f}`, 'utf8'));
const strings = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(strings) : x && typeof x === 'object' ? Object.values(x).flatMap(strings) : [];

describe('UK licence syllabus', () => {
  it('covers every syllabus item at every level it appears in the RSGB syllabus, and nothing else', () => {
    const have: Record<string, string[]> = {};
    for (const sec of SECTIONS) for (const it of sec.items) have[it.id] = Object.keys(it.levels).sort();
    for (const [id, lv] of Object.entries(levels.items)) {
      if (!lv.length) continue;
      expect(have[id], id).toEqual([...lv].sort());
    }
    expect(Object.keys(have).every((id) => id in levels.items)).toBe(true);
  });

  it('keeps items in syllabus order, each with a note and well-formed questions', () => {
    const order = Object.keys(levels.items).filter((id) => levels.items[id as keyof typeof levels.items].length);
    expect(SECTIONS.flatMap((s) => s.items.map((i) => i.id))).toEqual(order);
    for (const l of LEVELS)
      for (const it of itemsFor(l)) {
        expect(it.note.length, `${it.id} ${l}`).toBeGreaterThan(40);
        expect(it.questions.length).toBeGreaterThan(0);
        for (const q of it.questions) {
          expect(q.choices).toHaveLength(4);
          expect(new Set(q.choices).size).toBe(4);
          expect(q.why.length).toBeGreaterThan(10);
        }
      }
  });

  it('has the published exam format', () => {
    expect([LEVEL_INFO.F.questions, LEVEL_INFO.F.minutes, LEVEL_INFO.F.pass]).toEqual([26, 60, 19]);
    expect([LEVEL_INFO.I.questions, LEVEL_INFO.I.minutes, LEVEL_INFO.I.pass]).toEqual([46, 90, 28]);
    expect([LEVEL_INFO.Full.questions, LEVEL_INFO.Full.minutes, LEVEL_INFO.Full.pass]).toEqual([58, 120, 35]);
    for (const l of LEVELS) expect(ALLOCATION[l].reduce((a, b) => a + b)).toBe(LEVEL_INFO[l].questions);
  });

  it.each(LEVELS)('builds a %s mock paper with the right mix of sections and no repeats', (l) => {
    for (let seed = 1; seed < 20; seed++) {
      const paper = mockPaper(l, seeded(seed));
      expect(paper).toHaveLength(LEVEL_INFO[l].questions);
      expect(new Set(paper.map((q) => q.id)).size).toBe(paper.length);
      const per = ALLOCATION[l].map((_, s) => paper.filter((q) => q.section === s + 1).length);
      expect(per).toEqual(ALLOCATION[l]);
      for (const q of paper) expect(q.order[q.answer]).toBe(q.choices[0]);
    }
  });

  it('practises unseen and wrongly answered questions first', () => {
    const qs = itemsFor('F').flatMap((i) => i.questions).slice(0, 4);
    const p = emptyProgress().licence;
    p.answers[qs[0].id] = { right: 3, wrong: 0, at: '2026-01-01T00:00:00Z' };
    p.answers[qs[1].id] = { right: 0, wrong: 2, at: '2026-01-01T00:00:00Z' };
    const order = practiceOrder(qs, p, seeded(3)).map((q) => q.id);
    expect(order.slice(0, 2).sort()).toEqual([qs[2].id, qs[3].id].sort());
    expect(order[2]).toBe(qs[1].id);
    expect(order[3]).toBe(qs[0].id);
  });

  it('shuffles answers without losing the right one', () => {
    const q = itemsFor('Full')[0].questions[0];
    for (let s = 1; s < 10; s++) {
      const v = show(q, seeded(s));
      expect(v.order[v.answer]).toBe(q.choices[0]);
    }
  });

  it('saves and cleans licence progress', () => {
    const p = sanitizeProgress({
      licence: {
        answers: { '1A1-F-0': { right: 2, wrong: 1, at: '2026-01-01T00:00:00Z' }, 'bogus': { right: 1, wrong: 0, at: 'x' } },
        mocks: [{ level: 'F', score: 20, total: 26, pass: 19, seconds: 1800, at: '2026-01-01T00:00:00Z' }, { level: 'Z' }],
      },
    });
    expect(Object.keys(p.licence.answers)).toEqual(['1A1-F-0']);
    expect(p.licence.mocks).toHaveLength(1);
    expect(sanitizeProgress({}).licence).toEqual({ answers: {}, mocks: [] });
  });
});

describe('glossary', () => {
  // Words in capitals that aren't radio terms: places, plain English, component labels.
  const PLAIN = new Set(['UK', 'US', 'USA', 'TV', 'PC', 'LED', 'IT', 'WHAT', 'HATH', 'GOD', 'WROUGHT', 'OK', 'ALL', 'STOP', 'HELLO', 'PARIS', 'TEST', 'LC', 'CR', 'LR', 'RD', 'PD', 'NPN', 'PNP', 'FET', 'IC', 'PIV', 'AB', 'DD', 'DAB', 'VDSL', 'FCS', 'MSF', 'NP0', 'MM', 'XL', 'XC', 'IB', 'Z0', 'DO', 'UV']);
  const isLabel = (w: string) => /^[A-Z]{1,2}\d+$/.test(w) || /^[A-Z]{1,2}\d[A-Z]{1,4}$/.test(w) || /^(VK|JA|VE|ZL|EI|G4|DL1|K9)$/.test(w);
  const content = [
    ...lessons,
    ...SECTIONS.flatMap((s) => strings(s.items.map((i) => [i.topic, Object.values(i.levels).map((b) => [b!.note, b!.q.map((q) => [q.text, q.why])])]))),
    ...strings(etiquette),
    ...strings(contests),
    ...strings(cards),
    ...strings(history.events),
  ].join('\n');

  it('has an entry for every Q-code, prosign, abbreviation and acronym the app uses', () => {
    const words = new Set(content.match(/\b[A-Z][A-Z0-9]{1,5}\b/g));
    const missing = [...words].filter((w) => !PLAIN.has(w) && !isLabel(w) && !entryByTerm(w));
    expect(missing).toEqual([]);
  });

  it('covers the terms in every screen’s own text too', () => {
    const OK = new Set([...PLAIN, 'ALEX', 'CALL', 'NAME', 'PASS', 'GB', 'LD', 'MIDI', 'GOD', 'HATH', 'WHAT', 'TEST']);
    const words = new Set<string>();
    for (const d of readdirSync('src/features'))
      for (const f of readdirSync(`src/features/${d}`).filter((x) => x.endsWith('.tsx'))) {
        const s = readFileSync(`src/features/${d}/${f}`, 'utf8');
        const prose = [...s.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1]).concat([...s.matchAll(/'([^'\n]* [^'\n]*)'|`([^`\n]* [^`\n]*)`/g)].map((m) => m[1] ?? m[2]));
        for (const p of prose) for (const w of p.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []) words.add(w);
      }
    expect([...words].filter((w) => !OK.has(w) && !isLabel(w) && !/^F\d$/.test(w) && !entryByTerm(w))).toEqual([]);
  });

  it('has no duplicate ids, and every cross-reference resolves', () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    for (const e of ENTRIES) for (const s of e.see ?? []) expect(entryByTerm(s), `${e.term} → ${s}`).toBeTruthy();
  });

  it('links terms in running text, once each, with the right case', () => {
    const segs = linkTerms('Fading (QSB) is common; QSB again. A balun helps. Use the Koch method.');
    const terms = segs.filter((s) => s.t === 'term').map((s) => s.s);
    expect(terms).toEqual(['QSB', 'balun', 'Koch method']);
    expect(segs.map((s) => s.s).join('')).toBe('Fading (QSB) is common; QSB again. A balun helps. Use the Koch method.');
    // Plain words and parts of other words aren't links.
    expect(linkTerms('the regional secondary locator, if it is, am I').filter((s) => s.t === 'term')).toEqual([]);
    expect(linkTerms('G4ABC/QRP and QRPP').filter((s) => s.t === 'term')).toEqual([]);
    expect(entryById('qsb')?.short).toMatch(/fading/i);
  });

  it('has a dated, ordered history', () => {
    const years = history.events.map((e) => +e.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(history.events.find((e) => e.year === '1844')?.text).toMatch(/24 May 1844/);
  });
});

describe('other codes', () => {
  it('has unique characters in every table, and codes made of marks only', () => {
    for (const t of CODES) {
      expect(new Set(t.chars.map((c) => c[0])).size, t.id).toBe(t.chars.length);
      for (const [, code] of t.chars) expect(code, t.id).toMatch(t.id === 'american' ? /^[.\-_= ]+$/ : /^[.-]+$/);
    }
  });

  it('times American Morse with long dashes and inner gaps', () => {
    const am = CODES.find((c) => c.id === 'american')!;
    const one = (ch: string) => variantSchedule(am, encodeIn(am, ch).codes, 0.1);
    expect(one('T').total).toBeCloseTo(0.2); // dash: 2 units
    expect(one('L').total).toBeCloseTo(0.4); // long dash
    expect(one('0').total).toBeCloseTo(0.6); // extra-long dash
    expect(one('O').total).toBeCloseTo(0.4); // dot, long inner gap (2), dot
    expect(one('I').total).toBeCloseTo(0.3); // dot, gap, dot
  });

  it('encodes text in its own script and skips what it can’t send', () => {
    const ru = CODES.find((c) => c.id === 'cyrillic')!;
    expect(encodeIn(ru, 'мир ok').codes).toEqual(['--', '..', '.-.']);
    const wabun = CODES.find((c) => c.id === 'wabun')!;
    expect(encodeIn(wabun, 'あい').codes).toEqual(['--.--', '.-']);
  });
});

describe('key types', () => {
  /** Run a keyer with scripted paddles; returns the elements it sent and the key-down samples. */
  const run = (mode: IambicMode, script: [number, boolean, boolean][], total: number) => {
    const k = new IambicKeyer(mode, 10);
    const els: string[] = [];
    k.onElement = (e) => els.push(e.el);
    let downs = 0;
    let edges = 0;
    let was = false;
    for (let s = 0; s < total; s++) {
      for (const [at, dit, dah] of script) if (at === s) k.setPaddles(dit, dah);
      const d = k.step();
      if (d) downs++;
      if (d && !was) edges++;
      was = d;
    }
    return { els: els.join(''), downs, edges };
  };

  it('ultimatic: a squeeze repeats the paddle pressed last', () => {
    // Dit, then add dah while holding: dit, then dahs (iambic would alternate).
    expect(run('ultimatic', [[0, true, false], [5, true, true], [150, false, false]], 200).els).toMatch(/^\.-+$/);
    expect(run('A', [[0, true, false], [5, true, true], [150, false, false]], 200).els).toMatch(/^\.-\.-/);
    // Let go of dah while still on dit: dits again.
    expect(run('ultimatic', [[0, false, true], [5, true, true], [100, true, false], [160, false, false]], 220).els).toMatch(/^--*\.+$/);
  });

  it('bug: the dit side makes automatic dits; the dah side is a plain contact', () => {
    const dits = run('bug', [[0, true, false], [55, false, false]], 100);
    expect(dits.els).toBe('...');
    const dah = run('bug', [[0, false, true], [37, false, false]], 80);
    expect(dah).toMatchObject({ els: '', downs: 37, edges: 1 });
  });

  it('cootie: either side keys directly, for as long as it is held', () => {
    expect(run('cootie', [[0, true, false], [12, false, false], [20, false, true], [55, false, false]], 80)).toMatchObject({ downs: 12 + 35, edges: 2, els: '' });
  });

  it('maps every key type in the app to a keyer mode', () => {
    expect(KEYER_MODE).toEqual({ straight: 'straight', iambicA: 'A', iambicB: 'B', ultimatic: 'ultimatic', single: 'ultimatic', bug: 'bug', cootie: 'cootie' });
  });
});
