import { useComputed, useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { gradeCopy, type CopyResult } from '../../learn/drills';
import { forGrading } from '../../learn/qso';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import type { PlayOptions, Radio } from './radio';

/**
 * Copy a passage by ear. Type as it plays; it's graded against what was sent,
 * ignoring spacing and the = separator. With `behind`, a printer shows what was
 * sent that many characters late, so you can practise holding a few characters
 * in your head and writing behind the sound.
 */
export function CopyTask({
  radio,
  text,
  opts,
  behind = null,
  startLabel = 'Start',
  onDone,
}: {
  radio: Radio;
  text: string;
  opts?: PlayOptions;
  behind?: number | null;
  startLabel?: string;
  onDone?(r: CopyResult): void;
}) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'check' | 'done'>('ready');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<CopyResult | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const heardUpTo = useRef(Infinity);
  const pct = useSignal(0);
  const bar = useComputed(() => `width: ${pct.value}%`);
  const total = useMemo(() => radio.scheduleFor(text, opts).total, [text]);

  // Letter positions in the text, so the printer can reveal it letter by letter.
  const letterEnds = useMemo(() => {
    const ends: number[] = [];
    for (let i = 0; i < text.length; i++) if (text[i] !== ' ') ends.push(i + 1);
    return ends;
  }, [text]);
  // Computeds only re-run on signal changes, so mirror render values into signals.
  const phaseSig = useSignal(phase);
  phaseSig.value = phase;
  const behindSig = useSignal(behind);
  behindSig.value = behind;
  const printed = useComputed(() => {
    const ph = phaseSig.value;
    const b = behindSig.value;
    if (b === null || ph === 'ready') return '';
    const n = radio.cursor.value - b;
    if (ph !== 'playing') return text;
    return n <= 0 ? '' : text.slice(0, letterEnds[Math.min(n, letterEnds.length) - 1]);
  });

  useEffect(() => () => radio.stop(), []);
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const tick = () => {
      pct.value = total ? Math.min(100, (Math.max(0, radio.position()) / total) * 100) : 0;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const start = async () => {
    setPhase('playing');
    heardUpTo.current = Infinity;
    setTimeout(() => input.current?.focus(), 0);
    await radio.play(text, opts);
    setPhase((p) => (p === 'playing' ? 'check' : p));
  };
  const finishEarly = () => {
    heardUpTo.current = Math.max(0, radio.cursor.peek());
    radio.stop();
    setPhase('check');
  };
  const check = () => {
    let sent = forGrading(text);
    if (Number.isFinite(heardUpTo.current)) {
      const end = letterEnds[Math.min(heardUpTo.current, letterEnds.length) - 1] ?? 0;
      sent = forGrading(text.slice(0, end));
    }
    const r = gradeCopy(sent, forGrading(typed));
    setResult(r);
    setPhase('done');
    onDone?.(r);
  };

  return (
    <div class="mc-copy mc-copytask" data-sent={text}>
      {phase === 'ready' && (
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={start}>
            <IconPlay />
            {startLabel}
          </button>
          <span class="mc-help mc-num">about {Math.round(total)} s</span>
        </div>
      )}
      {(phase === 'playing' || phase === 'check') && (
        <>
          <div class="mc-copy-meter">
            <Lamp lit={radio.lit} size="sm" />
            <div class="mc-copy-bar" aria-hidden="true">
              <span style={bar} />
            </div>
          </div>
          {behind !== null && (
            <p class="mc-printer mc-mono" aria-label={`Sent text, ${behind} characters behind`}>
              {printed}
              <span class="mc-printer-caret" aria-hidden="true" />
            </p>
          )}
          <label class="mc-label" for="mc-copytask-in">
            Type what you hear
          </label>
          <textarea
            id="mc-copytask-in"
            ref={input}
            class="mc-copy-input"
            spellcheck={false}
            autocomplete="off"
            autocapitalize="characters"
            value={typed}
            onInput={(e) => setTyped(e.currentTarget.value)}
          />
          <div class="mc-stage-actions">
            {phase === 'playing' ? (
              <button type="button" class="mc-btn" onClick={finishEarly}>
                Finish early
              </button>
            ) : (
              <button type="button" class="mc-btn primary" onClick={check}>
                Check my copy
              </button>
            )}
          </div>
        </>
      )}
      {phase === 'done' && result && (
        <>
          <p class="mc-copy-sent mc-mono">{text}</p>
          <div class="mc-copy-marks" aria-label="Your copy, marked">
            <span class="mc-copy-group">
              {result.marks.map((m, i) => (
                <span key={i} class={`mc-mark ${m.mark}`}>
                  <span class="mc-mark-sent">{m.sent}</span>
                  <span class="mc-mark-got">{m.mark === 'wrong' ? m.got : m.mark === 'missed' ? '–' : ''}</span>
                </span>
              ))}
            </span>
          </div>
          <p class={'mc-copy-score' + (result.accuracy >= 0.9 ? ' pass' : '')}>
            <span class="mc-display mc-num">{Math.round(result.accuracy * 100)}%</span>
            <span class="mc-help">
              {result.correct} of {result.total} characters
            </span>
          </p>
        </>
      )}
    </div>
  );
}
