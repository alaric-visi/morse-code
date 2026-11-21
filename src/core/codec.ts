import itu from '../../content/alphabets/itu.json';
import extended from '../../content/alphabets/extended.json';
import prosignList from '../../content/alphabets/prosigns.json';

/**
 * One unit of a message.
 * - `char`: a character with a code (A, 7, ?, É …)
 * - `prosign`: letters run together with no gap, written <AR> or [AR]
 * - `unknown`: anything that can't be sent or decoded. `raw` keeps it exactly,
 *   so switching mode and back never loses it.
 */
export type LetterKind = 'char' | 'prosign' | 'unknown';

export interface Letter {
  /** What to show above the code. */
  ch: string;
  /** Dots and dashes; empty when it has no code. */
  morse: string;
  known: boolean;
  kind: LetterKind;
  /** The source text this came from (for unknowns, what gets carried across). */
  raw: string;
  /** Offsets of the source text in the input, [start, end). */
  start: number;
  end: number;
}

export type Words = Letter[][];

export interface Parsed {
  words: Words;
  /** Distinct characters (text mode) or codes (Morse mode) that couldn't be translated. */
  unknown: string[];
}

export type Mode = 'text' | 'morse';

export interface CodecOptions {
  /** Accented and non-English letters (É, Ä, Ñ …). */
  extended?: boolean;
}

export interface Prosign {
  name: string;
  code: string;
  meaning: string;
}

export const charToMorse: Readonly<Record<string, string>> = itu;
export const morseToChar: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(itu).map(([c, m]) => [m, c]),
);
export const extendedChars: Readonly<Record<string, string>> = extended;
export const prosigns: readonly Prosign[] = prosignList;

interface Alphabet {
  encode: ReadonlyMap<string, string>;
  /** code → character; ITU first, then extended (first listed wins). */
  decode: ReadonlyMap<string, string>;
  /** code → prosign name, for codes that aren't also a character. */
  prosign: ReadonlyMap<string, string>;
}

function buildAlphabet(withExtended: boolean): Alphabet {
  const encode = new Map(Object.entries(itu));
  const decode = new Map(Object.entries(morseToChar));
  if (withExtended) {
    for (const [c, m] of Object.entries(extended)) {
      encode.set(c, m);
      if (!decode.has(m)) decode.set(m, c);
    }
  }
  const prosign = new Map<string, string>();
  for (const p of prosignList) if (!decode.has(p.code)) prosign.set(p.code, p.name);
  return { encode, decode, prosign };
}

const ALPHABETS = { basic: buildAlphabet(false), extended: buildAlphabet(true) };
const alphabet = (o: CodecOptions = {}) => (o.extended ? ALPHABETS.extended : ALPHABETS.basic);

/** The character for one code ('-.-' → 'K', '...-.-' → '<SK>'), or '' if it has none. */
export function charForCode(code: string, opts?: CodecOptions): string {
  const a = alphabet(opts);
  const ch = a.decode.get(code);
  if (ch) return ch;
  const ps = a.prosign.get(code);
  return ps ? `<${ps}>` : '';
}

/** Look-alikes people paste in place of dots and dashes. */
const DOTS = /[•·]/g;
const DASHES = /[_–—−]/g;
const normaliseCode = (s: string) => s.replace(DASHES, '-').replace(DOTS, '.');

/**
 * `{…}` passes text through untouched in either mode. It's how unknowns survive a
 * round trip when they'd otherwise be misread (a `|` in text would split a Morse
 * word; `......` decoded to text would be read back as six full stops).
 */
const LITERAL = /^\{([^{}\s]+)\}$/u;

// ---------------------------------------------------------------- text → Morse

const TEXT_TOKEN = /<([a-z0-9]+)>|\[([a-z0-9]+)\]|\{[^{}\s]+\}|./giu;

export function encodeText(text: string, opts?: CodecOptions): Parsed {
  const { encode } = alphabet(opts);
  const unknown = new Set<string>();
  const words: Words = [];

  for (const w of text.matchAll(/\S+/gu)) {
    const word: Letter[] = [];
    const base = w.index;
    for (const t of w[0].matchAll(TEXT_TOKEN)) {
      const start = base + t.index;
      const end = start + t[0].length;
      const prosignLetters = (t[1] ?? t[2])?.toUpperCase();

      if (prosignLetters) {
        const codes = Array.from(prosignLetters, (c) => encode.get(c));
        if (codes.every(Boolean)) {
          word.push({ ch: `<${prosignLetters}>`, morse: codes.join(''), known: true, kind: 'prosign', raw: t[0], start, end });
          continue;
        }
      }

      const literal = LITERAL.exec(t[0]);
      if (literal) {
        unknown.add(literal[1]);
        word.push({ ch: literal[1], morse: '', known: false, kind: 'unknown', raw: literal[1], start, end });
        continue;
      }

      // A single code point (or a bracket group that wasn't a valid prosign).
      for (const original of Array.from(t[0])) {
        // toUpperCase can lengthen a character (ß → SS); each part maps back to the same source.
        for (const ch of Array.from(original.toUpperCase())) {
          const morse = encode.get(ch);
          if (morse) word.push({ ch, morse, known: true, kind: 'char', raw: ch, start, end });
          else {
            unknown.add(ch);
            word.push({ ch, morse: '', known: false, kind: 'unknown', raw: ch, start, end });
          }
        }
      }
    }
    words.push(word);
  }
  return { words, unknown: [...unknown] };
}

