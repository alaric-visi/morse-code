import { useEffect, useMemo, useState } from 'preact/hooks';
import { headItem, type HeadLevel } from '../../learn/material';
import { seeded } from '../../learn/random';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import type { Radio } from './radio';

/**
 * Head copy: hear it, understand it, no pencil. Words first, then phrases, then
 * whole sentences. You mark yourself honestly; that's the point.
 */
export function HeadCopy({ radio }: { radio: Radio }) {
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const [level, setLevel] = useState<HeadLevel>('words');
  const [item, setItem] = useState(() => headItem('words', rng));
  const [shown, setShown] = useState(false);
  const [tally, setTally] = useState({ got: 0, total: 0 });
  const [started, setStarted] = useState(false);

  const play = (text = item) => {
    setStarted(true);
    void radio.play(text);
  };
  const next = (l: HeadLevel = level) => {
    const t = headItem(l, rng);
    setItem(t);
    setShown(false);
    play(t);
  };
  const mark = (got: boolean) => {
    setTally((x) => ({ got: x.got + (got ? 1 : 0), total: x.total + 1 }));
    next();
  };
  useEffect(() => () => radio.stop(), []);

  return (
    <div class="mc-head" data-item={item}>
      <div class="mc-seg" role="group" aria-label="Head copy level">
        {(['words', 'phrases', 'sentences'] as HeadLevel[]).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={level === l}
            onClick={() => {
              setLevel(l);
              if (started) next(l);
              else setItem(headItem(l, rng));
            }}
          >
            {l[0].toUpperCase() + l.slice(1)}
          </button>
        ))}
      </div>
      <div class="mc-head-stage">
        <Lamp lit={radio.lit} />
        <p class={'mc-head-reveal mc-display' + (shown ? ' shown' : '')} aria-live="polite">
          {shown ? item : started ? 'What was it?' : 'Ready when you are.'}
        </p>
      </div>
      <div class="mc-stage-actions">
        {!started ? (
          <button type="button" class="mc-btn primary" onClick={() => play()}>
            <IconPlay />
            Start
          </button>
        ) : (
          <>
            <button type="button" class="mc-btn" onClick={() => play()}>
              <IconPlay />
              Hear again
            </button>
            {!shown ? (
              <button type="button" class="mc-btn primary" onClick={() => setShown(true)}>
                Show me
              </button>
            ) : (
              <>
                <button type="button" class="mc-btn primary" onClick={() => mark(true)}>
                  Got it
                </button>
                <button type="button" class="mc-btn" onClick={() => mark(false)}>
                  Missed it
                </button>
              </>
            )}
          </>
        )}
        <span class="mc-help mc-num mc-push">
          {tally.got} / {tally.total}
        </span>
      </div>
    </div>
  );
}
