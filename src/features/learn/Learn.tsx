import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { KOCH, MAX_LEVEL, charsAt, lessonOf, newCharsAt, codeOf, rhythm } from '../../learn/koch';
import { passes, pickTarget, type CopyResult } from '../../learn/drills';
import { charCardId, dueIds, introduce } from '../../learn/srs';
import { dayKey, mastery, streak } from '../../learn/stats';
import { addSession, COPY_LENGTHS, sanitizeSettings, type CopySeconds, type Progress } from '../../learn/progress';
import { loadProgress, persistent, progress, updateProgress } from '../../learn/store';
import { cardsUpTo, CARDS, type TeachingCard } from '../../learn/cards';
import { seeded } from '../../learn/random';
import { useCourseAudio } from '../../learn/useCourseAudio';
import { Slider } from '../../ui/controls';
import { CardBody } from './CardBody';
import { Copy, Meet, Quiz, type QuizResult } from './stages';
import { Help } from '../../ui/Linked';

type Mode = 'lesson' | 'review' | 'copy';
type View = { kind: 'home' } | { kind: 'run'; mode: Mode; n: number } | { kind: 'card'; id: string };

const RECOGNISE_COUNT = 12;
const REVIEW_COUNT = 10;

/** The course: a home page with your next lesson, and the lesson runner. */
export function Learn() {
  const [ready, setReady] = useState(!!progress.value);
  useEffect(() => {
    void loadProgress().then(() => setReady(true));
  }, []);
  const p = progress.value;
  const [view, setView] = useState<View>({ kind: 'home' });
  if (!ready || !p) return <Help class="mc-help">Loading your progress…</Help>;

  // Each run gets its own key so "Another lesson" starts fresh, but saving progress mid-run doesn't remount it.
  const run = (mode: Mode) => setView({ kind: 'run', mode, n: Date.now() });
  if (view.kind === 'run')
    return <Run key={view.n} mode={view.mode} p={p} onExit={() => setView({ kind: 'home' })} onAgain={run} />;
  if (view.kind === 'card') {
    const card = CARDS.find((c) => c.id === view.id);
    return card ? <CardReader card={card} onClose={() => setView({ kind: 'home' })} /> : null;
  }
  return <Home p={p} start={run} open={(id) => setView({ kind: 'card', id })} />;
}

// ------------------------------------------------------------------ home