// ---------------------------------------------------------------- Morse → text

const MORSE_TOKEN = /\{[^{}\s]+\}|[/|]|\s+|[^\s/|]+/gu;

/**
 * Letters are separated by spaces; words by `/`, `|` or three or more spaces.
 * Tolerant of look-alike dots (• ·) and dashes (_ – — −).
 */
export function decodeMorse(text: string, opts?: CodecOptions): Parsed {
  const { decode, prosign } = alphabet(opts);
  const unknown = new Set<string>();
  const words: Words = [];
  let word: Letter[] = [];
  const breakWord = () => {
    if (word.length) words.push(word);
    word = [];
  };

  for (const t of text.matchAll(MORSE_TOKEN)) {
    const tok = t[0];
    const start = t.index;
    const end = start + tok.length;
    if (tok === '/' || tok === '|') breakWord();
    else if (/^\s+$/u.test(tok)) {
      if (tok.length >= 3) breakWord();
    } else {
      const literal = LITERAL.exec(tok);
      if (literal) {
        unknown.add(tok);
        word.push({ ch: literal[1], morse: '', known: false, kind: 'unknown', raw: tok, start, end });
        continue;
      }
      const code = normaliseCode(tok);
      const valid = /^[.-]+$/.test(code);
      const ch = valid ? decode.get(code) : undefined;
      const ps = valid && !ch ? prosign.get(code) : undefined;
      if (ch) word.push({ ch, morse: code, known: true, kind: 'char', raw: tok, start, end });
      else if (ps) word.push({ ch: `<${ps}>`, morse: code, known: true, kind: 'prosign', raw: tok, start, end });
      else {
        unknown.add(tok);
        word.push({ ch: '#', morse: valid ? code : '', known: false, kind: 'unknown', raw: tok, start, end });
      }
    }
  }
  breakWord();
  return { words, unknown: [...unknown] };
}

export function parse(mode: Mode, text: string, opts?: CodecOptions): Parsed {
  return mode === 'text' ? encodeText(text, opts) : decodeMorse(text, opts);
}

// ---------------------------------------------------------------- output

/** Would decodeMorse read `raw` back as this same unknown token? */
function safeInMorse(raw: string, opts?: CodecOptions): boolean {
  if (/[\s/|]/u.test(raw) || LITERAL.test(raw)) return false;
  const code = normaliseCode(raw);
  if (/^[.-]+$/.test(code)) {
    // An unknown code can go back bare; anything that would decode to a letter can't.
    const { decode, prosign } = alphabet(opts);
    return raw === code && !decode.has(code) && !prosign.has(code);
  }
  return true;
}

/** Would encodeText read `raw` back as this same unknown character? */
function safeInText(raw: string, opts?: CodecOptions): boolean {
  return Array.from(raw).length === 1 && !/[\s<>[\]]/u.test(raw) && !alphabet(opts).encode.has(raw.toUpperCase());
}

/** A letter as text: itself if it has a code, else something encodeText reads back the same. */
function textOf(l: Letter, opts?: CodecOptions): string {
  if (l.known) return l.ch;
  const literal = LITERAL.exec(l.raw);
  const inner = literal ? literal[1] : l.raw;
  if (safeInText(inner, opts) && l.morse === '') return inner;
  return literal ? l.raw : `{${inner}}`;
}

/** A letter as Morse: its code, else something decodeMorse reads back the same. */
function morseOf(l: Letter, opts?: CodecOptions): string {
  if (l.known) return l.morse;
  const literal = LITERAL.exec(l.raw);
  const inner = literal ? literal[1] : l.raw;
  return safeInMorse(inner, opts) ? inner : `{${inner}}`;
}

/**
 * The translation as plain text: Morse for text mode, letters for Morse mode.
 * Feeding it back into the other mode gives the original message again (letters
 * are upper-cased, and AR/BT/KN/AS come back as + = ( & since they're the same signal).
 */
export function plainOutput(mode: Mode, words: Words, opts?: CodecOptions): string {
  return mode === 'text' ? morseString(words, opts) : textString(words, opts);
}

/** The message as dots and dashes, whichever mode it was typed in. */
export function morseString(words: Words, opts?: CodecOptions): string {
  return words.map((w) => w.map((l) => morseOf(l, opts)).join(' ')).join(' / ');
}

/** The message as text, whichever mode it was typed in. Undecodable codes are kept in braces. */
export function textString(words: Words, opts?: CodecOptions): string {
  return words.map((w) => w.map((l) => textOf(l, opts)).join('')).join(' ');
}
