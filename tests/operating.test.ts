import { describe, expect, it } from 'vitest';
import regions from '../content/callsigns/regions.json';
import etiquette from '../content/procedure/etiquette.json';
import { charToMorse, encodeText } from '../src/core/codec';
import { buildSchedule } from '../src/core/schedule';
import { timing } from '../src/core/timing';
import { AdaptiveDecoder, type DecoderEvent } from '../src/core/decoder/decoder';
import { ToneKeyer, goertzel, strongestPitch } from '../src/core/decoder/tone-detect';
import { cut, uncut } from '../src/learn/cut';
import { baseCall, countryOf, prefixOf, zoneOf } from '../src/learn/zones';
import { addToLog, awards, fromAdif, isDupe, toAdif, type LogEntry } from '../src/learn/logbook';
import { checkForm, makeRadiogram, radiogramText, toForm } from '../src/learn/radiogram';
import { CONTESTS, RunEngine, contestById, exchangeText, makeRunners, myExchange } from '../src/learn/contest';
import { makeNet } from '../src/learn/net';
import { BANDS, bandById, daylight, openness, populate, sUnits } from '../src/learn/band-sim';
import { gradeCopy } from '../src/learn/drills';
import { seeded } from '../src/learn/random';
import { sanitizeProgress } from '../src/learn/progress';

const sendable = (s: string) => [...s.replace(/<SK>|<AR>/g, '').replace(/ /g, '')].every((c) => charToMorse[c]);
const ME = { call: 'G4XYZ', name: 'ALEX', qth: 'LEEDS' };

describe('callsign lookups', () => {
  it.each([
    ['G4ABC', 'England', 14],
    ['GM3XYZ/P', 'Scotland', 14],
    ['2E0AAA', 'England', 14],
    ['HB9XY', 'Switzerland', 14],
    ['K6ABC', 'USA', 3],
    ['W9XYZ', 'USA', 4],
    ['N2AB', 'USA', 5],
    ['VE7AB', 'Canada', 3],
    ['VK6AB', 'Australia', 29],
    ['JA1ABC', 'Japan', 25],
  ])('%s → %s, zone %i', (call, country, zone) => {
    expect(countryOf(call)?.country).toBe(country);
    expect(zoneOf(call)).toBe(zone);
  });
  it('prefixes and base calls', () => {
    expect(prefixOf('G4ABC')).toBe('G4');
    expect(prefixOf('2E0XYZ')).toBe('2E0');
    expect(prefixOf('DL1ABC/P')).toBe('DL1');
    expect(baseCall('GM3XYZ/P')).toBe('GM3XYZ');
    expect(countryOf('ZZ9ZZ')).toBeNull();
  });
});

describe('cut numbers', () => {
  it('cuts and uncuts', () => {
    expect(cut('599')).toBe('5NN');
    expect(cut('100')).toBe('1TT');
    expect(cut('015', true)).toBe('TAE');
    expect(uncut('5NN')).toBe('599');
    expect(uncut('1T')).toBe('10');
    expect(uncut('TAE')).toBe('015');
  });
});

describe('logbook', () => {
  const entries = (): LogEntry[] => {
    let log: LogEntry[] = [];
    log = addToLog(log, { call: 'g4abc', at: '2026-11-21T19:05:00.000Z', band: '40m', freq: 7.012, mode: 'CW', rstSent: '599', rstRcvd: '579', name: 'BOB', source: 'qso' });
    log = addToLog(log, { call: 'K1ABC', at: '2026-11-21T20:10:00.000Z', band: '20m', mode: 'CW', rstSent: '599', rstRcvd: '599', state: 'MA', exchSent: '5NN 001', exchRcvd: '5NN 042', source: 'contest', contest: 'wpx' });
    log = addToLog(log, { call: 'JA1XYZ', at: '2026-11-21T21:00:00.000Z', band: '20m', mode: 'CW', rstSent: '559', rstRcvd: '449', source: 'pileup' });
    return log;
  };
  it('fills in country and zone', () => {
    const log = entries();
    expect(log[0]).toMatchObject({ call: 'G4ABC', country: 'England', zone: 14 });
    expect(log[1]).toMatchObject({ country: 'USA', zone: 5 });
  });
  it('round-trips through ADIF', () => {
    const log = entries();
    const adi = toAdif(log, new Date('2026-11-21T22:00:00Z'));
    expect(adi).toContain('<CALL:5>G4ABC');
    expect(adi).toContain('<QSO_DATE:8>20261121');
    expect(adi).toContain('<TIME_ON:4>1905');
    expect(adi).toContain('<EOH>');
    const back = fromAdif(adi);
    expect(back).toHaveLength(3);
    expect(back[0]).toMatchObject({ call: 'G4ABC', band: '40m', freq: 7.012, rstSent: '599', rstRcvd: '579', name: 'BOB', at: '2026-11-21T19:05:00.000Z' });
    expect(back[1]).toMatchObject({ state: 'MA', exchRcvd: '5NN 042', contest: 'wpx', zone: 5 });
  });
  it('reads ADIF from other programs (lowercase tags, type indicators, no header)', () => {
    const back = fromAdif('<call:6>DL1ABC<band:3>40M<qso_date:8:d>20250102<time_on:6>123456<mode:2>CW<eor>');
    expect(back[0]).toMatchObject({ call: 'DL1ABC', band: '40m', at: '2025-01-02T12:34:56.000Z', country: 'Germany', source: 'import' });
  });
  it('tallies awards', () => {
    const a = awards(entries(), regions.states);
    expect(a.countries).toEqual(['England', 'Japan', 'USA']);
    expect(a.zones).toEqual([5, 14, 25]);
    expect(a.states).toEqual(['MA']);
    expect(a.continents).toEqual(['AS', 'EU', 'NA']);
  });
  it('spots dupes per band (and contest)', () => {
    const log = entries();
    expect(isDupe(log, 'K1ABC', '20m')).toBe(true);
    expect(isDupe(log, 'K1ABC', '40m')).toBe(false);
    expect(isDupe(log, 'K1ABC/P', '20m', 'wpx')).toBe(true);
  });
  it('progress keeps a sanitised log', () => {
    const p = sanitizeProgress({ log: [{ call: 'G4ABC', at: '2026-01-01T00:00:00Z', band: '40m', rstSent: '599', rstRcvd: '599', source: 'qso' }, { junk: 1 }] });
    expect(p.log).toHaveLength(1);
    expect(p.log[0].call).toBe('G4ABC');
  });
});

