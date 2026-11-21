import s1 from '../../content/licence/s1.json';
import s2 from '../../content/licence/s2.json';
import s3 from '../../content/licence/s3.json';
import s4 from '../../content/licence/s4.json';
import s5 from '../../content/licence/s5.json';
import s6 from '../../content/licence/s6.json';
import s7 from '../../content/licence/s7.json';
import s8 from '../../content/licence/s8.json';
import s9 from '../../content/licence/s9.json';
import type { LicenceLevel, LicenceProgress } from '../learn/progress';
import type { Rng } from '../learn/random';

/**
 * The UK amateur licence syllabus (RSGB Combined Syllabus v1.6A, July 2024),
 * with original study notes and practice questions for every item at every
 * level. The questions are written for this app; they are not the RSGB's.
 * In the content files the right answer is always `choices[0]`; it's shuffled
 * when shown.
 */
export interface RawQ {
  text: string;
  choices: string[];
  why: string;
}
interface RawBlock {
  note: string;
  q: RawQ[];
}
interface RawSection {
  section: number;
  title: string;
  items: { id: string; topic: string; levels: Partial<Record<LicenceLevel, RawBlock>> }[];
}

export interface Question extends RawQ {
  id: string;
  item: string;
  level: LicenceLevel;
  section: number;
}
export interface StudyItem {
  id: string;
  section: number;
  topic: string;
  level: LicenceLevel;
  note: string;
  questions: Question[];
}

export const SECTIONS: readonly RawSection[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9] as RawSection[];
export const LEVELS: readonly LicenceLevel[] = ['F', 'I', 'Full'];

export const LEVEL_INFO: Record<LicenceLevel, { name: string; questions: number; minutes: number; pass: number; power: string; calls: string; about: string }> = {
  F: {
    name: 'Foundation',
    questions: 26,
    minutes: 60,
    pass: 19,
    power: '25 W PEP',
    calls: 'M7 (older: M3, M6, 2E1)',
    about: 'The way in. Licensing, safety, simple electrics and good operating, with enough theory to put up an antenna and stay out of trouble. No formula sheet: you need to understand the basics.',
  },
  I: {
    name: 'Intermediate',
    questions: 46,
    minutes: 90,
    pass: 28,
    power: '100 W PEP',
    calls: 'M8, M9 (older: 2E0, 2M0 and so on, with an RSL)',
    about: 'Real electronics: components, tuned circuits, transmitters and receivers, plus building equipment. Formulae are provided but you may need to rearrange them.',
  },
  Full: {
    name: 'Full',
    questions: 58,
    minutes: 120,
    pass: 35,
    power: 'up to 1 kW PEP in primary bands',
    calls: 'M0 (older: G, M1, M5)',
    about: 'The whole picture: design-level theory, EMC and propagation in depth, and the licence that’s recognised abroad under CEPT. Formulae are given but not labelled.',
  },
};

/** Questions per section in the real exam (RSGB syllabus, Part 1). Sections 1–9. */
export const ALLOCATION: Record<LicenceLevel, number[]> = {
  F: [6, 3, 3, 3, 2, 3, 3, 3, 0],
  I: [6, 14, 7, 4, 3, 4, 2, 3, 3],
  Full: [7, 11, 12, 4, 3, 10, 2, 4, 5],
};

/** The study items for one level, in syllabus order. */
export function itemsFor(level: LicenceLevel): StudyItem[] {
  return SECTIONS.flatMap((sec) =>
    sec.items.flatMap((it) => {
      const b = it.levels[level];
      if (!b) return [];
      return [
        {
          id: it.id,
          section: sec.section,
          topic: it.topic,
          level,
          note: b.note,
          questions: b.q.map((q, i) => ({ ...q, id: `${it.id}-${level}-${i}`, item: it.id, level, section: sec.section })),
        },
      ];
    }),
  );
}

/**
 * Exam questions can draw on lower levels as well as the current one, so the
 * question pool for a level includes the levels below it.
 */
export function poolFor(level: LicenceLevel, section?: number): Question[] {
  const upto = LEVELS.slice(0, LEVELS.indexOf(level) + 1);
  return upto.flatMap((l) => itemsFor(l)).flatMap((i) => (section === undefined || i.section === section ? i.questions : []));
}

const shuffle = <T,>(xs: T[], rng: Rng) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export interface Shown extends Question {
  /** The choices in display order. */
  order: string[];
  /** Index of the right answer in `order`. */
  answer: number;
}
export const show = (q: Question, rng: Rng): Shown => {
  const order = shuffle(q.choices, rng);
  return { ...q, order, answer: order.indexOf(q.choices[0]) };
};

/**
 * A mock paper with the real exam's number of questions from each section.
 * Questions come from the level itself first; if a section is short, lower
 * levels fill in.
 */
export function mockPaper(level: LicenceLevel, rng: Rng): Shown[] {
  const own = itemsFor(level).flatMap((i) => i.questions);
  const all = poolFor(level);
  return ALLOCATION[level].flatMap((n, s) => {
    const mine = shuffle(own.filter((q) => q.section === s + 1), rng);
    const rest = shuffle(all.filter((q) => q.section === s + 1 && q.level !== level), rng);
    // One question per syllabus item where possible, as the real paper picks items first.
    const items = new Set<string>();
    const pick: Question[] = [];
    for (const q of [...mine, ...rest]) if (pick.length < n && !items.has(q.item)) (items.add(q.item), pick.push(q));
    for (const q of [...mine, ...rest]) if (pick.length < n && !pick.includes(q)) pick.push(q);
    return pick.map((q) => show(q, rng));
  });
}

/**
 * Practice order: questions never answered first, then the ones you've got
 * wrong most (relative to right), then the rest, oldest first.
 */
export function practiceOrder(qs: Question[], p: LicenceProgress, rng: Rng): Question[] {
  const score = (q: Question) => {
    const a = p.answers[q.id];
    if (!a) return -1e9 + rng();
    return (a.right - 2 * a.wrong) * 1e6 + Date.parse(a.at) / 1e6 + rng();
  };
  return qs.map((q) => [score(q), q] as const).sort((a, b) => a[0] - b[0]).map(([, q]) => q);
}

/** How well a set of questions is known: answered at least once, and the last answer right. */
export function mastery(qs: Question[], p: LicenceProgress) {
  let seen = 0;
  let good = 0;
  for (const q of qs) {
    const a = p.answers[q.id];
    if (!a) continue;
    seen++;
    if (a.right > a.wrong) good++;
  }
  return { total: qs.length, seen, good };
}

export const passed = (score: number, level: LicenceLevel) => score >= LEVEL_INFO[level].pass;
