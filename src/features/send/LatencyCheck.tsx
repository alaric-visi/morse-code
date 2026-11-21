import { useEffect, useRef, useState } from 'preact/hooks';
import { getAudio } from '../../audio/engine';
import { Help } from '../../ui/Linked';

const BEATS = 8;
const INTERVAL = 0.6;

/**
 * How long from pressing the key to hearing it, and a tap-along check of your
 * own timing against a metronome played through the same audio path.
 */
export function LatencyCheck({ estimateMs, taps }: { estimateMs: number | null; taps: { subscribe(fn: (t: number) => void): () => void } }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [result, setResult] = useState<{ mean: number; spread: number; n: number } | null>(null);
  const clicks = useRef<number[]>([]);
  const got = useRef<number[]>([]);

  useEffect(() => {
    if (state !== 'running') return;
    return taps.subscribe((t) => got.current.push(t * 1000));
  }, [state]);

  const start = () => {
    const ac = getAudio();
    const t0 = ac.currentTime + 0.5;
    const stamp = ac.getOutputTimestamp?.();
    // Map audio-clock times to the performance clock the key timestamps use.
    const toPerf = (ctxT: number) =>
      stamp && stamp.contextTime !== undefined && stamp.performanceTime !== undefined
        ? stamp.performanceTime + (ctxT - stamp.contextTime) * 1000
        : performance.now() + (ctxT - ac.currentTime) * 1000;
    clicks.current = [];
    got.current = [];
    for (let i = 0; i < BEATS; i++) {
      const at = t0 + i * INTERVAL;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.frequency.value = i === 0 ? 1320 : 880;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.3, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      osc.connect(g).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.06);
      clicks.current.push(toPerf(at));
    }
    setState('running');
    setTimeout(() => {
      const offsets = got.current
        .map((t) => {
          const nearest = clicks.current.reduce((a, c) => (Math.abs(c - t) < Math.abs(a - t) ? c : a));
          return t - nearest;
        })
        .filter((o) => Math.abs(o) < INTERVAL * 500);
      if (offsets.length) {
        const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        const spread = Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length);
        setResult({ mean: Math.round(mean), spread: Math.round(spread), n: offsets.length });
      } else setResult(null);
      setState('done');
    }, (0.5 + BEATS * INTERVAL + 0.4) * 1000);
  };

  return (
    <div class="mc-latency">
      <p>
        {estimateMs !== null ? (
          <>
            This device reports about <strong class="mc-num">{estimateMs} ms</strong> from key to sound.
          </>
        ) : (
          'Press the key once to measure how quickly this device can sound it.'
        )}{' '}
        Under 30 ms feels instant. Bluetooth headphones usually add 150–250 ms, which makes keying feel sluggish; use
        wired headphones or speakers if you can.
      </p>
      <Help class="mc-help">
        Timing check: press <strong>Start</strong>, then tap your key in time with the {BEATS} clicks (the first is higher).
      </Help>
      <div class="mc-stage-actions">
        <button type="button" class="mc-btn" disabled={state === 'running'} onClick={start}>
          {state === 'running' ? 'Listening…' : 'Start'}
        </button>
      </div>
      {state === 'done' && (
        <p role="status">
          {result
            ? `${result.n} taps: on average ${Math.abs(result.mean)} ms ${result.mean >= 0 ? 'after' : 'before'} the click, varying by about ±${result.spread} ms. ${
                result.spread <= 30 ? 'Very steady.' : 'A little uneven. Steady timing comes with practice.'
              }`
            : "No taps heard. Use the key (or Space) in time with the clicks."}
        </p>
      )}
    </div>
  );
}