describe('radiograms', () => {
  const r = makeRadiogram(seeded(1), { station: 'G4XYZ', place: 'LEEDS' }, new Date('2026-11-21T12:00:00Z'));
  it('has a check equal to the word count, and is sendable', () => {
    expect(r.check).toBe(r.text.length);
    expect(r.date).toBe('NOV 21');
    const text = radiogramText(r);
    expect(text).toMatch(new RegExp(`^NR ${r.number} ${r.precedence} G4XYZ ${r.check} LEEDS NOV 21 `));
    expect(text.endsWith('<AR>')).toBe(true);
    expect(sendable(text)).toBe(true);
  });
  it('grades a received copy field by field', () => {
    expect(checkForm(r, toForm(r))).toMatchObject({ right: 11, total: 11, checkAgrees: true });
    const bad = { ...toForm(r), number: '999', text: r.text.slice(1).join(' ') };
    const res = checkForm(r, bad);
    expect(res.right).toBe(9);
    expect(res.checkAgrees).toBe(false);
  });
});

describe('contests', () => {
  it('every style is defined, sendable and summarised', () => {
    expect(CONTESTS.length).toBeGreaterThanOrEqual(10);
    for (const c of CONTESTS) {
      expect(c.summary.length).toBeGreaterThan(40);
      const e = new RunEngine(c, { ...ME, ref: 'GB-0412' }, seeded(3));
      for (const caller of e.cq().length ? e.waiting : [e.newCaller()]) {
        expect(sendable(exchangeText(c, caller.exch)), `${c.id}: ${exchangeText(c, caller.exch)}`).toBe(true);
      }
      expect(sendable(myExchange(c, { ...ME, ref: 'GB-0412' }, 7))).toBe(true);
    }
  });

  it('a perfect 30-minute contest: every contact counts, rate and score add up', () => {
    const def = contestById('zones');
    const rng = seeded(42);
    let minute = 0;
    const e = new RunEngine(def, ME, rng, { minute: () => minute });
    let t = 0;
    while (t < 30 * 60) {
      minute = t / 60;
      const callers = e.cq();
      t += 4; // your CQ
      if (!callers.length) continue;
      const pickOne = callers[0];
      e.answer(pickOne.call);
      t += 8; // exchange both ways
      const res = e.logContact({ call: pickOne.call, fields: { ...pickOne.exch } }, t);
      expect(res.callOk && Object.values(res.fieldsOk).every(Boolean)).toBe(true);
      t += 2; // TU
    }
    const s = e.score();
    expect(s.qsos).toBeGreaterThan(60);
    expect(s.busted).toBe(0);
    expect(s.total).toBe(s.points * s.mults);
    expect(e.rate(t, 0)).toBeGreaterThan(100);
  });

  it('busted calls, wrong fields and dupes score nothing', () => {
    const def = contestById('wpx');
    const e = new RunEngine(def, ME, seeded(5), { maxCallers: 3 });
    let callers = e.cq();
    while (!callers.length) callers = e.cq();
    const c = callers[0];
    expect(e.logContact({ call: c.call + 'X', fields: c.exch }, 10).callOk).toBe(false);
    callers = e.cq();
    while (!callers.length) callers = e.cq();
    const d = callers[0];
    const wrong = e.logContact({ call: d.call, fields: { ...d.exch, serial: '9999' } }, 20);
    expect(wrong.callOk).toBe(true);
    expect(wrong.fieldsOk.serial).toBe(false);
    expect(wrong.points).toBe(0);
  });

  it('serials and reports match when sent as cut numbers', () => {
    const def = contestById('wpx');
    const e = new RunEngine(def, ME, seeded(8));
    const c = e.newCaller();
    e.waiting.push(c);
    const typed = { rst: '5NN', serial: cut(c.exch.serial!.padStart(3, '0')) };
    expect(e.logContact({ call: c.call, fields: typed }, 1).points).toBeGreaterThan(0);
  });

  it('partial calls bring back only the matching callers', () => {
    const def = contestById('dxpileup');
    const e = new RunEngine(def, ME, seeded(9), { maxCallers: 8 });
    const callers = e.cq();
    const target = callers[0];
    const frag = target.call.slice(0, 2);
    const { exact, calling } = e.answer(`${frag}?`);
    expect(exact).toBeNull();
    expect(calling).toContain(target);
    for (const c of calling) expect(c.call).toContain(frag);
    expect(e.answer('?').calling).toHaveLength(callers.length);
    expect(e.answer(target.call).exact).toBe(target);
    expect(e.myOver()).toBe(`${target.call} 5NN`);
  });

  it('split pileups spread callers 1–3 kHz up', () => {
    const e = new RunEngine(contestById('dxpileup'), ME, seeded(10), { split: true, maxCallers: 10 });
    for (const c of e.cq()) {
      expect(c.offset).toBeGreaterThanOrEqual(1000);
      expect(c.offset).toBeLessThanOrEqual(3000);
    }
  });

  it('search-and-pounce runners are spread out and reply with their exchange', () => {
    const runners = makeRunners(contestById('ukclub'), seeded(11), 8);
    expect(runners).toHaveLength(8);
    for (let i = 1; i < runners.length; i++) expect(runners[i].khz - runners[i - 1].khz).toBeGreaterThanOrEqual(0.6);
    for (const r of runners) expect(['England', 'Scotland', 'Wales', 'Northern Ireland', 'Isle of Man']).toContain(countryOf(r.call)?.country);
  });
});

