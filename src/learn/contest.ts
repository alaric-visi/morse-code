import contestData from '../../content/contests/contests.json';
import regions from '../../content/callsigns/regions.json';
import details from '../../content/qso/details.json';
import type { FistPreset } from '../core/fist-model';
import { COUNTRIES, makeCallsign } from './callsigns';
import { cut } from './cut';
import type { Rng } from './random';
import { baseCall, continentOf, countryOf, prefixOf, zoneOf } from './zones';

export type Field = 'rst' | 'serial' | 'zone' | 'state' | 'class' | 'section' | 'prec' | 'call' | 'check' | 'name' | 'number' | 'location';
export type Mult = 'none' | 'prefix' | 'zone' | 'state' | 'section' | 'call';
export type Points = 'one' | 'two' | 'three' | 'continent';

export interface ContestDef {
  id: string;
  name: string;
  kind: 'contest' | 'activation' | 'pileup';
  exchange: Field[];
  callers: 'uk' | 'world' | 'na';
  mult: Mult;
  points: Points;
  goal?: number;
  summary: string;
}

export const CONTESTS: readonly ContestDef[] = contestData.contests as ContestDef[];
export const contestById = (id: string) => CONTESTS.find((c) => c.id === id) ?? CONTESTS[0];

export const FIELD_LABEL: Record<Field, string> = {
  rst: 'RST',
  serial: 'Serial',
  zone: 'Zone',
  state: 'State/Prov',
  class: 'Class',
  section: 'Section',
  prec: 'Prec',
  call: 'Call',
  check: 'Check',
  name: 'Name',
  number: 'Nr/State',
  location: 'Location',
};

export interface Caller {
  id: number;
  call: string;
  wpm: number;
  fist: FistPreset;
  /** Signal strength 0.15–1. */
  strength: number;
  /** Hz from your transmit frequency (split: 1000–3000 Hz up). */
  offset: number;
  /** Their true exchange. */
  exch: Partial<Record<Field, string>>;
  /** How many more of your overs they'll keep calling through before giving up. */
  patience: number;
}

export interface Me {
  call: string;
  name: string;
  /** Activation reference (park or summit), for activations. */
  ref?: string;
}

const pick = <T,>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];
const FISTS: FistPreset[] = ['steady', 'steady', 'steady', 'heavy', 'rushed', 'bug', 'swing'];
const UK = ['England', 'England', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'Isle of Man'];

function callerCountry(def: ContestDef, rng: Rng): string | undefined {
  if (def.callers === 'uk') return pick(UK, rng);
  if (def.callers === 'na') return rng() < 0.85 ? 'USA' : 'Canada';
  return pick(COUNTRIES, rng).country;
}

/** Their side of the exchange, true to where they are. */
function exchangeFor(def: ContestDef, call: string, rng: Rng, minute: number): Caller['exch'] {
  const country = countryOf(call)?.country ?? '';
  const ex: Caller['exch'] = {};
  for (const f of def.exchange) {
    switch (f) {
      case 'rst':
        // Contests are 5NN all round; pileups and activations give real reports.
        ex.rst = def.kind === 'contest' || rng() < 0.75 ? '599' : pick(['579', '589', '559', '449'], rng);
        break;
      case 'serial':
        // Serials climb through the contest, at different rates for different stations.
        ex.serial = String(1 + Math.floor(minute * (0.5 + rng() * 2) + rng() * 20));
        break;
      case 'zone':
        ex.zone = String(zoneOf(call) ?? 14);
        break;
      case 'state':
        ex.state = country === 'Canada' ? pick(regions.provinces, rng) : pick(regions.states, rng);
        break;
      case 'class':
        ex.class = pick(regions.fieldDayClasses, rng);
        break;
      case 'section':
        ex.section = pick(regions.sections, rng);
        break;
      case 'prec':
        ex.prec = pick(['Q', 'A', 'B', 'U', 'M', 'S'], rng);
        break;
      case 'call':
        ex.call = baseCall(call);
        break;
      case 'check':
        ex.check = String(Math.floor(rng() * 100)).padStart(2, '0');
        break;
      case 'name':
        ex.name = pick(details.names, rng);
        break;
      case 'number':
        ex.number = rng() < 0.6 ? String(1 + Math.floor(rng() * 3200)) : country === 'USA' ? pick(regions.states, rng) : (prefixOf(call).replace(/\d+$/, '') || 'DX');
        break;
      case 'location':
        ex.location = country === 'USA' ? pick(regions.states, rng) : country === 'Canada' ? pick(regions.provinces, rng) : prefixOf(call).replace(/\d+$/, '');
        break;
    }
  }
  return ex;
}

/** How a field sounds on the air (reports and serials use cut numbers). */
function onAir(f: Field, v: string): string {
  if (f === 'rst') return cut(v);
  if (f === 'serial') return cut(v.padStart(3, '0'));
  return v;
}