function Home({ p, start, open }: { p: Progress; start(m: Mode): void; open(id: string): void }) {
  const lesson = lessonOf(p.level);
  const fresh = newCharsAt(p.level);
  const known = charsAt(p.level);
  const due = dueIds(p.cards, new Date(), new Set(known.map(charCardId))).length;
  const days = streak(p.days, new Date());
  const cards = cardsUpTo(lesson);
  const unread = cards.filter((c) => !p.read.includes(c.id));
  const s = p.settings;
  const setCourse = (patch: Partial<Progress['settings']>) =>
    void updateProgress((x) => (x.settings = sanitizeSettings({ ...x.settings, ...patch })));
  const done = p.level >= MAX_LEVEL && fresh.every((c) => p.met.includes(c));

  return (
    <div class="mc-learn">
      <section class="mc-panel mc-learn-hero" aria-labelledby="mc-learn-title">
        <div class="mc-learn-hero-text">
          <p class="mc-label">
            Lesson {lesson} of {MAX_LEVEL - 1}
            {days > 0 && ` · ${days}-day streak`}
          </p>
          <h1 class="mc-display mc-learn-title" id="mc-learn-title">
            {done ? 'You know the whole code' : p.level === 2 ? 'Meet K and M' : `Add ${fresh[0]}`}
          </h1>
          <Help class="mc-help">
            {done
              ? 'Keep reviewing daily and raise the effective speed as your copy improves.'
              : `${fresh.map((c) => `${c} (${rhythm(codeOf(c))})`).join(' and ')}. Copy 90% of a minute of random groups to unlock the next character.`}
          </Help>
          <div class="mc-learn-actions">
            <button type="button" class="mc-btn primary" onClick={() => start('lesson')}>
              {p.sessions.length ? 'Start lesson' : 'Start the course'}
            </button>
            <button type="button" class="mc-btn" disabled={!due} onClick={() => start('review')}>
              Review{due ? ` (${due} due)` : ''}
            </button>
            <button type="button" class="mc-btn" onClick={() => start('copy')}>
              Copy practice
            </button>
          </div>
          {!persistent.value && (
            <Help class="mc-help mc-warn-note" role="note">
              This browser isn't letting the app save, so progress will be lost when you close the page. Export it from
              the Progress page to keep it.
            </Help>
          )}
        </div>
        <Ladder p={p} />
      </section>

      {cards.length > 0 && (
        <section class="mc-panel" aria-labelledby="mc-cards-title">
          <h2 class="mc-label" id="mc-cards-title">
            Read{unread.length ? ` · ${unread.length} new` : ''}
          </h2>
          <ul class="mc-card-list">
            {cards.map((c) => (
              <li key={c.id}>
                <button type="button" class="mc-card-link" onClick={() => open(c.id)}>
                  <span>{c.title}</span>
                  {!p.read.includes(c.id) && <span class="mc-pill-tag">New</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="mc-panel mc-course-settings" aria-label="Course settings">
        <Slider
          label="Character speed"
          min={12}
          max={40}
          step={1}
          value={s.charWpm}
          display={`${s.charWpm} WPM`}
          onInput={(v) => setCourse({ charWpm: v })}
        />
        <Slider
          label="Effective speed"
          min={5}
          max={s.charWpm}
          step={1}
          value={Math.min(s.effWpm, s.charWpm)}
          display={`${Math.min(s.effWpm, s.charWpm)} WPM`}
          onInput={(v) => setCourse({ effWpm: v })}
        />
        <div class="mc-field">
          <label for="mc-copy-len">Copy length</label>
          <select id="mc-copy-len" value={s.copySeconds} onChange={(e) => setCourse({ copySeconds: +e.currentTarget.value as CopySeconds })}>
            {COPY_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} seconds` : `${n / 60} minute${n > 60 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </div>
        <Help class="mc-help">
          Characters stay at full speed so you learn their sound; the effective speed stretches the gaps (Farnsworth).
        </Help>
      </section>
    </div>
  );
}

/** Every character in course order, coloured by how well you know it. */
export function Ladder({ p }: { p: Progress }) {
  return (
    <ol class="mc-ladder" aria-label="Characters in course order">
      {KOCH.map((c, i) => {
        const unlocked = i < p.level;
        const m = unlocked ? mastery(p.stats[c]) : 0;
        return (
          <li key={c} class="mc-ladder-step" data-locked={unlocked ? undefined : 'true'} data-mastery={m} title={unlocked ? `${c}: ${['new', 'learning', 'getting there', 'good', 'solid'][m]}` : `${c}: locked`}>
            {c}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ runner

type Stage = 'meet' | 'recognise' | 'copy' | 'review' | 'summary';

interface Summary {
  recognise?: QuizResult;
  review?: QuizResult;
  copy?: CopyResult;
  levelUp?: string;
}

function Run({ mode, p, onExit, onAgain }: { mode: Mode; p: Progress; onExit(): void; onAgain(m: Mode): void }) {
  const level = p.level;
  const pool = useMemo(() => charsAt(level), []);
  const fresh = useMemo(() => newCharsAt(level), []);
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const audio = useCourseAudio(p.settings);
  const startedAt = useRef(Date.now());
  const summary = useRef<Summary>({});

  // Fixed for the whole run: saving progress (e.g. marking characters met) mustn't reshuffle the steps.
  const toMeet = useMemo(() => fresh.filter((c) => !p.met.includes(c)), []);
  const plan: Stage[] = useMemo(
    () =>
      mode === 'review'
        ? ['review', 'summary']
        : mode === 'copy'
          ? ['copy', 'summary']
          : [...(toMeet.length ? (['meet'] as Stage[]) : []), 'recognise', 'copy', 'review', 'summary'],
    [],
  );
  const [step, setStep] = useState(0);
  const stage = plan[step];
  const nextStage = () => setStep((s) => s + 1);

  // Review: due cards first, then the weakest, among what you know.
  const reviewQueue = useMemo(() => {
    const ids = dueIds(progress.peek()!.cards, new Date(), new Set(pool.map(charCardId)));
    return ids.map((id) => id.slice(2)).slice(0, REVIEW_COUNT);
  }, [step === plan.indexOf('review')]);
  const last = useRef<string | undefined>(undefined);
  const nextRecognise = () => (last.current = pickTarget(pool, fresh, progress.peek()!.stats, rng, last.current));
  const ri = useRef(0);
  const nextReview = () => reviewQueue[ri.current++] ?? null;

  // Log the session when the summary appears.
  useEffect(() => {
    if (stage !== 'summary') return;
    const s = summary.current;
    const now = new Date();
    void updateProgress((x) => {
      addSession(x, {
        at: now.toISOString(),
        day: dayKey(now),
        level: x.level,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
        charWpm: x.settings.charWpm,
        effWpm: x.settings.effWpm,
        ...(s.copy ? { copyAccuracy: s.copy.accuracy, copyChars: s.copy.total } : {}),
        ...(s.levelUp ? { levelUp: true } : {}),
      });
    });
  }, [stage]);

  const finishCopy = (r: CopyResult) => {
    summary.current.copy = r;
    if (passes(r) && level < MAX_LEVEL && progress.peek()!.level === level) {
      const unlocked = KOCH[level];
      summary.current.levelUp = unlocked;
      void updateProgress((x) => {
        x.level = level + 1;
      });
    }
    nextStage();
  };

  return (
    <div class="mc-learn-run">
      <div class="mc-run-head">
        <button type="button" class="mc-btn ghost" onClick={() => (audio.stop(), onExit())}>
          ← Course
        </button>
        <ol class="mc-run-steps" aria-label="Lesson steps">
          {plan.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} data-done={i < step ? 'true' : undefined}>
              {s === 'summary' ? 'Done' : s[0].toUpperCase() + s.slice(1)}
            </li>
          ))}
        </ol>
      </div>
      <section class="mc-panel mc-run-body">
        {stage === 'meet' && (
          <Meet
            chars={toMeet}
            audio={audio}
            onDone={() => {
              const now = new Date();
              void updateProgress((x) => {
                for (const c of fresh) {
                  if (!x.met.includes(c)) x.met.push(c);
                  introduce(x.cards, charCardId(c), now);
                }
              });
              nextStage();
            }}
          />
        )}
        {stage === 'recognise' && (
          <Quiz
            title="Recognise"
            count={RECOGNISE_COUNT}
            next={nextRecognise}
            pool={pool}
            audio={audio}
            rng={rng}
            onDone={(r) => {
              summary.current.recognise = r;
              // Make sure every known character has a card from here on.
              const now = new Date();
              void updateProgress((x) => pool.forEach((c) => introduce(x.cards, charCardId(c), now)));
              nextStage();
            }}
          />
        )}
        {stage === 'copy' && (
          <Copy pool={pool} newChars={fresh} seconds={p.settings.copySeconds} audio={audio} rng={rng} onDone={finishCopy} />
        )}
        {stage === 'review' &&
          (reviewQueue.length ? (
            <Quiz
              title="Review"
              count={reviewQueue.length}
              next={nextReview}
              pool={pool}
              audio={audio}
              rng={rng}
              onDone={(r) => {
                summary.current.review = r;
                nextStage();
              }}
            />
          ) : (
            <SkipReview onNext={nextStage} />
          ))}
        {stage === 'summary' && <Done s={summary.current} mode={mode} onExit={onExit} onAgain={onAgain} />}
      </section>
    </div>
  );
}

function SkipReview({ onNext }: { onNext(): void }) {
  useEffect(() => onNext(), []);
  return null;
}

function Done({ s, mode, onExit, onAgain }: { s: Summary; mode: Mode; onExit(): void; onAgain(m: Mode): void }) {
  const pct = (r?: { right: number; total: number }) => (r && r.total ? `${Math.round((r.right / r.total) * 100)}%` : '—');
  return (
    <div class="mc-stage mc-done">
      <p class="mc-label">Session complete</p>
      {s.levelUp ? (
        <h2 class="mc-display mc-done-title">
          New character: <span class="mc-done-char">{s.levelUp}</span>
        </h2>
      ) : (
        <h2 class="mc-display mc-done-title">Nicely done</h2>
      )}
      <dl class="mc-done-stats">
        {s.recognise && (
          <div>
            <dt>Recognise</dt>
            <dd class="mc-num">{pct(s.recognise)}</dd>
          </div>
        )}
        {s.copy && (
          <div>
            <dt>Copy</dt>
            <dd class="mc-num">{Math.round(s.copy.accuracy * 100)}%</dd>
          </div>
        )}
        {s.review && (
          <div>
            <dt>Review</dt>
            <dd class="mc-num">{pct(s.review)}</dd>
          </div>
        )}
      </dl>
      <Help class="mc-help">
        {s.levelUp
          ? `${s.levelUp} sounds like ${rhythm(codeOf(s.levelUp))}. You'll meet it properly at the start of the next lesson.`
          : s.copy && !passes(s.copy)
            ? 'Copy 90% to unlock the next character. A few short sessions beat one long one.'
            : 'Come back tomorrow to keep your streak going.'}
      </Help>
      <div class="mc-stage-actions">
        <button type="button" class="mc-btn" onClick={onExit}>
          Back to course
        </button>
        <button type="button" class="mc-btn primary" onClick={() => onAgain(mode === 'review' ? 'lesson' : mode)}>
          {s.levelUp ? 'Next lesson' : mode === 'copy' ? 'Copy again' : 'Another lesson'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ teaching cards

function CardReader({ card, onClose }: { card: TeachingCard; onClose(): void }) {
  useEffect(() => {
    void updateProgress((x) => {
      if (!x.read.includes(card.id)) x.read.push(card.id);
    });
  }, [card.id]);
  return (
    <article class="mc-panel mc-card-reader">
      <button type="button" class="mc-btn ghost" onClick={onClose}>
        ← Course
      </button>
      <CardBody blocks={card.blocks} />
    </article>
  );
}
