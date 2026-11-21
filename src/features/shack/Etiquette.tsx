import { useState } from 'preact/hooks';
import etiquette from '../../../content/procedure/etiquette.json';
import { Linked } from '../../ui/Linked';

/** Good operating practice, as situations to think through. */
export function Etiquette() {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const all = etiquette.scenarios;
  const done = i >= all.length;
  if (done) {
    return (
      <div class="mc-stage mc-done" role="status">
        <p class="mc-label">All done</p>
        <h2 class="mc-display mc-done-title">
          {score} of {all.length}
        </h2>
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={() => (setI(0), setPicked(null), setScore(0))}>
            Go through them again
          </button>
        </div>
      </div>
    );
  }
  const sc = all[i];
  return (
    <div class="mc-etiquette">
      <p class="mc-label">
        Situation {i + 1} of {all.length}
      </p>
      <p class="mc-display mc-etiquette-q">
        <Linked text={sc.situation} />
      </p>
      <div class="mc-etiquette-choices" role="group" aria-label="What do you do?">
        {sc.choices.map((c, k) => (
          <button
            key={k}
            type="button"
            class="mc-style-card"
            data-result={picked === null ? undefined : k === sc.answer ? 'right' : k === picked ? 'wrong' : undefined}
            disabled={picked !== null}
            onClick={() => {
              setPicked(k);
              if (k === sc.answer) setScore((x) => x + 1);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {picked !== null && (
        <>
          <p class="mc-feedback" role="status">
            <strong>{picked === sc.answer ? 'Yes. ' : 'Not quite. '}</strong>
            <Linked text={sc.why} />
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
