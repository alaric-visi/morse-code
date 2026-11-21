import { useComputed, useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { codeOf, rhythm } from '../../learn/koch';
import { gradeCopy, makeGroups, makeQuestion, passes, type CopyResult, type Question } from '../../learn/drills';
import { charCardId, gradeFrom, review } from '../../learn/srs';
import { record } from '../../learn/stats';
import { progress, updateProgress } from '../../learn/store';
import type { Rng } from '../../learn/random';
import type { CourseAudio } from '../../learn/useCourseAudio';
import { Lamp } from '../../ui/Lamp';
import { MorseTree } from '../../ui/MorseTree';
import { IconPlay } from '../../ui/icons';
import { Help } from '../../ui/Linked';

// ------------------------------------------------------------------ meet

/** Introduce new characters by sound: the rhythm in syllables and where they sit in the tree. */
export function Meet({ chars, audio, onDone }: { chars: string[]; audio: CourseAudio; onDone(): void }) {
  const [i, setI] = useState(0);
  const ch = chars[i];
  const code = codeOf(ch);
  const hear = async (times = 3) => {
    for (let k = 0; k < times; k++) {
      await audio.play(ch);
      await new Promise((r) => setTimeout(r, 450));
    }
  };
  useEffect(() => {
    void hear();
    return () => audio.stop();
  }, [ch]);
  const started = audio.playing.value ? audio.elems.value : code.length;
  return (
    <div class="mc-stage mc-meet">
      <p class="mc-label">New character{chars.length > 1 ? ` ${i + 1} of ${chars.length}` : ''}</p>
      <div class="mc-meet-hero">
        <Lamp lit={audio.lit} />
        <span class="mc-meet-char mc-display">{ch}</span>
        <span class="mc-meet-rhythm" aria-label={`sounds like ${rhythm(code)}`}>
          {rhythm(code)}
        </span>
      </div>
      <Help class="mc-help">
        Say the rhythm along with the sound. You're learning what <strong>{ch}</strong> sounds like, not how many dots it has.
      </Help>
      <MorseTree code={code} started={started} compact />
      <div class="mc-stage-actions">
        <button type="button" class="mc-btn" onClick={() => hear(1)}>
          <IconPlay />
          Hear it again
        </button>
        <button
          type="button"
          class="mc-btn primary"
          onClick={() => {
            audio.stop();
            if (i + 1 < chars.length) setI(i + 1);
            else onDone();
          }}
        >
          {i + 1 < chars.length ? 'Next character' : 'Start practising'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ quiz

export interface QuizResult {
  right: number;
  total: number;
}

/**
 * "Which character was that?" Hear one, pick it from up to four. Each answer
 * updates the character's stats, confusion and FSRS card (fast right answers
 * count for more). Keys: type the character to answer, Space to hear it again.
 */
export function Quiz({
  title,
  count,
  next,
  pool,
  audio,
  rng,
  onDone,
}: {
  title: string;
  count: number;
  /** The next character to ask, or null when there's nothing left. */
  next(): string | null;
  pool: string[];
  audio: CourseAudio;
  rng: Rng;
  onDone(r: QuizResult): void;
}) {
  const [q, setQ] = useState<Question | null>(null);
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const score = useRef({ right: 0, total: 0 });
  const endedAt = useRef(0);

  const ask = (k: number) => {
    const target = k < count ? next() : null;
    if (!target) {
      audio.stop();
      onDone(score.current);
      return;
    }
    const question = makeQuestion(target, pool, progress.peek()?.confusion ?? {}, rng);
    setQ(question);
    setPicked(null);
    setN(k);
    endedAt.current = 0;
    void audio.play(target).then(() => (endedAt.current = performance.now()));
  };
  useEffect(() => {
    ask(0);
    return () => audio.stop();
  }, []);

  const answer = (choice: string) => {
    if (!q || picked) return;
    const rt = endedAt.current ? (performance.now() - endedAt.current) / 1000 : 0;
    const ok = choice === q.answer;
    setPicked(choice);
    score.current.total++;
    if (ok) score.current.right++;
    const now = new Date();
    void updateProgress((p) => {
      record(p.stats, p.confusion, q.answer, choice, rt);
      review(p.cards, charCardId(q.answer), gradeFrom(ok, rt), now);
    });
    if (ok) setTimeout(() => ask(n + 1), 650);
    else void audio.play(q.answer);
  };

  // Keyboard: the character itself answers; Space replays.
  const keys = useRef({ answer, replay: () => q && audio.play(q.answer), q, picked, n });
  keys.current = { answer, replay: () => q && audio.play(q.answer), q, picked, n };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keys.current;
      if (e.key === ' ') {
        e.preventDefault();
        void k.replay();
      } else if (e.key === 'Enter' && k.picked && k.q && k.picked !== k.q.answer) {
        ask(k.n + 1);
      } else if (k.q && k.q.choices.includes(e.key.toUpperCase())) {
        k.answer(e.key.toUpperCase());
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!q) return null;
  const wrong = picked !== null && picked !== q.answer;
  return (
    <div class="mc-stage mc-quiz" data-answer={q.answer}>
      <div class="mc-stage-head">
        <p class="mc-label">{title}</p>
        <span class="mc-num mc-help">
          {Math.min(n + 1, count)} / {count}
        </span>
      </div>
      <div class="mc-quiz-prompt">
        <Lamp lit={audio.lit} />
        <p class="mc-quiz-ask">Which character was that?</p>
        <button type="button" class="mc-btn ghost" onClick={() => audio.play(q.answer)} aria-keyshortcuts="Space">
          <IconPlay />
          Hear it again
        </button>
      </div>
      <div class="mc-choices" role="group" aria-label="Choices">
        {q.choices.map((c) => (
          <button
            key={c}
            type="button"
            class="mc-choice mc-display"
            data-result={picked ? (c === q.answer ? 'right' : c === picked ? 'wrong' : undefined) : undefined}
            disabled={!!picked}
            onClick={() => answer(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <p class="mc-feedback" role="status" aria-live="polite">
        {picked === null
          ? 'Press the character, or tap it.'
          : wrong
            ? `That was ${q.answer} (${rhythm(codeOf(q.answer))}), not ${picked}.`
            : `Right: ${q.answer}, ${rhythm(codeOf(q.answer))}.`}
      </p>
      {wrong && (
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={() => ask(n + 1)} aria-keyshortcuts="Enter">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ copy

/**
 * Copy a stretch of random five-character groups. You type as it plays; the
 * result is aligned against what was sent, so one missed letter costs only that
 * letter. Passing (≥90% over ≥20 characters) unlocks the next character.
 */
export function Copy({
  pool,
  newChars,
  seconds,
  audio,
  rng,
  onDone,
}: {
  pool: string[];
  newChars: string[];
  seconds: number;
  audio: CourseAudio;
  rng: Rng;
  onDone(r: CopyResult): void;
}) {
  const groups = useMemo(() => {
    const stats = progress.peek()?.stats ?? {};
    const out: string[] = [];
    // Add groups until the sound runs for the chosen length.
    while (out.length < 200) {
      out.push(...makeGroups(pool, newChars, stats, 1, rng));
      if (audio.scheduleFor(out.join(' ')).total >= seconds) break;
    }
    return out;
  }, []);
  const sent = groups.join(' ');
  const [phase, setPhase] = useState<'ready' | 'playing' | 'check' | 'done'>('ready');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<CopyResult | null>(null);
  const heardUpTo = useRef(sent.replace(/ /g, '').length);
  const input = useRef<HTMLTextAreaElement>(null);
  const pct = useSignal(0);
  const bar = useComputed(() => `width: ${pct.value}%`);

  useEffect(() => () => audio.stop(), []);
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const tick = () => {
      const t = audio.total();
      pct.value = t ? Math.min(100, (Math.max(0, audio.position()) / t) * 100) : 0;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const start = async () => {
    setPhase('playing');
    setTimeout(() => input.current?.focus(), 0);
    await audio.play(sent);
    setPhase((p) => (p === 'playing' ? 'check' : p));
  };
  const finishEarly = () => {
    // Grade only what was actually sent before stopping.
    const n = audio.cursor.peek();
    heardUpTo.current = n < 0 ? 0 : n;
    audio.stop();
    setPhase('check');
  };
  const check = () => {
    const sentSoFar = sent.replace(/ /g, '').slice(0, heardUpTo.current);
    const r = gradeCopy(sentSoFar, typed);
    setResult(r);
    setPhase('done');
    void updateProgress((p) => {
      for (const m of r.marks) record(p.stats, p.confusion, m.sent, m.got);
    });
  };

  return (
    <div class="mc-stage mc-copy" data-sent={sent}>
      <div class="mc-stage-head">
        <p class="mc-label">Copy</p>
        <span class="mc-help mc-num">{groups.length} groups · about {Math.round(audio.scheduleFor(sent).total)} s</span>
      </div>
      {phase === 'ready' && (
        <>
          <Help class="mc-help">
            Random groups of five. Type what you hear as it plays, and if you miss one, just leave it out and keep going.
          </Help>
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn primary" onClick={start}>
              <IconPlay />
              Start copying
            </button>
          </div>
        </>
      )}
      {(phase === 'playing' || phase === 'check') && (
        <>
          <div class="mc-copy-meter">
            <Lamp lit={audio.lit} size="sm" />
            <div class="mc-copy-bar" aria-hidden="true">
              <span style={bar} />
            </div>
          </div>
          <label class="mc-label" for="mc-copy-in">
            Type what you hear
          </label>
          <textarea
            id="mc-copy-in"
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
          <CopyMarks result={result} groups={groups} />
          <p class={'mc-copy-score' + (passes(result) ? ' pass' : '')}>
            <span class="mc-display mc-num">{Math.round(result.accuracy * 100)}%</span>
            <span class="mc-help">
              {result.correct} of {result.total} right
              {result.total < 20 ? ' (copy at least 20 characters to move on)' : passes(result) ? ' — that passes' : ' — 90% to move on'}
            </span>
          </p>
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn primary" onClick={() => onDone(result)}>
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** What was sent, marked: right, wrong (with what you typed) or missed. */
function CopyMarks({ result, groups }: { result: CopyResult; groups: string[] }) {
  let k = 0;
  const sizes = groups.map((g) => g.length);
  const rows: { sent: string; got: string | null; mark: string }[][] = [];
  for (const size of sizes) {
    const row = result.marks.slice(k, k + size);
    k += size;
    if (row.length) rows.push(row);
  }
  return (
    <div class="mc-copy-marks" aria-label="Your copy, marked">
      {rows.map((row, i) => (
        <span class="mc-copy-group" key={i}>
          {row.map((m, j) => (
            <span key={j} class={`mc-mark ${m.mark}`} title={m.mark === 'wrong' ? `You typed ${m.got}` : m.mark}>
              <span class="mc-mark-sent">{m.sent}</span>
              <span class="mc-mark-got">{m.mark === 'wrong' ? m.got : m.mark === 'missed' ? '–' : ''}</span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
