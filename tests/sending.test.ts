import { describe, expect, it } from 'vitest';
import { AdaptiveDecoder, twoMeans, type DecoderEvent } from '../src/core/decoder/decoder';
import { analyseFist, compareLetter, fitUnit } from '../src/core/decoder/fist';
import { IambicKeyer, type ElementEvent } from '../src/core/keyer';
import { gradeCopy } from '../src/learn/drills';
import { charForCode } from '../src/core/codec';
import { REFERENCE, send, type SendOptions } from './fixtures/sending';

/** Run marks through the decoder like a live key would, and return the text and events. */
function decode(marks: [number, number][], hintWpm = 15) {
  const d = new AdaptiveDecoder(hintWpm);
  const events: DecoderEvent[] = [];
  for (const [t0, t1] of marks) {
    events.push(...d.keyDown(t0));
    events.push(...d.keyUp(t1));
  }
  const end = marks[marks.length - 1][1];
  events.push(...d.tick(end + 10), ...d.flush());
  const text = events.map((e) => (e.kind === 'space' ? ' ' : e.ch || '?')).join('').trim();
  return { text, events, decoder: d };
}

const accuracy = (sent: string, got: string) => gradeCopy(sent, got).accuracy;

describe('adaptive decoder', () => {
  it('decodes textbook timing perfectly', () => {
    const { text } = decode(send(REFERENCE, { wpm: 15 }));
    expect(text).toBe(REFERENCE);
  });

  it.each([1, 2, 3, 4, 5])('decodes a human-timed reference at 15 WPM with ≥98%% accuracy (seed %i)', (seed) => {
    const o: SendOptions = { wpm: 15, jitter: 0.15, seed, dah: 3.2, elementGap: 1.15, letterGap: 3.3, wordGap: 7.5 };
    const { text } = decode(send(REFERENCE, o));
    expect(accuracy(REFERENCE, text)).toBeGreaterThanOrEqual(0.98);
    // Word spacing comes through too.
    expect(text.split(' ').length).toBeGreaterThanOrEqual(REFERENCE.split(' ').length - 2);
  });

  it('adapts when the sender is much slower than it expected', () => {
    const { text, decoder } = decode(send(REFERENCE, { wpm: 15, jitter: 0.1, seed: 9 }), 25);
    expect(accuracy(REFERENCE, text)).toBeGreaterThanOrEqual(0.95);
    expect(decoder.wpm).toBeGreaterThan(13);
    expect(decoder.wpm).toBeLessThan(17);
  });

  it('follows a sender who speeds up from 12 to 22 WPM', () => {
    const { text, decoder } = decode(send(REFERENCE, { wpm: 12, wpmEnd: 22, jitter: 0.1, seed: 4 }));
    expect(accuracy(REFERENCE, text)).toBeGreaterThanOrEqual(0.97);
    expect(decoder.wpm).toBeGreaterThan(18);
  });

  it('reports a prosign and an unknown code', () => {
    const d = new AdaptiveDecoder(20);
    const u = 0.06;
    let t = 0;
    const key = (code: string) => {
      const out: DecoderEvent[] = [];
      for (const c of code) {
        out.push(...d.keyDown(t));
        t += (c === '-' ? 3 : 1) * u;
        out.push(...d.keyUp(t));
        t += u;
      }
      t += 2 * u;
      return out;
    };
    const ev = [...key('...-.-'), ...key('......'), ...d.flush()];
    expect(ev.filter((e) => e.kind === 'letter').map((e) => (e.kind === 'letter' ? [e.code, e.ch] : null))).toEqual([
      ['...-.-', '<SK>'],
      ['......', ''],
    ]);
  });

  it('two-means splits dits from dahs, and refuses one group', () => {
    expect(twoMeans([0.06, 0.07, 0.18, 0.2, 0.065])).toEqual([[0.06, 0.07, 0.065], [0.18, 0.2]]);
    expect(twoMeans([0.06, 0.065, 0.07, 0.062])).toBeNull();
  });

  it('charForCode covers characters and prosigns', () => {
    expect(charForCode('-.-')).toBe('K');
    expect(charForCode('........')).toBe('<HH>');
    expect(charForCode('..-..')).toBe('');
    expect(charForCode('..-..', { extended: true })).toBe('É');
  });
});

