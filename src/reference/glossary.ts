import glossary from '../../content/reference/glossary.json';
import qcodes from '../../content/words/qcodes.json';
import abbreviations from '../../content/words/abbreviations.json';
import prosigns from '../../content/alphabets/prosigns.json';

export interface Entry {
  id: string;
  term: string;
  cat: string;
  short: string;
  more?: string;
  aka?: string[];
  see?: string[];
  /** Morse for prosigns. */
  code?: string;
  /** False: listed in the glossary, but not auto-linked in running text. */
  link: boolean;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Abbreviations that are also ordinary words, or too short to link safely in prose. */
const NO_LINK = new Set(['R', 'K', 'NAME', 'AGE', 'TEMP', 'SOLID', 'HI', 'OP', 'GA', 'NW', 'HR', 'ES', 'UR', 'DR', 'TU', 'GE', 'GM', 'GN', 'GL', 'OM', 'NR', 'B4', 'YL', 'XYL', 'AS', 'BT', 'CT', 'AR', 'SN', 'HH', 'BK', 'CL', 'KN', 'SK', 'UP', 'FB', 'VY']);

function build(): Entry[] {
  const out: Entry[] = [];
  const byTerm = new Map<string, Entry>();
  const add = (e: Omit<Entry, 'id' | 'link'> & { link?: boolean }) => {
    const prev = byTerm.get(e.term);
    if (prev) {
      // The same letters in two lists (QTH is a Q-code and an abbreviation): keep one entry.
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm(prev.short).includes(norm(e.short))) prev.more = [prev.more, `Also: ${e.short}`].filter(Boolean).join(' ');
      prev.code ??= e.code;
      return;
    }
    const entry: Entry = { ...e, id: slug(e.term), link: e.link ?? !NO_LINK.has(e.term) };
    byTerm.set(e.term, entry);
    out.push(entry);
  };
  for (const g of glossary.entries as (Omit<Entry, 'id' | 'link'> & { link?: boolean })[]) add(g);
  for (const [term, meaning] of qcodes.items as [string, string][]) add({ term, cat: 'Q-code', short: cap(meaning) });
  for (const p of prosigns as { name: string; code: string; meaning: string }[]) add({ term: p.name, cat: 'Prosign', short: cap(p.meaning), code: p.code });
  for (const [term, meaning] of abbreviations.items as [string, string][]) add({ term, cat: 'Abbreviation', short: cap(meaning) });
  return out.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
}
/** Capitalised, ending in exactly one full stop (or the question mark it already has). */
const cap = (s: string) => {
  const t = s.trim().replace(/\.+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[?!]$/.test(t) ? '' : '.');
};

export const ENTRIES: readonly Entry[] = build();
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));
export const entryById = (id: string) => BY_ID.get(id);
export const entryByTerm = (term: string) => ENTRIES.find((e) => e.term === term || e.aka?.includes(term));

export const CATEGORIES = [...new Set(ENTRIES.map((e) => e.cat))].sort();

/**
 * Every way a linkable term can appear in running text. Terms with capitals
 * (QSB, ERP, Koch method) only match with that exact case; all-lowercase terms
 * (zero beat, balun) also match capitalised at the start of a sentence.
 */
const KEYS: { text: string; id: string; exact: boolean }[] = ENTRIES.filter((e) => e.link)
  .flatMap((e) => [e.term, ...(e.aka ?? [])].map((text) => ({ text, id: e.id, exact: /[A-Z]/.test(text) })))
  .filter((k) => k.text.length > 1)
  .sort((a, b) => b.text.length - a.text.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(`(?<![\\w/-])(${KEYS.map((k) => esc(k.text)).join('|')})(?![\\w/-])`, 'gi');
const lookup = (s: string) => KEYS.find((k) => (k.exact ? k.text === s : k.text.toLowerCase() === s.toLowerCase()));

export type Seg = { t: 'text'; s: string } | { t: 'term'; s: string; id: string };

/**
 * Splits text into plain runs and glossary terms. Each term is linked once per
 * `seen` set (pass the same set across a page so a term isn't linked on every line).
 */
export function linkTerms(text: string, seen: Set<string> = new Set()): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const k = lookup(m[0]);
    if (!k || seen.has(k.id)) continue;
    seen.add(k.id);
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
    out.push({ t: 'term', s: m[0], id: k.id });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
  return out;
}

/** The address of a glossary entry. */
export const termHref = (id: string) => `#/radio?tab=glossary&term=${encodeURIComponent(id)}`;