describe('nets', () => {
  it.each([true, false])('a net with you sending = %s runs open → traffic → close', (youSend) => {
    const n = makeNet(ME, seeded(12), youSend);
    expect(n.steps[0].text).toMatch(/^QST QST QST DE /);
    expect(n.steps[n.steps.length - 1].text).toMatch(/NET CLOSED/);
    for (const s of n.steps) expect(sendable(s.text), s.text).toBe(true);
    const yours = n.steps.filter((s) => s.from === 'you');
    for (const s of yours) for (const e of s.expect ?? []) expect(s.text.split(' ')).toContain(e);
    expect(n.steps.some((s) => s.form)).toBe(!youSend);
    expect(n.steps.map((s) => s.text).join(' ')).toContain(`NR ${n.radiogram.number}`);
  });
});

describe('band model', () => {
  const p = (hour: number, sfi = 150, k = 2) => ({ hour, sfi, k });
  it('daylight follows the clock', () => {
    expect(daylight(12)).toBe(1);
    expect(daylight(2)).toBe(0);
    expect(daylight(6.5)).toBeGreaterThan(0);
    expect(daylight(6.5)).toBeLessThan(1);
  });
  it('high bands need sun and flux; low bands are for night-time DX', () => {
    const b10 = bandById('10m');
    const b80 = bandById('80m');
    expect(openness(b10, 'dx', p(13, 200))).toBeGreaterThan(openness(b10, 'dx', p(13, 70)));
    expect(openness(b10, 'dx', p(13, 200))).toBeGreaterThan(openness(b10, 'dx', p(1, 200)));
    expect(openness(b80, 'dx', p(1))).toBeGreaterThan(openness(b80, 'dx', p(13)));
  });
  it('high bands skip over nearby stations', () => {
    const b20 = bandById('20m');
    expect(openness(b20, 'dx', p(13))).toBeGreaterThan(openness(b20, 'near', p(13)));
  });
  it('storms hurt', () => {
    const b15 = bandById('15m');
    expect(openness(b15, 'dx', p(13, 150, 8))).toBeLessThan(openness(b15, 'dx', p(13, 150, 1)));
  });
  it('populates a band with sendable stations inside the segment', () => {
    for (const b of BANDS) {
      for (const a of ['weekday', 'contest', 'dx'] as const) {
        for (const s of populate(b, p(14, 180, 1), a, seeded(13))) {
          expect(s.khz).toBeGreaterThanOrEqual(b.lo);
          expect(s.khz).toBeLessThanOrEqual(b.hi + 3);
          for (const l of s.lines) expect(sendable(l), l).toBe(true);
        }
      }
    }
    expect(populate(bandById('20m'), p(14, 180, 1), 'contest', seeded(14)).length).toBeGreaterThan(10);
  });
  it('S-meter readings', () => {
    expect(sUnits(0)).toBe('S1');
    expect(sUnits(0.8)).toBe('S9');
    expect(sUnits(1)).toBe('S9+20');
  });
});

