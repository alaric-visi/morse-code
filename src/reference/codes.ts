import variants from '../../content/codes/variants.json';
import type { Schedule, ToneEvent } from '../core/schedule';

export interface CodeTable {
  id: string;
  name: string;
  script: string;
  dir: 'ltr' | 'rtl';
  about: string;
  legend?: string;
  switch?: { start: string; end: string };
  timing?: { dot: number; dash: number; long: number; xlong: number; gap: number; longGap: number; letter: number; word: number; note: string };
  chars: [string, string, string?][];
}

export const CODES = variants.codes as CodeTable[];
export const SOURCE = variants.source;

/** Element lengths in units for a code. International-style codes: dot 1, dash 3. */
function marks(code: string, t: CodeTable['timing']): { on: number; gapAfter: number }[] {
  const out: { on: number; gapAfter: number }[] = [];
  const tm = t ?? { dot: 1, dash: 3, long: 6, xlong: 9, gap: 1, longGap: 2, letter: 3, word: 7, note: '' };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === ' ') {
      if (out.length) out[out.length - 1].gapAfter = tm.longGap;
      continue;
    }
    const on = c === '.' ? tm.dot : c === '-' ? tm.dash : c === '_' ? tm.long : tm.xlong;
    out.push({ on, gapAfter: tm.gap });
  }
  if (out.length) out[out.length - 1].gapAfter = 0;
  return out;
}

/**
 * Schedule for a run of characters from one table (each item is a code; '' is a
 * word space), at `unit` seconds per dot.
 */
export function variantSchedule(table: CodeTable, codes: string[], unit: number): Schedule {
  const tm = table.timing;
  const letterGap = (tm?.letter ?? 3) * unit;
  const wordGap = (tm?.word ?? 7) * unit;
  const events: ToneEvent[] = [];
  const letterStart: number[] = [];
  const letterEnd: number[] = [];
  let t = 0;
  let wi = 0;
  let li = 0;
  codes.forEach((code, n) => {
    if (code === '') {
      t += wordGap - letterGap;
      wi++;
      li = 0;
      letterStart.push(t);
      letterEnd.push(t);
      return;
    }
    letterStart.push(t);
    marks(code, tm).forEach((m, j) => {
      events.push({ t0: t, t1: t + m.on * unit, wi, li, n, j });
      t += (m.on + m.gapAfter) * unit;
    });
    letterEnd.push(t);
    li++;
    if (n < codes.length - 1) t += letterGap;
  });
  return { events, total: events.length ? events[events.length - 1].t1 : 0, letterStart, letterEnd };
}

/** The characters of `text` that a table can send, as codes ('' for spaces). */
export function encodeIn(table: CodeTable, text: string): { codes: string[]; chars: string[] } {
  const map = new Map(table.chars.map(([c, k]) => [c.toUpperCase(), k]));
  const codes: string[] = [];
  const chars: string[] = [];
  for (const ch of Array.from(text.toUpperCase())) {
    if (/\s/.test(ch)) {
      if (codes.length && codes[codes.length - 1] !== '') (codes.push(''), chars.push(' '));
      continue;
    }
    const k = map.get(ch);
    if (k) (codes.push(k), chars.push(ch));
  }
  while (codes[codes.length - 1] === '') (codes.pop(), chars.pop());
  return { codes, chars };
}
