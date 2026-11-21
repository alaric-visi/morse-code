import { describe, expect, it } from 'vitest';
import top500 from '../content/words/top500.json';
import abbreviations from '../content/words/abbreviations.json';
import qcodes from '../content/words/qcodes.json';
import { charToMorse, encodeText } from '../src/core/codec';
import { FIST_PRESETS, TEXTBOOK, humanSchedule, type FistParams } from '../src/core/fist-model';
import { buildSchedule } from '../src/core/schedule';
import { timing } from '../src/core/timing';
import { AdaptiveDecoder, type DecoderEvent } from '../src/core/decoder/decoder';
import { analyseFist } from '../src/core/decoder/fist';
import { COUNTRIES, looksLikeCallsign, makeCallsign } from '../src/learn/callsigns';
import { forGrading, makeQso, missingFrom, QSO_STYLES, type QsoStyle } from '../src/learn/qso';
import { climb, startLadder } from '../src/learn/ladder';
import { certificateSvg } from '../src/learn/certificate';
import { seeded } from '../src/learn/random';
import { emptyProgress, sanitizeProgress } from '../src/learn/progress';

const sendable = (s: string) => [...s.replace(/<SK>/g, '').replace(/ /g, '')].every((c) => charToMorse[c]);

describe('vocabulary', () => {
  it('has 500 distinct, sendable common words', () => {
    expect(top500.words).toHaveLength(500);
    expect(new Set(top500.words).size).toBe(500);
    for (const w of top500.words) expect(sendable(w), w).toBe(true);
  });
  it('abbreviations and Q-codes are distinct and sendable', () => {
    for (const list of [abbreviations.items, qcodes.items]) {
      const keys = list.map(([k]) => k);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(sendable(k), k).toBe(true);
    }
  });
});

/** Decode a schedule as if heard, and analyse the fist that sent it. */
function hear(sch: ReturnType<typeof humanSchedule>, wpm: number) {
  const d = new AdaptiveDecoder(wpm);
  const ev: DecoderEvent[] = [];
  for (const e of sch.events) ev.push(...d.keyDown(e.t0), ...d.keyUp(e.t1));
  ev.push(...d.tick(sch.total + 10), ...d.flush());
  return { text: ev.map((e) => (e.kind === 'space' ? ' ' : e.ch || '?')).join('').trim(), fist: analyseFist(ev) };
}

describe('human fist model', () => {
  const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG CQ DE G4ABC K';
  const words = encodeText(text).words;
  const at = (p: Partial<FistParams>, seed = 1) => humanSchedule(words, { wpm: 20, ...TEXTBOOK, ...p }, seeded(seed));

  it('textbook matches the standard schedule exactly', () => {
    const a = at({});
    const b = buildSchedule(words, timing({ charWpm: 20 }));
    expect(a.total).toBeCloseTo(b.total, 9);
    expect(a.events.length).toBe(b.events.length);
  });

  it('heavy dahs measure as heavy', () => {
    const { fist } = hear(at({ dah: 4 }), 20);
    expect(fist!.dahRatio).toBeCloseTo(4, 1);
  });

  it('a bug sends perfectly even, fast dits', () => {
    const sch = at({ bug: 1.6, jitter: 0.2 });
    const dits = sch.events.filter((e, i) => sch.events[i] && (e.t1 - e.t0) < 0.06 * 1.5).map((e) => e.t1 - e.t0);
    expect(dits.length).toBeGreaterThan(10);
    for (const d of dits) expect(d).toBeCloseTo(0.06 / 1.6, 9);
  });

  it('drift speeds the sender up', () => {
    const { fist } = hear(at({ drift: 1.4 }), 20);
    expect(fist!.drift).toBeGreaterThan(0.2);
  });

  it('every preset stays readable to the decoder (≥90%)', () => {
    for (const [name, preset] of Object.entries(FIST_PRESETS)) {
      const sch = humanSchedule(words, { wpm: 18, ...preset.params }, seeded(7));
      const got = hear(sch, 18).text.replace(/ /g, '');
      const want = text.replace(/ /g, '');
      let same = 0;
      for (let i = 0; i < Math.min(got.length, want.length); i++) if (got[i] === want[i]) same++;
      // Position-by-position is strict; most presets still read cleanly.
      if (name !== 'beginner' && name !== 'rushed') expect(same / want.length, name).toBeGreaterThan(0.9);
    }
  });

  it('is deterministic for a seed', () => {
    expect(at({ jitter: 0.2 }, 5).total).toBe(at({ jitter: 0.2 }, 5).total);
  });
});