describe('etiquette', () => {
  it('every scenario has a valid answer and an explanation', () => {
    for (const s of etiquette.scenarios) {
      expect(s.answer).toBeGreaterThanOrEqual(0);
      expect(s.answer).toBeLessThan(s.choices.length);
      expect(s.why.length).toBeGreaterThan(40);
    }
  });
});

describe('off-air tone detection', () => {
  /** Synthesise a CW signal: sine bursts at `pitch` with shaped edges, plus noise. */
  function synth(text: string, wpm: number, pitch: number, sr: number, noise: number, seed: number) {
    const sch = buildSchedule(encodeText(text).words, timing({ charWpm: wpm }));
    const lead = 0.5;
    const n = Math.ceil((sch.total + 1) * sr);
    const out = new Float32Array(n);
    const rng = seeded(seed);
    for (const e of sch.events) {
      const a = Math.floor((lead + e.t0) * sr);
      const b = Math.floor((lead + e.t1) * sr);
      const edge = Math.floor(0.004 * sr);
      for (let i = a; i < b; i++) {
        const env = Math.min(1, (i - a) / edge, (b - i) / edge);
        out[i] += 0.5 * env * Math.sin((2 * Math.PI * pitch * i) / sr);
      }
    }
    for (let i = 0; i < n; i++) out[i] += (rng() * 2 - 1) * noise;
    return out;
  }

  function decodeAudio(samples: Float32Array, sr: number, pitch: number, wpmHint: number) {
    const block = Math.round(sr * 0.004);
    const keyer = new ToneKeyer();
    const dec = new AdaptiveDecoder(wpmHint);
    const ev: DecoderEvent[] = [];
    for (let s = 0; s + block <= samples.length; s += block) {
      const t = s / sr;
      for (const tr of keyer.push(t, goertzel(samples, s, block, pitch, sr))) ev.push(...(tr.down ? dec.keyDown(tr.t) : dec.keyUp(tr.t)));
      ev.push(...dec.tick(t));
    }
    ev.push(...dec.flush());
    return ev.map((e) => (e.kind === 'space' ? ' ' : e.ch || '?')).join('').trim();
  }

  it('goertzel picks out its own frequency', () => {
    const sr = 8000;
    const x = Float32Array.from({ length: 400 }, (_, i) => Math.sin((2 * Math.PI * 700 * i) / sr));
    expect(goertzel(x, 0, 400, 700, sr)).toBeGreaterThan(0.9);
    expect(goertzel(x, 0, 400, 1000, sr)).toBeLessThan(0.1);
    expect(strongestPitch(x, sr)).toBeCloseTo(700, -1);
  });

  it.each([
    [20, 0.05],
    [20, 0.25],
    [30, 0.15],
  ])('decodes %i WPM through noise %f with ≥95%% accuracy', (wpm, noise) => {
    const text = 'CQ CQ DE G4ABC G4ABC K UR RST 579 NAME JOHN QTH LEEDS';
    const sr = 8000;
    const got = decodeAudio(synth(text, wpm, 700, sr, noise, 3), sr, 700, wpm);
    expect(gradeCopy(text, got).accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it('stays quiet on noise alone', () => {
    const sr = 8000;
    const n = new Float32Array(sr * 2);
    const rng = seeded(4);
    for (let i = 0; i < n.length; i++) n[i] = (rng() * 2 - 1) * 0.2;
    const keyer = new ToneKeyer();
    let downs = 0;
    for (let s = 0; s + 32 <= n.length; s += 32) downs += keyer.push(s / sr, goertzel(n, s, 32, 700, sr)).filter((t) => t.down).length;
    expect(downs).toBeLessThan(3);
  });
});

describe('reports', () => {
  it('contest callers always send 599; pileups give real reports', () => {
    const contest = new RunEngine(contestById('wpx'), ME, seeded(21));
    const pile = new RunEngine(contestById('dxpileup'), ME, seeded(21));
    const cr = Array.from({ length: 200 }, () => contest.newCaller().exch.rst);
    const pr = Array.from({ length: 200 }, () => pile.newCaller().exch.rst);
    expect(new Set(cr)).toEqual(new Set(['599']));
    expect(new Set(pr).size).toBeGreaterThan(1);
  });
});