describe('fist analysis (hand-checked fixtures)', () => {
  const lettersOf = (marks: [number, number][]) => decode(marks, 20).events;

  it('textbook PARIS PARIS at 20 WPM is perfect', () => {
    const f = analyseFist(lettersOf(send('PARIS PARIS', { wpm: 20 })))!;
    expect(f.wpm).toBeCloseTo(20, 5);
    expect(f.dahRatio).toBeCloseTo(3, 5);
    expect(f.elementGap).toBeCloseTo(1, 5);
    expect(f.letterGap).toBeCloseTo(3, 5);
    expect(f.wordGap).toBeCloseTo(7, 5);
    expect(f.ditSpread).toBeCloseTo(0, 5);
    expect(f.drift).toBeCloseTo(0, 5);
    expect(f.score).toBe(100);
  });

  it('heavy dahs (4 units): ratio 4, unit fitted from both', () => {
    // 20 dits of 0.06 s and 8 dahs of 0.24 s: unit = Σk·d / Σk² = (1.2 + 5.76) / 92 = 0.075652…
    const f = analyseFist(lettersOf(send('PARIS PARIS', { wpm: 20, dah: 4 })))!;
    expect(f.dahRatio).toBeCloseTo(4, 5);
    expect(f.unit).toBeCloseTo(6.96 / 92, 6);
    expect(f.wpm).toBeCloseTo(1.2 / (6.96 / 92), 4);
    expect(f.elementGap).toBeCloseTo(0.06 / (6.96 / 92), 5);
    // Drift: first nine marks fit 3.18/41 s, last nine 1.86/25 s → +4.25%.
    expect(f.drift).toBeCloseTo(3.18 / 41 / (1.86 / 25) - 1, 5);
    // 100 − 20 (ratio) − 25·(1 − 0.7931) − 60·0.04247 = 72.3
    expect(f.score).toBe(72);
  });

  it('notices speeding up', () => {
    const f = analyseFist(lettersOf(send(REFERENCE.slice(0, 80), { wpm: 15, wpmEnd: 20 })))!;
    expect(f.drift).toBeGreaterThan(0.15);
    expect(f.wpmStart).toBeLessThan(f.wpmEnd);
  });

  it('uneven timing shows up as spread and costs score', () => {
    const even = analyseFist(lettersOf(send(REFERENCE.slice(0, 80), { wpm: 18 })))!;
    const rough = analyseFist(lettersOf(send(REFERENCE.slice(0, 80), { wpm: 18, jitter: 0.3, seed: 3 })))!;
    expect(rough.ditSpread).toBeGreaterThan(0.1);
    expect(rough.score).toBeLessThan(even.score);
  });

  it('needs enough marks', () => {
    expect(analyseFist(lettersOf(send('EE', { wpm: 20 })))).toBeNull();
  });

  it('compares one letter element by element', () => {
    const ev = lettersOf(send('K', { wpm: 20, dah: 3.5 }));
    const k = ev.find((e) => e.kind === 'letter')!;
    if (k.kind !== 'letter') throw new Error();
    const cmp = compareLetter(k, 0.06);
    expect(cmp.map((c) => c.kind)).toEqual(['dah', 'gap', 'dit', 'gap', 'dah']);
    expect(cmp[0].actual).toBeCloseTo(3.5, 5);
    expect(cmp[1].actual).toBeCloseTo(1, 5);
  });

  it('fitUnit is least squares', () => {
    expect(fitUnit([{ d: 0.1, k: 1 }, { d: 0.3, k: 3 }])).toBeCloseTo(0.1, 9);
  });
});

