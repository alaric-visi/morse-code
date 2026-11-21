import { useEffect, useMemo, useState } from 'preact/hooks';
import type { LicenceLevel } from '../../learn/progress';
import { loadProgress, progress, updateProgress } from '../../learn/store';
import {
  ALLOCATION,
  LEVEL_INFO,
  LEVELS,
  SECTIONS,
  itemsFor,
  mastery,
  mockPaper,
  passed,
  poolFor,
  practiceOrder,
  show,
  type Shown,
  type StudyItem,
} from '../../reference/licence';
import { Linked } from '../../ui/Linked';
import { fmtClock } from '../../core/schedule';

type Mode = { t: 'home' } | { t: 'section'; section: number } | { t: 'practice'; section?: number; item?: string } | { t: 'mock' };

const rng = Math.random;

/** UK licence study: notes for every syllabus item, practice, and timed mock exams. */
export function Licence() {
  useEffect(() => void loadProgress(), []);
  const [level, setLevel] = useState<LicenceLevel>('F');
  const [mode, setMode] = useState<Mode>({ t: 'home' });
  const info = LEVEL_INFO[level];
  const items = useMemo(() => itemsFor(level), [level]);
  const p = progress.value?.licence ?? { answers: {}, mocks: [] };

  if (mode.t === 'practice') {
    const pool = mode.item ? items.find((i) => i.id === mode.item)!.questions : poolFor(level, mode.section);
    return (
      <section class="mc-panel mc-licence" aria-label="Practice">
        <BackLink onClick={() => setMode(mode.section ? { t: 'section', section: mode.section } : { t: 'home' })} />
        {/* The order is fixed when practice starts; saving answers mustn't reshuffle it. */}
        <Practice key={`${level}-${mode.section}-${mode.item}`} make={() => practiceOrder(pool, p, rng).map((q) => show(q, rng))} />
      </section>
    );
  }
  if (mode.t === 'mock') {
    return (
      <section class="mc-panel mc-licence" aria-label="Mock exam">
        <BackLink onClick={() => setMode({ t: 'home' })} />
        <Mock key={level} level={level} />
      </section>
    );
  }
  if (mode.t === 'section') {
    const sec = SECTIONS[mode.section - 1];
    const its = items.filter((i) => i.section === sec.section);
    return (
      <section class="mc-panel mc-licence" aria-label={sec.title}>
        <BackLink onClick={() => setMode({ t: 'home' })} />
        <p class="mc-label">
          {info.name} · Section {sec.section}
        </p>
        <h2 class="mc-display">{sec.title}</h2>
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={() => setMode({ t: 'practice', section: sec.section })}>
            Practise this section
          </button>
        </div>
        <ol class="mc-licence-items">
          {its.map((it) => (
            <ItemCard key={it.id} item={it} onPractise={() => setMode({ t: 'practice', item: it.id, section: sec.section })} />
          ))}
        </ol>
      </section>
    );
  }

  const last = [...p.mocks].reverse().find((m) => m.level === level);
  return (
    <section class="mc-panel mc-licence" aria-label="UK amateur licence">
      <div class="mc-seg mc-licence-levels" role="group" aria-label="Licence level">
        {LEVELS.map((l) => (
          <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
            {LEVEL_INFO[l].name}
          </button>
        ))}
      </div>
      <div class="mc-licence-head">
        <div>
          <h2 class="mc-display">{info.name} licence</h2>
          <p class="mc-help">
            <Linked text={info.about} />
          </p>
        </div>
        <dl class="mc-licence-facts">
          <div>
            <dt>Exam</dt>
            <dd class="mc-num">
              {info.questions} questions, {info.minutes} min
            </dd>
          </div>
          <div>
            <dt>Pass mark</dt>
            <dd class="mc-num">
              {info.pass} of {info.questions}
            </dd>
          </div>
          <div>
            <dt>Power</dt>
            <dd>{info.power}</dd>
          </div>
          <div>
            <dt>Call signs</dt>
            <dd>{info.calls}</dd>
          </div>
        </dl>
      </div>
      <div class="mc-stage-actions">
        <button type="button" class="mc-btn primary" onClick={() => setMode({ t: 'mock' })}>
          Take a mock exam
        </button>
        <button type="button" class="mc-btn" onClick={() => setMode({ t: 'practice' })}>
          Practise everything
        </button>
        {last && (
          <span class="mc-help" data-last-mock>
            Last mock: {last.score}/{last.total}, {passed(last.score, level) ? 'a pass' : 'not yet a pass'}
          </span>
        )}
      </div>
      <ol class="mc-licence-sections">
        {SECTIONS.map((sec) => {
          const its = items.filter((i) => i.section === sec.section);
          if (!its.length) return null;
          const m = mastery(
            its.flatMap((i) => i.questions),
            p,
          );
          return (
            <li key={sec.section}>
              <button type="button" class="mc-style-card mc-licence-section" onClick={() => setMode({ t: 'section', section: sec.section })}>
                <span class="mc-label">Section {sec.section}</span>
                <span class="mc-licence-section-title">{sec.title}</span>
                <span class="mc-help">
                  {its.length} topics · {ALLOCATION[level][sec.section - 1]} exam questions
                </span>
                <span class="mc-meter" aria-label={`${m.good} of ${m.total} questions known`}>
                  <span style={{ width: `${(m.good / Math.max(1, m.total)) * 100}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p class="mc-help mc-licence-source">
        Built on the RSGB Combined Syllabus (v1.6A, July 2024) and Ofcom’s 2024 licence changes. The notes and questions are written for this app; they aren’t the RSGB question bank. Check the{' '}
        <a href="https://rsgb.org/main/training/" rel="noopener" target="_blank">
          RSGB
        </a>{' '}
        and{' '}
        <a href="https://www.ofcom.org.uk/spectrum/radio-spectrum-and-the-law/amateur-radio" rel="noopener" target="_blank">
          Ofcom
        </a>{' '}
        for current exam arrangements.
      </p>
    </section>
  );
}

function BackLink({ onClick }: { onClick(): void }) {
  return (
    <button type="button" class="mc-btn ghost mc-back" onClick={onClick}>
      ← Back
    </button>
  );
}

function ItemCard({ item, onPractise }: { item: StudyItem; onPractise(): void }) {
  const seen = new Set<string>();
  return (
    <li class="mc-licence-item" id={`syl-${item.id}`}>
      <p class="mc-label mc-num">{item.id}</p>
      <h3 class="mc-display">{item.topic}</h3>
      <p>
        <Linked text={item.note} seen={seen} />
      </p>
      <button type="button" class="mc-btn ghost" onClick={onPractise}>
        {item.questions.length === 1 ? 'Try the question' : `Try ${item.questions.length} questions`}
      </button>
    </li>
  );
}

function record(q: Shown, right: boolean) {
  updateProgress((p) => {
    const a = (p.licence.answers[q.id] ??= { right: 0, wrong: 0, at: '' });
    if (right) a.right++;
    else a.wrong++;
    a.at = new Date().toISOString();
  });
}

/** One question at a time, with the explanation straight after each answer. */
function Practice({ make }: { make(): Shown[] }) {
  const [questions] = useState(make);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  if (i >= questions.length)
    return (
      <div class="mc-stage mc-done" role="status">
        <p class="mc-label">Done</p>
        <h2 class="mc-display mc-done-title">
          {score} of {questions.length}
        </h2>
      </div>
    );
  const q = questions[i];
  return (
    <div class="mc-etiquette" data-answer={q.answer}>
      <p class="mc-label">
        Question {i + 1} of {questions.length} · <span class="mc-num">{q.item}</span>
      </p>
      <p class="mc-display mc-etiquette-q">{q.text}</p>
      <Choices q={q} picked={picked} reveal={picked !== null} onPick={(k) => (setPicked(k), k === q.answer && setScore((x) => x + 1), record(q, k === q.answer))} />
      {picked !== null && (
        <>
          <p class="mc-feedback" role="status">
            <strong>{picked === q.answer ? 'Right. ' : 'Not quite. '}</strong>
            <Linked text={q.why} />
          </p>
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn primary" onClick={() => (setI(i + 1), setPicked(null))}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Choices({ q, picked, reveal, onPick }: { q: Shown; picked: number | null; reveal: boolean; onPick(k: number): void }) {
  return (
    <div class="mc-etiquette-choices" role="group" aria-label="Choose an answer">
      {q.order.map((c, k) => (
        <button
          key={k}
          type="button"
          class="mc-style-card"
          aria-pressed={!reveal && picked === k}
          data-result={!reveal || picked === null ? undefined : k === q.answer ? 'right' : k === picked ? 'wrong' : undefined}
          disabled={reveal}
          onClick={() => onPick(k)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** A timed paper with the real exam's mix of sections; marked at the end. */
function Mock({ level }: { level: LicenceLevel }) {
  const info = LEVEL_INFO[level];
  const [paper] = useState(() => mockPaper(level, rng));
  const [answers, setAnswers] = useState<(number | null)[]>(() => paper.map(() => null));
  const [i, setI] = useState(0);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const left = Math.max(0, info.minutes * 60 - (now - started) / 1000);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  useEffect(() => {
    if (!done && left <= 0) finish();
  }, [left, done]);

  const finish = () => {
    if (done) return;
    setDone(true);
    const score = paper.filter((q, k) => answers[k] === q.answer).length;
    paper.forEach((q, k) => answers[k] !== null && record(q, answers[k] === q.answer));
    updateProgress((p) => {
      p.licence.mocks.push({ level, score, total: paper.length, pass: info.pass, seconds: Math.round((Date.now() - started) / 1000), at: new Date().toISOString() });
    });
  };

  if (done) {
    const score = paper.filter((q, k) => answers[k] === q.answer).length;
    const ok = passed(score, level);
    const wrong = paper.map((q, k) => [q, answers[k]] as const).filter(([q, a]) => a !== q.answer);
    return (
      <div class="mc-licence-result" data-score={score}>
        <div class="mc-stage mc-done" role="status">
          <p class="mc-label">{info.name} mock exam</p>
          <h2 class="mc-display mc-done-title">
            {score} of {paper.length}
          </h2>
          <p>{ok ? `A pass: the mark is ${info.pass}.` : `Not a pass yet: you need ${info.pass}.`}</p>
        </div>
        {wrong.length > 0 && (
          <>
            <h3 class="mc-display">To go over</h3>
            <ol class="mc-licence-review">
              {wrong.map(([q, a]) => (
                <li key={q.id}>
                  <p class="mc-label mc-num">{q.item}</p>
                  <p>
                    <strong>{q.text}</strong>
                  </p>
                  <p>
                    {a === null ? 'Not answered. ' : `You said: ${q.order[a]}. `}
                    The answer: {q.order[q.answer]}.
                  </p>
                  <p class="mc-help">
                    <Linked text={q.why} />
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    );
  }

  const q = paper[i];
  const answered = answers.filter((a) => a !== null).length;
  return (
    <div class="mc-etiquette mc-mock" data-answer={q.answer} data-total={paper.length}>
      <div class="mc-mock-bar">
        <span class="mc-label">
          Question {i + 1} of {paper.length}
        </span>
        <span class="mc-num" aria-label="Time left" role="timer">
          {fmtClock(left)}
        </span>
      </div>
      <p class="mc-display mc-etiquette-q">{q.text}</p>
      <Choices q={q} picked={answers[i]} reveal={false} onPick={(k) => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))} />
      <div class="mc-stage-actions">
        <button type="button" class="mc-btn" disabled={i === 0} onClick={() => setI(i - 1)}>
          Previous
        </button>
        {i < paper.length - 1 ? (
          <button type="button" class="mc-btn primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : null}
        <button type="button" class="mc-btn" onClick={finish}>
          Finish ({answered}/{paper.length} answered)
        </button>
      </div>
      <nav class="mc-mock-grid" aria-label="Questions">
        {paper.map((_, k) => (
          <button key={k} type="button" class="mc-num" aria-current={k === i ? 'true' : undefined} data-done={answers[k] !== null ? '' : undefined} onClick={() => setI(k)}>
            {k + 1}
          </button>
        ))}
      </nav>
    </div>
  );
}
