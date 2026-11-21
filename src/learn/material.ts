import top500 from '../../content/words/top500.json';
import abbreviations from '../../content/words/abbreviations.json';
import qcodes from '../../content/words/qcodes.json';
import phrases from '../../content/words/phrases.json';
import { makeCallsign } from './callsigns';
import type { Rng } from './random';

export type WordSource = 'top100' | 'top250' | 'top500' | 'abbreviations' | 'qcodes' | 'callsigns' | 'mixed';

export const WORD_SOURCES: Record<WordSource, string> = {
  top100: 'Top 100 words',
  top250: 'Top 250 words',
  top500: 'Top 500 words',
  abbreviations: 'CW abbreviations',
  qcodes: 'Q-codes',
  callsigns: 'Callsigns',
  mixed: 'A bit of everything',
};

export const ABBREVIATIONS: readonly [string, string][] = abbreviations.items as [string, string][];
export const QCODES: readonly [string, string][] = qcodes.items as [string, string][];
export const PHRASES: readonly string[] = phrases.phrases;
export const SENTENCES: readonly string[] = phrases.sentences;
export const TOP500: readonly string[] = top500.words;

const pick = <T,>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];

/** One item to copy from a source. */
export function word(source: WordSource, rng: Rng): string {
  switch (source) {
    case 'top100':
      return pick(TOP500.slice(0, 100), rng);
    case 'top250':
      return pick(TOP500.slice(0, 250), rng);
    case 'top500':
      return pick(TOP500, rng);
    case 'abbreviations':
      return pick(ABBREVIATIONS, rng)[0];
    case 'qcodes':
      return pick(QCODES, rng)[0];
    case 'callsigns':
      return makeCallsign(rng).call;
    case 'mixed':
      return word(pick(['top250', 'abbreviations', 'qcodes', 'callsigns'] as const, rng), rng);
  }
}

/** `n` items, no immediate repeats. */
export function words(source: WordSource, n: number, rng: Rng): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const w = word(source, rng);
    if (w !== out[out.length - 1]) out.push(w);
  }
  return out;
}

/** Sentences until the text is at least `chars` letters long. */
export function sentences(chars: number, rng: Rng): string {
  const out: string[] = [];
  let used = 0;
  while (used < chars) {
    const s = pick(SENTENCES, rng);
    if (s === out[out.length - 1]) continue;
    out.push(s);
    used += s.replace(/ /g, '').length;
  }
  return out.join(' ');
}

export type HeadLevel = 'words' | 'phrases' | 'sentences';
export function headItem(level: HeadLevel, rng: Rng): string {
  return level === 'words' ? pick(TOP500.slice(0, 300), rng) : level === 'phrases' ? pick(PHRASES, rng) : pick(SENTENCES, rng);
}