describe('iambic keyer', () => {
  const U = 10; // samples per dit, to keep the arithmetic readable
  function run(mode: 'A' | 'B', script: [number, boolean, boolean][], until: number) {
    const k = new IambicKeyer(mode, U);
    const els: ElementEvent[] = [];
    k.onElement = (e) => els.push(e);
    let i = 0;
    for (let s = 0; s < until; s++) {
      while (i < script.length && script[i][0] === s) {
        k.setPaddles(script[i][1], script[i][2]);
        i++;
      }
      k.step();
    }
    return els;
  }
  const code = (els: ElementEvent[]) => els.map((e) => e.el).join('');

  it('holding dit sends evenly spaced dits', () => {
    const els = run('A', [[0, true, false], [55, false, false]], 200);
    expect(code(els)).toBe('...');
    expect(els.map((e) => [e.start, e.end])).toEqual([[0, 10], [20, 30], [40, 50]]);
  });

  it('holding dah sends dahs three units long', () => {
    const els = run('A', [[0, false, true], [75, false, false]], 200);
    expect(code(els)).toBe('--');
    expect(els[0]).toEqual({ el: '-', start: 0, end: 30 });
    expect(els[1].start).toBe(40);
  });

  it('a squeeze alternates, starting with the paddle pressed first', () => {
    expect(code(run('A', [[0, true, false], [3, true, true], [95, false, false]], 300))).toBe('.-.-');
    expect(code(run('A', [[0, false, true], [3, true, true], [95, false, false]], 300))).toBe('-.-');
  });

  it('mode A stops when the squeeze is released; mode B sends one more', () => {
    // C = -.-. : squeeze dah first, let go during the third element.
    const script: [number, boolean, boolean][] = [[0, false, true], [2, true, true], [62, false, false]];
    expect(code(run('A', script, 300))).toBe('-.-');
    expect(code(run('B', script, 300))).toBe('-.-.');
  });

  it('mode B remembers a quick tap of the other paddle', () => {
    // Holding dah, tap dit briefly during the dah: B sends the dit afterwards, A doesn't.
    const script: [number, boolean, boolean][] = [[0, false, true], [5, true, true], [8, false, true], [25, false, false]];
    expect(code(run('B', script, 300))).toBe('-.');
    expect(code(run('A', script, 300))).toBe('-');
  });
});

describe('keyer worklet source', () => {
  it('is self-contained JavaScript that registers the processor', async () => {
    const { keyerProcessorSource } = await import('../src/audio/worklets/keyer-processor');
    const src = keyerProcessorSource();
    expect(src).toContain("registerProcessor('mc-keyer'");
    // Evaluate it in a fake worklet scope: the class must build and key a dit.
    const registered: Record<string, new () => { port: { onmessage: (e: { data: unknown }) => void; postMessage: (m: unknown) => void }; process(i: unknown, o: Float32Array[][]): boolean }> = {};
    const posted: { type: string }[] = [];
    class AudioWorkletProcessor {
      port = { onmessage: (_e: { data: unknown }) => {}, postMessage: (m: { type: string }) => posted.push(m) };
    }
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentFrame', src)(
      AudioWorkletProcessor,
      (name: string, ctor: (typeof registered)[string]) => (registered[name] = ctor),
      1000,
      0,
    );
    const p = new registered['mc-keyer']();
    p.port.onmessage({ data: { type: 'config', mode: 'A', wpm: 60, pitch: 600, volume: 0.5 } });
    p.port.onmessage({ data: { type: 'paddles', dit: true, dah: false } });
    const out = [[new Float32Array(30)]];
    p.process([], out[0] ? [out[0]] : []);
    p.port.onmessage({ data: { type: 'paddles', dit: false, dah: false } });
    p.process([], [[new Float32Array(30)]]);
    expect(posted.find((m) => m.type === 'element')).toMatchObject({ el: '.', t0: 0, t1: 0.02 });
  });
});