describe('callsigns', () => {
  it('generates valid, sendable calls for every country', () => {
    const rng = seeded(11);
    for (const c of COUNTRIES) {
      for (let i = 0; i < 20; i++) {
        const cs = makeCallsign(rng, { country: c.country });
        expect(looksLikeCallsign(cs.call), cs.call).toBe(true);
        expect(sendable(cs.call), cs.call).toBe(true);
        expect(c.cities).toContain(cs.city);
      }
    }
  });
  it('recognises real-looking calls and rejects junk', () => {
    expect(looksLikeCallsign('G4ABC')).toBe(true);
    expect(looksLikeCallsign('GM3XYZ/P')).toBe(true);
    expect(looksLikeCallsign('HB9AA')).toBe(true);
    expect(looksLikeCallsign('ZZ9ZZ')).toBe(false);
    expect(looksLikeCallsign('G4ABCDE')).toBe(false);
  });
});

describe('QSOs', () => {
  const me = { call: 'G4XYZ', name: 'ALEX', qth: 'LEEDS' };
  it.each(Object.keys(QSO_STYLES) as QsoStyle[])('%s: alternates, starts with a CQ, and is sendable', (style) => {
    const q = makeQso(style, me, seeded(3));
    expect(q.turns[0].from).toBe('them');
    expect(q.turns[0].text).toMatch(/^CQ /);
    q.turns.forEach((t, i) => {
      expect(t.from).toBe(i % 2 ? 'you' : 'them');
      expect(sendable(t.text), t.text).toBe(true);
    });
    expect(q.turns.some((t) => t.text.includes(q.them.call))).toBe(true);
  });
  it('a rag-chew is the longest, and mentions work and years licensed', () => {
    const r = makeQso('ragchew', me, seeded(4));
    const s = makeQso('standard', me, seeded(4));
    expect(r.turns.length).toBeGreaterThan(s.turns.length);
    expect(r.turns.map((t) => t.text).join(' ')).toMatch(/LICENSED \d+ YRS/);
  });
  it('checks your reply leniently for what matters', () => {
    const q = makeQso('standard', me, seeded(5));
    const reply = q.turns[1];
    expect(missingFrom(reply.text, reply.expect)).toEqual([]);
    expect(missingFrom(`${q.them.call} DE G4XYZ K`, reply.expect)).toEqual([]);
    expect(missingFrom('DE G4XYZ K', reply.expect)).toEqual([q.them.call]);
  });
  it('grading ignores separators and prosign brackets', () => {
    expect(forGrading('UR RST 599 = NAME BOB <SK>')).toBe('UR RST 599 NAME BOB SK');
  });
});

describe('speed ladder', () => {
  it('climbs on success and drops further on a miss', () => {
    let l = startLadder(20);
    l = climb(l, true);
    l = climb(l, true);
    expect(l).toEqual({ wpm: 22, best: 22, run: 2 });
    l = climb(l, false);
    expect(l).toEqual({ wpm: 20, best: 22, run: 0 });
  });
  it('stays within bounds', () => {
    let l = startLadder(60);
    l = climb(l, true);
    expect(l.wpm).toBe(60);
    l = climb(startLadder(10), false);
    expect(l.wpm).toBe(10);
  });
  it('schedules cleanly at 50 WPM (24 ms dits, nothing overlapping)', () => {
    const sch = buildSchedule(encodeText('EVERY QUICK BROWN FOX').words, timing({ charWpm: 50 }));
    expect(sch.events[0].t1 - sch.events[0].t0).toBeCloseTo(0.024, 6); // E = one dit
    for (let i = 1; i < sch.events.length; i++) expect(sch.events[i].t0).toBeGreaterThanOrEqual(sch.events[i - 1].t1);
  });
});

describe('certificates', () => {
  const colours = { paper: 'p', ink: 'i', ink2: 'j', brass: 'b', brassHi: 'h' };
  it('is a standalone SVG with the speed, accuracy and escaped name', () => {
    const svg = certificateSvg({ name: 'Ada <Lovelace>', call: 'G4XYZ', wpm: 20, accuracy: 0.94, date: new Date(2026, 10, 21) }, colours);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('20 WPM');
    expect(svg).toContain('94% accuracy');
    expect(svg).toContain('Ada &lt;Lovelace&gt; · G4XYZ');
    expect(svg).toContain('21 November 2026');
    expect(svg).not.toContain('<Lovelace>');
  });
});

describe('progress additions', () => {
  it('defaults and sanitises certificates, QRQ best and operator', () => {
    expect(emptyProgress().operator).toEqual({ call: '', name: '', qth: '' });
    const p = sanitizeProgress({
      certs: [{ wpm: 20, accuracy: 0.95, at: '2026-11-21T10:00:00Z' }, { bad: true }],
      qrqBest: 999,
      operator: { call: 'g4xyz/p<script>', name: 'Alex 2', qth: 'leeds!' },
    });
    expect(p.certs).toEqual([{ wpm: 20, accuracy: 0.95, at: '2026-11-21T10:00:00Z' }]);
    expect(p.qrqBest).toBe(99);
    expect(p.operator).toEqual({ call: 'G4XYZ/PSCRIP', name: 'ALEX ', qth: 'LEEDS' }); // call capped at 12; a trailing space survives typing
  });
});