/** Their exchange as sent: "TU 5NN 023", "R 5NN 14", "BOB 1234". */
export function exchangeText(def: ContestDef, ex: Caller['exch']): string {
  return def.exchange.map((f) => onAir(f, ex[f] ?? '')).join(' ');
}

/** What you send as your exchange in this contest. */
export function myExchange(def: ContestDef, me: Me, serial: number): string {
  return def.exchange
    .map((f) => {
      switch (f) {
        case 'rst':
          return '5NN';
        case 'serial':
          return cut(String(serial).padStart(3, '0'));
        case 'zone':
          return String(zoneOf(me.call) ?? 14);
        case 'state':
          return '100'; // you're outside North America: send your power
        case 'class':
          return '1D';
        case 'section':
          return 'DX';
        case 'prec':
          return 'A';
        case 'call':
          return baseCall(me.call);
        case 'check':
          return '24';
        case 'name':
          return me.name;
        case 'number':
          return 'UK';
        case 'location':
          return me.ref ?? 'GB-0000';
      }
    })
    .join(' ');
}

export interface LogInput {
  call: string;
  fields: Partial<Record<Field, string>>;
}

export interface LogResult {
  /** Was there a real caller with this exact call? */
  callOk: boolean;
  /** Field-by-field check against what they really sent. */
  fieldsOk: Partial<Record<Field, boolean>>;
  dupe: boolean;
  points: number;
  /** The multiplier this contact added, if new. */
  newMult: string | null;
  /** What they actually sent (for showing mistakes). */
  truth: Caller | null;
}

export interface Logged {
  call: string;
  fields: Partial<Record<Field, string>>;
  at: number;
  ok: boolean;
  points: number;
  mult: string | null;
}

const norm = (s: string | undefined) => (s ?? '').toUpperCase().replace(/\s+/g, '');
const sameValue = (f: Field, a: string | undefined, b: string | undefined) => {
  const x = norm(a);
  const y = norm(b);
  if (f === 'serial' || f === 'zone' || f === 'check') return String(Number(x.replace(/T|O/g, '0').replace(/N/g, '9').replace(/A/g, '1').replace(/E/g, '5'))) === String(Number(y));
  if (f === 'rst') return x.replace(/N/g, '9') === y;
  return x === y;
};

/**
 * You're running: calling CQ, answering callers, logging. Pure and clock-free:
 * every method takes `now` (seconds) where time matters, so a whole contest can
 * be simulated in a test.
 */
export class RunEngine {
  serial = 1;
  log: Logged[] = [];
  waiting: Caller[] = [];
  current: Caller | null = null;
  private nextId = 1;
  private mults = new Set<string>();
  private myContinent: string;
  private myCountry: string;

  constructor(
    public def: ContestDef,
    public me: Me,
    private rng: Rng,
    public opts: { split?: boolean; maxCallers?: number; minute?: () => number } = {},
  ) {
    this.myContinent = continentOf(me.call) ?? 'EU';
    this.myCountry = countryOf(me.call)?.country ?? 'England';
  }

  /** A fresh caller for this contest. */
  newCaller(): Caller {
    const minute = this.opts.minute?.() ?? 0;
    let call = makeCallsign(this.rng, { country: callerCountry(this.def, this.rng), portable: this.def.kind === 'activation' ? false : undefined }).call;
    // Never two callers with the same call, and never someone already logged (in a contest).
    for (let tries = 0; tries < 10 && (this.waiting.some((c) => c.call === call) || this.isLogged(call)); tries++) {
      call = makeCallsign(this.rng, { country: callerCountry(this.def, this.rng) }).call;
    }
    const split = this.opts.split;
    return {
      id: this.nextId++,
      call,
      wpm: 18 + Math.floor(this.rng() * 14),
      fist: pick(FISTS, this.rng),
      strength: 0.15 + this.rng() * 0.85,
      offset: split ? Math.round(1000 + this.rng() * 2000) : Math.round((this.rng() * 2 - 1) * 350),
      exch: exchangeFor(this.def, call, this.rng, minute),
      patience: 2 + Math.floor(this.rng() * 3),
    };
  }

  private isLogged(call: string) {
    return this.log.some((l) => l.ok && baseCall(l.call) === baseCall(call));
  }

  /** You call CQ (or send TU and listen): new callers join anyone still waiting. Returns who calls now. */
  cq(): Caller[] {
    const max = this.opts.maxCallers ?? (this.def.kind === 'pileup' ? 8 : 3);
    // Waiting callers lose patience each time they're passed over.
    this.waiting = this.waiting.filter((c) => --c.patience > 0);
    const want = this.def.kind === 'pileup' ? 3 + Math.floor(this.rng() * (max - 2)) : Math.floor(this.rng() * (max + 1));
    while (this.waiting.length < want) this.waiting.push(this.newCaller());
    this.current = null;
    return [...this.waiting];
  }

