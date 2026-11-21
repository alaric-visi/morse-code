import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TOP500 } from '../../learn/material';
import { climb, ICR_WINDOW, startLadder, type Ladder } from '../../learn/ladder';
import { seeded } from '../../learn/random';
import { progress, updateProgress } from '../../learn/store';
import { Slider } from '../../ui/controls';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import type { Radio } from './radio';
import { Help } from '../../ui/Linked';

type Mode = 'icr' | 'words' | 'ladder';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const ICR_COUNT = 20;

const MODES: Record<Mode, { label: string; help: string }> = {
  icr: { label: 'Instant characters', help: 'One character at high speed. Type it the instant you hear it: under a second counts as instant.' },
  words: { label: 'Word shapes', help: 'Whole words at speed. Hear the shape of the word, not its letters, then type it and press Enter.' },
  ladder: { label: 'Speed ladder', help: 'Words that get faster with every right answer and slower after a miss. How high can you climb?' },
};

/** The high-speed track: instant recognition, word shapes, and the speed ladder. Played clean, at your own pitch. */
export function Qrq({ radio }: { radio: Radio }) {
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const [mode, setMode] = useState<Mode>('icr');
  const [speed, setSpeed] = useState(30);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [stats, setStats] = useState({ right: 0, total: 0, instant: 0, rtSum: 0 });
  const [ladder, setLadder] = useState<Ladder>(() => startLadder(25));
  const endedAt = useRef(0);
  const answered = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const runId = useRef(0);

  useEffect(() => () => {
    runId.current++;
    radio.stop();
  }, []);

  const wpmNow = mode === 'ladder' ? ladder.wpm : speed;
  const say = (text: string, wpm: number) => radio.play(text, { wpm, effWpm: wpm, fist: 'textbook', clean: true });

  async function ask(m: Mode, wpm: number) {
    const id = runId.current;
    const t = m === 'icr' ? CHARS[Math.floor(rng() * CHARS.length)] : TOP500[Math.floor(rng() * 250)];
    setTarget(t);
    setAnswer('');
    setFeedback('');
    answered.current = false;
    endedAt.current = 0;
    await say(t, wpm);
    if (id !== runId.current) return;
    endedAt.current = performance.now();
    if (m !== 'icr') input.current?.focus();
  }

  const start = () => {
    runId.current++;
    setRunning(true);
    setStats({ right: 0, total: 0, instant: 0, rtSum: 0 });
    setFeedback('');
    const l = startLadder(ladder.best > 25 ? Math.max(20, ladder.best - 5) : 25);
    if (mode === 'ladder') setLadder(l);
    void ask(mode, mode === 'ladder' ? l.wpm : speed);
  };
  const stop = () => {
    runId.current++;
    radio.stop();
    setRunning(false);
  };

  function submit(given: string) {
    if (answered.current || !target) return;
    answered.current = true;
    const ok = given.trim().toUpperCase() === target;
    const rt = endedAt.current ? (performance.now() - endedAt.current) / 1000 : 0;
    const instant = ok && rt <= ICR_WINDOW;
    const s2 = { right: stats.right + (ok ? 1 : 0), total: stats.total + 1, instant: stats.instant + (instant ? 1 : 0), rtSum: stats.rtSum + rt };
    setStats(s2);
    let nextWpm = wpmNow;
    if (mode === 'ladder') {
      const l = climb(ladder, ok);
      setLadder(l);
      nextWpm = l.wpm;
      if (l.best > (progress.peek()?.qrqBest ?? 0)) void updateProgress((p) => (p.qrqBest = l.best));
    }
    setFeedback(
      ok
        ? mode === 'icr'
          ? `${target}: ${rt.toFixed(2)} s${instant ? ', instant' : ''}`
          : `Right: ${target}`
        : `It was ${target}${given ? `, not ${given.toUpperCase()}` : ''}`,
    );
    if (mode === 'icr' && s2.total >= ICR_COUNT) {
      setRunning(false);
      return;
    }
    const id = runId.current;
    setTimeout(() => id === runId.current && void ask(mode, nextWpm), ok ? 450 : 1100);
  }

  // Instant characters: the first key you press is your answer.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (mode !== 'icr' || !running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      submitRef.current(e.key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, running]);

  const done = mode === 'icr' && !running && stats.total >= ICR_COUNT;
  return (
    <div class="mc-qrq" data-target={target}>
      <div class="mc-seg" role="group" aria-label="QRQ drill">
        {(Object.keys(MODES) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              stop();
              setMode(m);
              setStats({ right: 0, total: 0, instant: 0, rtSum: 0 });
              setFeedback('');
            }}
          >
            {MODES[m].label}
          </button>
        ))}
      </div>
      <Help class="mc-help">{MODES[mode].help}</Help>
      {mode !== 'ladder' ? (
        <Slider label="Speed" min={20} max={60} step={1} value={speed} display={`${speed} WPM`} onInput={setSpeed} />
      ) : (
        <p class="mc-qrq-ladder">
          <span class="mc-display mc-num">{ladder.wpm}</span> WPM now · best <span class="mc-num">{Math.max(ladder.best, progress.value?.qrqBest ?? 0)}</span>
        </p>
      )}
      <div class="mc-head-stage">
        <Lamp lit={radio.lit} />
        <p class="mc-feedback" role="status" aria-live="polite">
          {feedback || (running ? (mode === 'icr' ? 'Type the character…' : 'Type the word, then Enter') : ' ')}
        </p>
      </div>
      {running && mode !== 'icr' && (
        <form
          class="mc-qrq-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(answer);
          }}
        >
          <label class="mc-sr" for="mc-qrq-in">
            Your answer
          </label>
          <input
            id="mc-qrq-in"
            ref={input}
            class="mc-qrq-input mc-mono"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            value={answer}
            onInput={(e) => setAnswer(e.currentTarget.value)}
          />
          <button type="submit" class="mc-btn">
            Enter
          </button>
        </form>
      )}
      <div class="mc-stage-actions">
        {!running ? (
          <button type="button" class="mc-btn primary" onClick={start}>
            <IconPlay />
            {done ? 'Go again' : 'Start'}
          </button>
        ) : (
          <>
            <button type="button" class="mc-btn" onClick={() => void say(target, wpmNow)}>
              Hear again
            </button>
            <button type="button" class="mc-btn ghost" onClick={stop}>
              Stop
            </button>
          </>
        )}
        <span class="mc-help mc-num mc-push">
          {stats.right} / {stats.total}
          {mode === 'icr' && stats.total ? ` · ${stats.instant} instant · avg ${(stats.rtSum / stats.total).toFixed(2)} s` : ''}
        </span>
      </div>
      {done && (
        <p class="mc-qrq-summary" role="status">
          {stats.right} of {ICR_COUNT} at {speed} WPM, {stats.instant} instant.
        </p>
      )}
    </div>
  );
}
