import type { Rng } from './random';

/**
 * A formal message in the radiogram format used on traffic nets:
 *
 *   preamble  NR 101 R G4ABC 12 LEEDS NOV 21
 *   address   MARY SMITH = 14 HIGH STREET = YORK
 *   =         (BT: start of text)
 *   text      ARRIVED SAFELY X WEATHER FINE X LOVE TO ALL
 *   =         (BT: end of text)
 *   signature JOHN
 *   AR        (end of message)
 *
 * The check is the number of words in the text, so the receiver can tell if a
 * word went missing. X stands in for a full stop and counts as a word.
 */
export type Precedence = 'R' | 'W' | 'P' | 'EMERGENCY';

export const PRECEDENCE: Record<Precedence, string> = {
  R: 'Routine',
  W: 'Welfare',
  P: 'Priority',
  EMERGENCY: 'Emergency',
};

export interface Radiogram {
  number: number;
  precedence: Precedence;
  station: string;
  check: number;
  place: string;
  date: string;
  to: string;
  address: string;
  city: string;
  text: string[];
  signature: string;
}

const pick = <T,>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const TEXTS = [
  'ARRIVED SAFELY X WEATHER FINE X LOVE TO ALL',
  'HAPPY BIRTHDAY X HOPE TO SEE YOU SOON',
  'CLUB MEETING MOVED TO FRIDAY X PLEASE TELL OTHERS',
  'ALL WELL HERE X PHONE WHEN YOU CAN',
  'CONGRATULATIONS ON YOUR NEW LICENCE X BEST WISHES',
  'TRAIN DELAYED X ARRIVING SUNDAY EVENING',
];
const PEOPLE = ['MARY SMITH', 'JOHN BROWN', 'ANNE JONES', 'PETER GREEN', 'SUE TAYLOR', 'DAVID WOOD'];
const STREETS = ['14 HIGH STREET', '2 MILL LANE', '37 PARK ROAD', '9 CHURCH ROW', '120 STATION ROAD'];
const PLACES = ['LEEDS', 'YORK', 'BATH', 'DERBY', 'LINCOLN', 'CHESTER', 'PERTH', 'BANGOR'];
const SIGS = ['JOHN', 'ALAN', 'KATE', 'MUM', 'DAD', 'BOB', 'THE CLUB'];

export function makeRadiogram(rng: Rng, from: { station: string; place?: string }, date = new Date()): Radiogram {
  const text = pick(TEXTS, rng).split(' ');
  return {
    number: 100 + Math.floor(rng() * 899),
    precedence: rng() < 0.75 ? 'R' : rng() < 0.6 ? 'W' : 'P',
    station: from.station,
    check: text.length,
    place: from.place ?? pick(PLACES, rng),
    date: `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`,
    to: pick(PEOPLE, rng),
    address: pick(STREETS, rng),
    city: pick(PLACES, rng),
    text,
    signature: pick(SIGS, rng),
  };
}

/** The message as it's sent in Morse (= is BT, <AR> ends it). */
export function radiogramText(r: Radiogram): string {
  return [
    `NR ${r.number} ${r.precedence} ${r.station} ${r.check} ${r.place} ${r.date}`,
    `${r.to} = ${r.address} = ${r.city}`,
    '=',
    r.text.join(' '),
    '=',
    r.signature,
    '<AR>',
  ].join(' ');
}

/** The fields you fill in when receiving. */
export interface RadiogramForm {
  number: string;
  precedence: string;
  station: string;
  check: string;
  place: string;
  date: string;
  to: string;
  address: string;
  city: string;
  text: string;
  signature: string;
}

export const FORM_FIELDS: { key: keyof RadiogramForm; label: string }[] = [
  { key: 'number', label: 'Number' },
  { key: 'precedence', label: 'Precedence' },
  { key: 'station', label: 'Station of origin' },
  { key: 'check', label: 'Check' },
  { key: 'place', label: 'Place of origin' },
  { key: 'date', label: 'Date' },
  { key: 'to', label: 'To' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'Town' },
  { key: 'text', label: 'Text' },
  { key: 'signature', label: 'Signature' },
];

export function toForm(r: Radiogram): RadiogramForm {
  return {
    number: String(r.number),
    precedence: r.precedence,
    station: r.station,
    check: String(r.check),
    place: r.place,
    date: r.date,
    to: r.to,
    address: r.address,
    city: r.city,
    text: r.text.join(' '),
    signature: r.signature,
  };
}

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

/** Which fields you got right. The check is also validated against your own copy of the text. */
export function checkForm(r: Radiogram, got: RadiogramForm) {
  const want = toForm(r);
  const fields = FORM_FIELDS.map(({ key, label }) => ({ key, label, ok: norm(got[key]) === norm(want[key]), want: want[key], got: got[key] }));
  const wordsCopied = norm(got.text).split(' ').filter(Boolean).length;
  return {
    fields,
    right: fields.filter((f) => f.ok).length,
    total: fields.length,
    /** Your copy of the text has the number of words the check says it should. */
    checkAgrees: wordsCopied === r.check,
  };
}
