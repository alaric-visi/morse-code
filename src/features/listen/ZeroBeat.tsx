import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Sidetone } from '../../audio/sidetone';
import { seeded } from '../../learn/random';
import { Slider } from '../../ui/controls';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import type { Radio, RadioSettings } from './radio';
import { Help } from '../../ui/Linked';

/**
 * Zero-beat: a station calls slightly off your frequency. Tune (RIT) until its
 * note matches your own sidetone, as you would before answering, so you reply on
 * the same frequency and land in their filter.
 */
export function ZeroBeat({ radio, s, onTune }: { radio: Radio; s: RadioSettings; onTune(rit: number): void }) {
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  // Always noticeably off: 40–300 Hz above or below, so there's something to tune.
  const newOffset = () => (rng() < 0.5 ? -1 : 1) * Math.round(40 + rng() * 260);
  const [offset, setOffset] = useState(newOffset);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const looping = useRef(false);
  const ref = useMemo(() => new Sidetone({ voice: 'sine', pitch: radio.centre, volume: 0.3 }), []);

  useEffect(
    () => () => {
      looping.current = false;
      radio.stop();
      ref.dispose();
    },
    [],
  );

  const loop = async (off: number) => {
    looping.current = true;
    setRunning(true);
    while (looping.current) {
      await radio.play('VVV DE G3ZZZ', { offset: off, fist: 'textbook' });
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const stop = () => {
    looping.current = false;
    radio.stop();
    setRunning(false);
  };
  const reference = () => {
    ref.down();
    setTimeout(() => ref.up(), 700);
  };
  const check = () => {
    setResult(offset - s.rx.rit);
    stop();
  };
  const again = () => {
    const o = newOffset();
    setOffset(o);
    setResult(null);
    onTune(0);
    void loop(o);
  };

  const err = result === null ? null : Math.abs(result);
  return (
    <div class="mc-zerobeat" data-offset={offset}>
      <Help class="mc-help">
        Your sidetone is {radio.centre} Hz. Listen to the station, compare it with your note, and move <strong>RIT</strong> until
        they sound the same. A narrow filter makes it obvious when you're close.
      </Help>
      <div class="mc-head-stage">
        <Lamp lit={radio.lit} />
        <Slider
          label="RIT"
          min={-500}
          max={500}
          step={5}
          value={s.rx.rit}
          display={`${s.rx.rit > 0 ? '+' : ''}${s.rx.rit} Hz`}
          onInput={(v) => {
            onTune(v);
            radio.retune(offset);
          }}
        />
      </div>
      <div class="mc-stage-actions">
        {!running ? (
          <button type="button" class="mc-btn primary" onClick={() => (result === null ? loop(offset) : again())}>
            <IconPlay />
            {result === null ? 'Start' : 'Another station'}
          </button>
        ) : (
          <button type="button" class="mc-btn primary" onClick={check}>
            I'm zero-beat
          </button>
        )}
        <button type="button" class="mc-btn" onClick={reference}>
          Hear my note
        </button>
      </div>
      {err !== null && (
        <p class="mc-feedback" role="status">
          {err <= 15
            ? `Spot on: within ${err} Hz.`
            : err <= 50
              ? `Close: ${err} Hz ${result! > 0 ? 'high' : 'low'}. They'd still hear you.`
              : `${err} Hz ${result! > 0 ? 'high' : 'low'}: you'd probably be outside their filter.`}{' '}
          The station was {offset > 0 ? '+' : ''}
          {offset} Hz off.
        </p>
      )}
    </div>
  );
}