  /**
   * You send a call or part of one. An exact match is "the" caller; a partial
   * (e.g. "K1?" or "ABC") makes the matching callers call again; nothing typed
   * (or "?" / "AGN") makes everyone call again.
   */
  answer(query: string): { exact: Caller | null; calling: Caller[] } {
    const q = query.toUpperCase().trim();
    const exact = this.waiting.find((c) => c.call === q) ?? null;
    if (exact) {
      this.current = exact;
      return { exact, calling: [exact] };
    }
    const frag = q.replace(/\?|AGN/g, '');
    const calling = frag ? this.waiting.filter((c) => c.call.includes(frag)) : [...this.waiting];
    return { exact: null, calling };
  }

  /** What you send to the selected caller: their call and your exchange. */
  myOver(): string {
    if (!this.current) return '';
    return `${this.current.call} ${myExchange(this.def, this.me, this.serial)}`;
  }

  /** The caller's reply to your exchange. */
  theirReply(c: Caller = this.current!): string {
    return `${this.rng() < 0.5 ? 'TU' : 'R'} ${exchangeText(this.def, c.exch)}`;
  }

  /** Log a contact. Checks the call and every field against what was really sent. */
  logContact(input: LogInput, now: number): LogResult {
    const call = input.call.toUpperCase().trim();
    const truth = this.waiting.find((c) => c.call === call) ?? (this.current && this.current.call === call ? this.current : null);
    const target = truth ?? this.current;
    const fieldsOk: LogResult['fieldsOk'] = {};
    for (const f of this.def.exchange) fieldsOk[f] = target ? sameValue(f, input.fields[f], target.exch[f]) : false;
    const callOk = !!truth;
    const ok = callOk && Object.values(fieldsOk).every(Boolean);
    const dupe = this.def.kind === 'contest' && this.isLogged(call);
    let points = ok && !dupe ? this.pointsFor(call) : 0;
    let newMult: string | null = null;
    if (ok && !dupe && this.def.mult !== 'none') {
      const m = this.multFor(call, target!.exch);
      if (m && !this.mults.has(m)) {
        this.mults.add(m);
        newMult = m;
      }
    }
    if (dupe) points = 0;
    this.log.push({ call, fields: input.fields, at: now, ok: ok && !dupe, points, mult: newMult });
    if (truth) this.waiting = this.waiting.filter((c) => c !== truth);
    if (ok) this.serial++;
    this.current = null;
    return { callOk, fieldsOk, dupe, points, newMult, truth: target };
  }

  private pointsFor(call: string): number {
    switch (this.def.points) {
      case 'one':
        return 1;
      case 'two':
        return 2;
      case 'three':
        return 3;
      case 'continent': {
        const cont = continentOf(call);
        return cont && cont !== this.myContinent ? 3 : 1;
      }
    }
  }

  private multFor(call: string, ex: Caller['exch']): string | null {
    switch (this.def.mult) {
      case 'prefix':
        return prefixOf(call);
      case 'zone':
        return ex.zone ?? null;
      case 'state':
        return ex.state ?? null;
      case 'section':
        return ex.section ?? null;
      case 'call':
        return baseCall(call);
      default:
        return null;
    }
  }

  score() {
    const good = this.log.filter((l) => l.ok);
    const points = good.reduce((a, l) => a + l.points, 0);
    const mults = this.def.mult === 'none' ? 1 : Math.max(1, this.mults.size);
    return { qsos: good.length, busted: this.log.length - good.length, points, mults: this.def.mult === 'none' ? 0 : this.mults.size, total: points * mults };
  }

  /** Contacts per hour over the last ten minutes (or since the start, if sooner). */
  rate(now: number, started: number): number {
    const window = Math.min(600, Math.max(60, now - started));
    const n = this.log.filter((l) => l.ok && l.at >= now - window).length;
    return Math.round((n * 3600) / window);
  }

  get myCountryName() {
    return this.myCountry;
  }
}

/** Search and pounce: stations already calling CQ, spread across the band segment (kHz offsets). */
export interface Runner extends Caller {
  /** kHz above the bottom of the segment. */
  khz: number;
  worked: boolean;
}

export function makeRunners(def: ContestDef, rng: Rng, n: number, spanKhz = 40): Runner[] {
  const engine = new RunEngine(def, { call: 'G0AAA', name: 'X' }, rng);
  const out: Runner[] = [];
  const used: number[] = [];
  while (out.length < n) {
    const khz = Math.round((1 + rng() * (spanKhz - 2)) * 100) / 100;
    if (used.some((u) => Math.abs(u - khz) < 0.6)) continue;
    used.push(khz);
    out.push({ ...engine.newCaller(), khz, worked: false });
  }
  return out.sort((a, b) => a.khz - b.khz);
}

/** What a running station sends: their CQ, and their reply when you call them. */
export const runnerCq = (def: ContestDef, r: Runner) =>
  def.kind === 'activation' ? `CQ ${def.id.toUpperCase()} DE ${r.call} ${r.call} K` : `CQ TEST ${r.call} ${r.call}`;
export const runnerReply = (def: ContestDef, r: Runner, myCall: string) => `${myCall} ${exchangeText(def, r.exch)}`;
