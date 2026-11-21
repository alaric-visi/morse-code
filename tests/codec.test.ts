import { describe, expect, it } from 'vitest';
import {
  charToMorse,
  decodeMorse,
  encodeText,
  extendedChars,
  morseString,
  morseToChar,
  parse,
  plainOutput,
  prosigns,
  textString,
  type Mode,
} from '../src/core/codec';

const decoded = (s: string, extended = false) => plainOutput('morse', decodeMorse(s, { extended }).words);

/** Switch mode twice: what comes back into the original box. */
function roundTrip(mode: Mode, input: string, extended = false) {
  const other: Mode = mode === 'text' ? 'morse' : 'text';
  const once = plainOutput(mode, parse(mode, input, { extended }).words, { extended });
  return plainOutput(other, parse(other, once, { extended }).words, { extended });
}

describe('alphabets', () => {
  it('ITU has 54 characters and a one-to-one code table', () => {
    expect(Object.keys(charToMorse)).toHaveLength(54);
    expect(Object.keys(morseToChar)).toHaveLength(54);
  });

  it('extended letters never clash with an ITU code', () => {
    for (const code of Object.values(extendedChars)) expect(morseToChar[code]).toBeUndefined();
  });

  it('every prosign is its letters run together', () => {
    for (const p of prosigns) {
      expect(Array.from(p.name, (c) => charToMorse[c]).join('')).toBe(p.code);
    }
  });
});

describe('encodeText', () => {
  it('encodes words and upper-cases letters', () => {
    const { words, unknown } = encodeText('  sos  help ');
    expect(words.map((w) => w.map((l) => l.ch).join(''))).toEqual(['SOS', 'HELP']);
    expect(words[0].map((l) => l.morse)).toEqual(['...', '---', '...']);
    expect(unknown).toEqual([]);
  });

  it('records where each letter came from', () => {
    const { words } = encodeText(' ab  c');
    expect(words.flat().map((l) => [l.start, l.end])).toEqual([[1, 2], [2, 3], [5, 6]]);
  });

  it('flags characters with no code, once each, keeping them', () => {
    const { words, unknown } = encodeText('a#b#c%');
    expect(unknown).toEqual(['#', '%']);
    expect(words[0][1]).toMatchObject({ ch: '#', morse: '', known: false, kind: 'unknown', raw: '#' });
  });

  it('keeps astral characters whole', () => {
    expect(encodeText('a😀').unknown).toEqual(['😀']);
  });

  it('maps ß → SS back to the same source', () => {
    const { words } = encodeText('ß');
    expect(words[0].map((l) => [l.ch, l.start, l.end])).toEqual([['S', 0, 1], ['S', 0, 1]]);
  });

  it('parses prosigns in <> or [] as one letter with no gaps', () => {
    const { words } = encodeText('hi <sk> [ar]');
    expect(words[1][0]).toMatchObject({ ch: '<SK>', morse: '...-.-', kind: 'prosign', known: true });
    expect(words[2][0]).toMatchObject({ ch: '<AR>', morse: '.-.-.', kind: 'prosign' });
    expect(encodeText('<SOS>').words[0]).toHaveLength(1);
  });

  it('treats an invalid prosign as ordinary characters', () => {
    const { words, unknown } = encodeText('<a%>');
    expect(words[0].map((l) => l.ch)).toEqual(['<', 'A', '%', '>']);
    expect(unknown).toEqual(['<', '%', '>']);
  });

  it('accented letters only with the extended alphabet', () => {
    expect(encodeText('café').unknown).toEqual(['É']);
    const ext = encodeText('café', { extended: true });
    expect(ext.unknown).toEqual([]);
    expect(ext.words[0][3].morse).toBe('..-..');
  });

  it('{…} passes text through as one unknown', () => {
    const { words } = encodeText('a{......}b');
    expect(words[0].map((l) => [l.ch, l.known])).toEqual([['A', true], ['......', false], ['B', true]]);
  });
});

describe('decodeMorse', () => {
  it('decodes letters and words split by /', () => {
    expect(decoded('.... . .-.. .-.. --- / .-- --- .-. .-.. -..')).toBe('HELLO WORLD');
  });

  it('accepts | and three or more spaces as word gaps', () => {
    expect(decoded('... --- ...|.- ')).toBe('SOS A');
    expect(decoded('...   ---')).toBe('S O');
    expect(decoded('.-/-...')).toBe('A B');
  });

  it('normalises look-alike dots and dashes', () => {
    expect(decoded('••• ——— ··· _ – −')).toBe('SOSTTT');
  });

  it('keeps unknown and invalid codes, in braces', () => {
    const { words, unknown } = decodeMorse('...... .x. ...');
    expect(unknown).toEqual(['......', '.x.']);
    expect(words[0].map((l) => l.ch)).toEqual(['#', '#', 'S']);
    expect(plainOutput('morse', words)).toBe('{......}{.x.}S');
    expect(decoded('% 😀')).toBe('%😀');
  });

  it('decodes prosigns that are not also characters', () => {
    expect(decoded('...-.- / ........ / ...---...')).toBe('<SK> <HH> <SOS>');
    // AR has the same signal as +, so it reads as +.
    expect(decoded('.-.-.')).toBe('+');
  });

  it('decodes extended letters only when enabled', () => {
    expect(decoded('..-..')).toBe('{..-..}');
    expect(decoded('..-..', true)).toBe('É');
    // Several letters share a code; the first listed wins.
    expect(decoded('.-.-', true)).toBe('Ä');
  });

  it('records offsets', () => {
    expect(decodeMorse('.- / -...').words.flat().map((l) => [l.start, l.end])).toEqual([[0, 2], [5, 9]]);
  });
});

describe('round trip (switch mode twice)', () => {
  it.each([
    'HELLO, WORLD! 73',
    'A%B #1',
    'PIPE|AND/SLASH',
    'EMOJI 😀 OK',
    'CQ DE G4ABC <SK>',
    'DOTS... AND - DASHES',
    '{......} LITERAL',
    'BRACE { ONLY',
  ])('text: %s', (s) => expect(roundTrip('text', s)).toBe(s));

  it('upper-cases text', () => expect(roundTrip('text', 'hello')).toBe('HELLO'));

  it.each([
    '.... . .-.. .-.. --- / .-- --- .-. .-.. -..',
    '...... / .x. / ...',
    '...-.- / -.-.--',
  ])('morse: %s', (s) => expect(roundTrip('morse', s)).toBe(s));

  it('extended text survives with the extended alphabet on', () => {
    expect(roundTrip('text', 'ÉTÉ À NOËL', true)).toBe('ÉTÉ À NOËL');
    expect(roundTrip('text', 'ÉTÉ', false)).toBe('ÉTÉ');
  });

  it('morseString and textString work from either mode', () => {
    const t = encodeText('sos 1');
    const m = decodeMorse('... --- ... / .----');
    expect(morseString(t.words)).toBe('... --- ... / .----');
    expect(morseString(m.words)).toBe('... --- ... / .----');
    expect(textString(t.words)).toBe('SOS 1');
    expect(textString(m.words)).toBe('SOS 1');
  });
});
