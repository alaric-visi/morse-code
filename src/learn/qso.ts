import details from '../../content/qso/details.json';
import { makeCallsign } from './callsigns';
import type { Rng } from './random';
import type { FistPreset } from '../core/fist-model';

export type QsoStyle = 'dx' | 'standard' | 'ragchew';

export const QSO_STYLES: Record<QsoStyle, { label: string; about: string }> = {
  dx: { label: 'DX contact', about: 'Short and to the point: calls, a 5NN report, thanks. How rare and distant stations work.' },
  standard: { label: 'Standard QSO', about: 'The classic exchange: report, name and location, then rig, antenna and weather.' },
  ragchew: { label: 'Rag-chew', about: 'A proper conversation: the standard exchange, then work, hobbies and how long you have both been on the air.' },
};

export interface Operator {
  call: string;
  name: string;
  qth: string;
}

export interface Station extends Operator {
  country: string;
  rst: string;
  rig: string;
  power: string;
  antenna: string;
  wx: string;
  temp: number;
  job: string;
  hobby: string;
  years: number;
  fist: FistPreset;
}

export interface Turn {
  from: 'them' | 'you';
  text: string;
  /** For your turns: things that must be in what you send (callsigns, report, name). */
  expect?: string[];
}

export interface Qso {
  style: QsoStyle;
  them: Station;
  turns: Turn[];
}

const pick = <T,>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];
const FISTS: FistPreset[] = ['steady', 'steady', 'heavy', 'rushed', 'swing', 'bug', 'drifting'];

export function makeStation(rng: Rng): Station {
  const c = makeCallsign(rng, { portable: false });
  return {
    call: c.call,
    name: pick(details.names, rng),
    qth: c.city,
    country: c.country,
    rst: pick(['599', '579', '589', '559', '449', '569'], rng),
    rig: pick(details.rigs, rng),
    power: pick(details.powers, rng),
    antenna: pick(details.antennas, rng),
    wx: pick(details.weather, rng),
    temp: Math.round(rng() * 25) - 2,
    job: pick(details.jobs, rng),
    hobby: pick(details.hobbies, rng),
    years: 2 + Math.floor(rng() * 40),
    fist: pick(FISTS, rng),
  };
}

/** Time-of-day greeting the way operators abbreviate it. */
const greeting = (hour: number) => (hour < 12 ? 'GM' : hour < 18 ? 'GA' : 'GE');

/**
 * A complete simulated contact. "Them" calls CQ; you answer. Each of your turns
 * lists what it must contain, so a keyed reply can be checked leniently.
 */
export function makeQso(style: QsoStyle, me: Operator, rng: Rng, hour = 12): Qso {
  const t = makeStation(rng);
  const T = t.call;
  const M = me.call;
  const gm = greeting(hour);
  const myRst = pick(['599', '579', '589'], rng);
  const turns: Turn[] = [];

  if (style === 'dx') {
    turns.push(
      { from: 'them', text: `CQ CQ DE ${T} ${T} K` },
      { from: 'you', text: `${M} ${M}`, expect: [M] },
      { from: 'them', text: `${M} 5NN TU` },
      { from: 'you', text: `TU 5NN 73`, expect: ['5NN'] },
      { from: 'them', text: `TU 73 QRZ? DE ${T}` },
    );
    return { style, them: t, turns };
  }

  turns.push(
    { from: 'them', text: `CQ CQ CQ DE ${T} ${T} ${T} K` },
    { from: 'you', text: `${T} DE ${M} ${M} K`, expect: [T, M] },
    {
      from: 'them',
      text: `${M} DE ${T} ${gm} OM TNX FER CALL = UR RST ${t.rst} ${t.rst} = NAME ${t.name} ${t.name} = QTH ${t.qth} ${t.qth} = HW? ${M} DE ${T} KN`,
    },
    {
      from: 'you',
      text: `${T} DE ${M} R TNX ${t.name} = UR RST ${myRst} ${myRst} = NAME ${me.name} ${me.name} = QTH ${me.qth} ${me.qth} = ${T} DE ${M} KN`,
      expect: [T, M, myRst, me.name],
    },
    {
      from: 'them',
      text: `${M} DE ${T} R FB ${me.name} = RIG ${t.rig} PWR ${t.power}W = ANT ${t.antenna} = WX ${t.wx} TEMP ${t.temp}C = ${M} DE ${T} KN`,
    },
  );

  if (style === 'ragchew') {
    turns.push(
      {
        from: 'you',
        text: `${T} DE ${M} R FB ${t.name} SOLID CPY = RIG HR IS HOMEBREW = WX FINE = WHAT DO YOU DO? ${T} DE ${M} KN`,
        expect: [T, M],
      },
      {
        from: 'them',
        text: `${M} DE ${T} R R = I AM ${t.job} = LICENSED ${t.years} YRS = ALSO LIKE ${t.hobby} = HOW LONG ON CW? ${M} DE ${T} KN`,
      },
      {
        from: 'you',
        text: `${T} DE ${M} FB = I AM LEARNING CW AND ENJOY IT = ${T} DE ${M} KN`,
        expect: [T, M],
      },
      {
        from: 'them',
        text: `${M} DE ${T} FB ${me.name} UR CW IS GUD = KEEP AT IT = HOPE CU AGN = 73 ES GL = ${M} DE ${T} <SK>`,
      },
      { from: 'you', text: `${T} DE ${M} TNX QSO 73 <SK>`, expect: [T, M] },
    );
  } else {
    turns.push(
      { from: 'you', text: `${T} DE ${M} R FB = TNX FER QSO = 73 GL ${T} DE ${M} <SK>`, expect: [T, M] },
      { from: 'them', text: `${M} DE ${T} TNX ${me.name} 73 GL <SK> TU` },
    );
  }
  return { style, them: t, turns };
}

/** Normalise copy for grading: the = separator and prosign brackets don't count. */
export const forGrading = (s: string) => s.toUpperCase().replace(/[<>=]/g, ' ').replace(/\s+/g, ' ').trim();

/** Which expected items are missing from what you sent. */
export function missingFrom(sent: string, expect: readonly string[] = []): string[] {
  const words = new Set(forGrading(sent).split(' '));
  return expect.filter((e) => !words.has(e.toUpperCase()));
}
