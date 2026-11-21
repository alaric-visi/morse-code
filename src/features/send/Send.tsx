import { useComputed, useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import words from '../../../content/words/common.json';
import type { Letter } from '../../core/codec';
import type { DecodedLetter, DecoderEvent, Mark } from '../../core/decoder/decoder';
import { analyseFist, compareLetter } from '../../core/decoder/fist';
import type { Schedule, ToneEvent } from '../../core/schedule';
import type { InputMode } from '../../audio/keyer-node';
import { midiSupported, serialSupported, type Line } from '../../input/devices';
import { charsAt, codeOf, rhythm } from '../../learn/koch';
import { gradeCopy } from '../../learn/drills';
import { seeded } from '../../learn/random';
import { loadProgress } from '../../learn/store';
import { useCourseAudio } from '../../learn/useCourseAudio';
import { PITCH_MAX, PITCH_MIN } from '../../app/settings';
import { KeyButton } from '../../ui/KeyButton';
import { Lamp } from '../../ui/Lamp';
import { Tape } from '../../ui/Tape';
import { TimingCompare } from '../../ui/TimingCompare';
import { Slider, Switch } from '../../ui/controls';
import { IconPlay } from '../../ui/icons';
import type { PlaybackView } from '../../ui/playback';
import { FistReport } from './FistReport';
import { LatencyCheck } from './LatencyCheck';
import { loadSend, sanitizeSend, saveSend, type Drill, type SendSettings } from './settings';
import { useKeying } from './useKeying';
import { Help } from '../../ui/Linked';

const ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const INPUTS: { value: InputMode; label: string; group: 'hand' | 'paddle'; help: string }[] = [
  { value: 'straight', label: 'Straight key', group: 'hand', help: '' },
  { value: 'bug', label: 'Bug', group: 'hand', help: 'A semi-automatic key: hold the dit side and the pendulum makes dits for you (at the speed set above); the dah side is a plain contact, so you time each dah yourself.' },
  { value: 'cootie', label: 'Cootie', group: 'hand', help: 'A sideswiper: both sides are plain contacts. Make each element by hand, rocking from side to side.' },
  { value: 'iambicA', label: 'Iambic A', group: 'paddle', help: 'Squeeze both paddles for alternating dits and dahs. Mode A stops as soon as you let go.' },
  { value: 'iambicB', label: 'Iambic B', group: 'paddle', help: 'Squeeze both paddles for alternating dits and dahs. Mode B sends one more element when you let go of a squeeze.' },
  { value: 'ultimatic', label: 'Ultimatic', group: 'paddle', help: 'Squeeze and the paddle you pressed last repeats; let it go and the other takes over. No alternating.' },
  { value: 'single', label: 'Single lever', group: 'paddle', help: 'One lever that swings either way, so only one side can close at once: no squeezing. If you press both keys, the latest wins.' },
];
const DRILLS: { value: Drill; label: string; help: string }[] = [
  { value: 'free', label: 'Free', help: 'Send anything. It decodes as you go, and your timing is analysed.' },
  { value: 'char', label: 'Character', help: 'Send the character shown.' },
  { value: 'word', label: 'Word', help: 'Send the word shown, then pause.' },
  { value: 'echo', label: 'Echo', help: 'Listen, then send back what you heard.' },
];

interface Attempt {
  target: string;
  sent: string;
  correct: boolean;
}

/** Sending practice: a straight key or iambic paddles, decoded live, with timing feedback. */
export function Send() {
  const [s, setS] = useState<SendSettings>(loadSend);
  const set = <K extends keyof SendSettings>(k: K, v: SendSettings[K]) =>
    setS((prev) => {
      const next = sanitizeSend({ ...prev, [k]: v });
      saveSend(next);
      return next;
    });
  const live = useRef(s);
  live.current = s;

  // ---------------------------------------------------------------- keying (keyer, inputs, decoder)
  const k = useKeying({ input: s.input, wpm: s.wpm, swap: s.swap, pitch: s.pitch, volume: s.volume });
  const { lit, events, pending, wpmLive, lastLetter } = k;
  const iambic = s.input !== 'straight';
  const paddlesUnavailable = k.paddlesUnavailable;
  const tapListeners = useRef(new Set<(t: number) => void>());

  // ---------------------------------------------------------------- tape of your own keying
  const marks = useRef<Mark[]>([]);
  const origin = useRef<number | null>(null);
  const tapeSchedule = useSignal<Schedule>({ events: [], total: 0, letterStart: [], letterEnd: [] });
  const tapeLetters = useSignal<Letter[]>([]);
  const tapeTiming = useSignal({ unit: 1.2 / s.wpm, letterGap: 0, wordGap: 0 });
  const tapePos = useSignal(0);
  const tapeActive = useComputed(() => tapeSchedule.value.events.length > 0);
  const pitchSig = useSignal(s.pitch);
  pitchSig.value = s.pitch;
  const noCursor = useSignal(-1);
  const noElems = useSignal(0);
  const view: PlaybackView = useMemo(
    () => ({
      pos: tapePos,
      lit,
      cursor: noCursor,
      elems: noElems,
      active: tapeActive,
      schedule: tapeSchedule,
      letters: tapeLetters,
      timing: tapeTiming,
      pitch: pitchSig,
      analyser: () => null,
    }),
    [],
  );

  function rebuildTape() {
    const o = origin.current ?? 0;
    const evs: ToneEvent[] = marks.current.map((m) => ({ t0: m.t0 - o, t1: m.t1 - o, wi: 0, li: 0, n: 0, j: 0 }));
    const letters = events.peek().filter((e): e is DecodedLetter => e.kind === 'letter' && e.marks.length > 0);
    tapeSchedule.value = {
      events: evs,
      total: evs.length ? evs[evs.length - 1].t1 : 0,
      letterStart: letters.map((l) => l.marks[0].t0 - o),
      letterEnd: letters.map((l) => l.marks[l.marks.length - 1].t1 - o),
    };
    tapeLetters.value = letters.map((l) => ({ ch: l.ch || '?', morse: l.code, known: true, kind: 'char', raw: l.ch, start: 0, end: 0 }));
    tapeTiming.value = { unit: k.unit(), letterGap: 0, wordGap: 0 };
  }

  useEffect(
    () =>
      k.listen({
        onEvents: (evs) => {
          for (const e of evs) drillRef.current(e);
          rebuildTape();
        },
        onMark: (t0, t1) => {
          if (origin.current === null) origin.current = t0 - 0.4;
          marks.current.push({ t0, t1 });
          if (marks.current.length > 400) marks.current.splice(0, 100);
          rebuildTape();
        },
        // The tape runs while you send and stops a moment after you stop, like a recorder.
        onFrame: (now) => {
          if (origin.current !== null) tapePos.value = Math.min(now - origin.current, tapeSchedule.peek().total + 1.2);
        },
        onTap: (t) => tapListeners.current.forEach((fn) => fn(t)),
      }),
    [],
  );

  const [deviceMsg, setDeviceMsg] = useState('');
  const connect = async (kind: 'midi' | 'serial') => setDeviceMsg(await k.connect(kind));

  // Changing key type or speed clears the tape (the decoder resets itself).
  useEffect(() => clearTape(), [s.input, s.wpm]);
  function clearTape() {
    marks.current = [];
    origin.current = null;
    rebuildTape();
  }
  function clearAll() {
    k.clear();
    clearTape();
  }

  // ---------------------------------------------------------------- drills
  const [level, setLevel] = useState(0);
  useEffect(() => {
    void loadProgress().then((p) => setLevel(p.level));
  }, []);
  const pool = s.source === 'course' && level ? charsAt(level) : ALL;
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const prompt = useCourseAudio({ charWpm: Math.max(s.wpm, 12), effWpm: s.wpm, copySeconds: 60 });

  const makeTarget = (d: Drill): string => {
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
    if (d === 'char') return pick(pool);
    const usable = [...words.words, ...words.abbreviations].filter((w) => [...w].every((c) => pool.includes(c)));
    if (s.source === 'all' || usable.length >= 6) return pick(usable.length ? usable : words.words);
    return Array.from({ length: 3 }, () => pick(pool)).join('');
  };
  const [target, setTarget] = useState(() => makeTarget(s.drill));
  const attempt = useRef<DecodedLetter[]>([]);
  const [result, setResult] = useState<Attempt | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const nextTarget = (d: Drill = s.drill) => {
    attempt.current = [];
    setResult(null);
    const t = makeTarget(d);
    setTarget(t);
    if (d === 'echo') setTimeout(() => void prompt.play(t), 250);
  };
  useEffect(() => {
    setScore({ right: 0, total: 0 });
    nextTarget(s.drill);
  }, [s.drill, s.source, level]);

  const evaluate = (sent: string, tgt: string) => {
    const correct = sent === tgt;
    setResult({ target: tgt, sent, correct });
    setScore((sc) => ({ right: sc.right + (correct ? 1 : 0), total: sc.total + 1 }));
    attempt.current = [];
    if (correct) setTimeout(() => nextTarget(), 900);
  };

  // The drill sees every decoded event; read the latest state through a ref.
  const drillRef = useRef<(e: DecoderEvent) => void>(() => {});
  drillRef.current = (e) => {
    const d = live.current.drill;
    if (d === 'free') return;
    if (d === 'char') {
      if (e.kind === 'letter') evaluate(e.ch || '?', target);
      return;
    }
    if (e.kind === 'letter') attempt.current.push(e);
    const sent = attempt.current.map((l) => l.ch || '?').join('');
    if ((e.kind === 'space' && sent) || attempt.current.length >= [...target].length) evaluate(sent, target);
  };

  // ---------------------------------------------------------------- feedback
  const fist = useComputed(() => analyseFist(events.value));
  const markCount = useComputed(() => events.value.reduce((a, e) => a + (e.kind === 'letter' ? e.marks.length : 0), 0));
  const transcript = useComputed(() =>
    events.value
      .map((e) => (e.kind === 'space' ? ' ' : e.ch || '?'))
      .join('')
      .slice(-240),
  );
  const last = lastLetter.value;
  const targetCode = s.drill === 'char' && last && last.ch !== target ? codeOf(target) : last?.code ?? '';
  const drillInfo = DRILLS.find((d) => d.value === s.drill)!;

  return (
    <div class="mc-send">
      <section class="mc-panel mc-send-setup" aria-label="Key setup">
        <div class="mc-key-types">
          {(['hand', 'paddle'] as const).map((g) => (
            <div key={g} class="mc-seg" role="group" aria-label={g === 'hand' ? 'Hand keys' : 'Paddles and keyers'}>
              {INPUTS.filter((i) => i.group === g).map((i) => (
                <button key={i.value} type="button" aria-pressed={s.input === i.value} onClick={() => set('input', i.value)}>
                  {i.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <Slider
          label={s.input === 'cootie' ? 'Starting speed' : s.input === 'bug' ? 'Pendulum speed' : iambic ? 'Keyer speed' : 'Starting speed'}
          min={5}
          max={40}
          step={1}
          value={s.wpm}
          display={`${s.wpm} WPM`}
          onInput={(v) => set('wpm', v)}
        />
        <Slider label="Sidetone pitch" min={PITCH_MIN} max={PITCH_MAX} step={10} value={s.pitch} display={`${s.pitch} Hz`} onInput={(v) => set('pitch', v)} />
        <Slider label="Sidetone volume" min={0} max={1} step={0.05} value={s.volume} display={`${Math.round(s.volume * 100)}%`} onInput={(v) => set('volume', v)} />
        <div class="mc-send-bindings">
          {iambic ? (
            <>
              <Switch label="Swap paddles" checked={s.swap} onChange={(v) => set('swap', v)} />
              <Help class="mc-help">
                Keyboard: <kbd>[</kbd> dit, <kbd>]</kbd> dah (or Left/Right <kbd>Ctrl</kbd>, as most USB paddle adapters send).{' '}
                {INPUTS.find((i) => i.value === s.input)?.help}
              </Help>
            </>
          ) : (
            <Help class="mc-help">
              Keyboard: hold <kbd>Space</kbd>. Or press and hold the key on screen. The decoder learns your speed as you send.
            </Help>
          )}
          {(midiSupported() || serialSupported()) && (
            <div class="mc-stage-actions">
              {midiSupported() && (
                <button type="button" class="mc-btn" onClick={() => connect('midi')}>
                  Connect MIDI key
                </button>
              )}
              {serialSupported() && (
                <button type="button" class="mc-btn" onClick={() => connect('serial')}>
                  Connect serial key
                </button>
              )}
            </div>
          )}
          {deviceMsg && (
            <Help class="mc-help" role="status">
              {deviceMsg}
            </Help>
          )}
          {paddlesUnavailable && (
            <Help class="mc-help mc-warn-note" role="note">
              This browser can't run the paddle keyer (it needs AudioWorklet). The straight key still works.
            </Help>
          )}
        </div>
      </section>

      <section class="mc-panel mc-send-key" aria-label="Key">
        <div class="mc-send-lamp">
          <Lamp lit={lit} testId="send-lamp" />
          <div class="mc-send-readout">
            <span class="mc-label">Sending</span>
            <span class="mc-send-pending mc-mono" aria-live="off">
              {pending.value || ' '}
            </span>
            <span class="mc-help mc-num">≈ {wpmLive} WPM</span>
          </div>
        </div>
        {iambic ? (
          <Paddles disabled={paddlesUnavailable} onLine={(l, d, t) => k.onLine(l, d, t)} />
        ) : (
          <KeyButton
            auto={lit}
            sound={{ voice: 'sine', pitch: s.pitch, volume: s.volume }}
            onPress={(t) => k.onLine('dit', true, t)}
            onRelease={(t) => k.onLine('dit', false, t)}
          />
        )}
      </section>

      <section class="mc-send-tape" aria-label="Your keying on tape">
        <Tape view={view} emptyText="Your keying will be recorded here" />
      </section>

      <section class="mc-panel mc-send-drill" aria-labelledby="mc-drill-title">
        <div class="mc-panel-head">
          <h2 class="mc-label" id="mc-drill-title">
            Practice
          </h2>
          <div class="mc-seg" role="group" aria-label="Drill">
            {DRILLS.map((d) => (
              <button key={d.value} type="button" aria-pressed={s.drill === d.value} onClick={() => set('drill', d.value)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <Help class="mc-help">{drillInfo.help}</Help>

        {s.drill === 'free' ? (
          <div class="mc-transcript-wrap">
            <p class="mc-transcript mc-mono" aria-live="polite" data-testid="transcript">
              {transcript.value || <span class="mc-help">Start sending…</span>}
            </p>
            <button type="button" class="mc-btn ghost" onClick={clearAll}>
              Clear
            </button>
          </div>
        ) : (
          <div class="mc-drill" data-target={target}>
            <div class="mc-drill-target">
              {s.drill === 'echo' ? (
                <button type="button" class="mc-btn" onClick={() => void prompt.play(target)}>
                  <IconPlay />
                  Hear it again
                </button>
              ) : (
                <>
                  <span class="mc-display mc-drill-text">{target}</span>
                  {s.drill === 'char' && <span class="mc-meet-rhythm">{rhythm(codeOf(target))}</span>}
                </>
              )}
              <span class="mc-help mc-num">
                {score.right} / {score.total}
              </span>
            </div>
            <p class="mc-drill-result" role="status" aria-live="polite">
              {result
                ? result.correct
                  ? `Right: ${result.target}`
                  : `You sent ${result.sent || 'nothing'}${s.drill === 'echo' ? `; it was ${result.target}` : ''}`
                : s.drill === 'echo'
                  ? 'Listen, then send it back.'
                  : ' '}
            </p>
            {result && !result.correct && s.drill !== 'char' && <AttemptMarks target={result.target} sent={result.sent} />}
            <div class="mc-stage-actions">
              <label class="mc-field mc-inline">
                <span>Characters</span>
                <select value={s.source} onChange={(e) => set('source', e.currentTarget.value as SendSettings['source'])}>
                  <option value="course">From your course{level ? ` (${charsAt(level).length})` : ''}</option>
                  <option value="all">All letters and numbers</option>
                </select>
              </label>
              <button type="button" class="mc-btn ghost" onClick={() => nextTarget()}>
                Skip
              </button>
            </div>
          </div>
        )}
      </section>

      <section class="mc-panel mc-send-feedback" aria-labelledby="mc-timing-title">
        <h2 class="mc-label" id="mc-timing-title">
          Your timing
        </h2>
        {last ? (
          <>
            <Help class="mc-help">
              Last letter: <strong>{last.ch || '?'}</strong> <span class="mc-mono">{last.code}</span>
              {targetCode !== last.code && (
                <>
                  {' '}
                  · target <strong>{target}</strong> <span class="mc-mono">{targetCode}</span>
                </>
              )}
            </Help>
            <TimingCompare elements={compareLetter(last, last.unit, targetCode)} label={`Timing of ${last.ch || last.code}`} />
          </>
        ) : (
          <Help class="mc-help">Send a letter and you'll see it against the ideal timing here.</Help>
        )}
        <h3 class="mc-label mc-sub">Your fist</h3>
        <FistReport fist={fist.value} marks={markCount.value} />
      </section>

      <details class="mc-panel mc-send-latency">
        <summary class="mc-label">Latency &amp; timing check</summary>
        <LatencyCheck
          estimateMs={k.latencyMs()}
          taps={{
            subscribe: (fn) => {
              tapListeners.current.add(fn);
              return () => tapListeners.current.delete(fn);
            },
          }}
        />
      </details>
    </div>
  );
}

/** Two paddles for touch and mouse; each can be held independently (multi-touch). */
export function Paddles({ onLine, disabled }: { onLine(l: Line, down: boolean, t: number): void; disabled?: boolean }) {
  const held = useSignal({ dit: false, dah: false });
  const press = (l: Line, down: boolean, t: number) => {
    if (held.peek()[l] === down) return;
    held.value = { ...held.peek(), [l]: down };
    onLine(l, down, t);
  };
  const paddle = (l: Line, label: string) => (
    <button
      type="button"
      class="mc-paddle"
      data-side={l}
      aria-label={`${label} paddle`}
      aria-pressed={held.value[l]}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        press(l, true, e.timeStamp / 1000);
      }}
      onPointerUp={(e) => press(l, false, e.timeStamp / 1000)}
      onPointerCancel={(e) => press(l, false, e.timeStamp / 1000)}
      onLostPointerCapture={(e) => press(l, false, e.timeStamp / 1000)}
    >
      <span class="mc-paddle-lever" />
      <span class="mc-paddle-label">{label}</span>
    </button>
  );
  return (
    <div class="mc-paddles">
      {paddle('dit', 'Dit')}
      {paddle('dah', 'Dah')}
    </div>
  );
}

/** Target vs what was sent, letter by letter. */
function AttemptMarks({ target, sent }: { target: string; sent: string }) {
  const r = gradeCopy(target, sent);
  return (
    <div class="mc-copy-marks" aria-label="Letter by letter">
      <span class="mc-copy-group">
        {r.marks.map((m, i) => (
          <span key={i} class={`mc-mark ${m.mark}`}>
            <span class="mc-mark-sent">{m.sent}</span>
            <span class="mc-mark-got">{m.mark === 'wrong' ? m.got : m.mark === 'missed' ? '–' : ''}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

