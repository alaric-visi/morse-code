import { useSignal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DecoderEvent } from '../../core/decoder/decoder';
import { MicDecoder } from '../../audio/mic-decoder';
import { Slider, Switch } from '../../ui/controls';
import { Lamp } from '../../ui/Lamp';
import { Help } from '../../ui/Linked';

/**
 * Decode a real receiver: hold your phone or laptop near the speaker (or plug the
 * receiver's audio into the microphone input). The audio never leaves your device.
 */
export function OffAir() {
  const dec = useRef<MicDecoder | null>(null);
  const [state, setState] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [auto, setAuto] = useState(true);
  const [pitch, setPitch] = useState(700);
  const lit = useSignal(false);
  const level = useSignal(0);
  const [wpm, setWpm] = useState(0);

  useEffect(() => () => dec.current?.stop(), []);

  const start = async () => {
    setState('starting');
    const d = new MicDecoder({
      onEvents: (evs: DecoderEvent[]) => {
        setText((t) => (t + evs.map((e) => (e.kind === 'space' ? ' ' : e.ch || '?')).join('')).slice(-600));
        setWpm(Math.round(d.decoder.wpm));
      },
      onLevel: (rms, _sig, down) => {
        lit.value = down;
        level.value = rms;
      },
      onPitch: (hz) => setPitch(hz),
    });
    d.auto = auto;
    try {
      await d.start();
      dec.current = d;
      setState('on');
    } catch (e) {
      setErr((e as Error).name === 'NotAllowedError' ? 'Microphone access was refused. Allow it in your browser to use the decoder.' : `Couldn't start the microphone: ${(e as Error).message}`);
      setState('error');
    }
  };
  const stop = () => {
    dec.current?.stop();
    dec.current = null;
    setState('off');
    lit.value = false;
  };

  return (
    <div class="mc-offair">
      <Help class="mc-help">
        Point the microphone at a receiver (or a recording) and the decoder will find the strongest tone and read it. Your audio is
        processed on this device and never sent anywhere.
      </Help>
      <div class="mc-head-stage">
        <Lamp lit={lit} />
        <div class="mc-offair-meter" aria-label="Input level">
          <span style={{ width: `${Math.min(100, level.value * 400)}%` }} />
        </div>
        <span class="mc-num mc-help">{state === 'on' ? `${pitch} Hz · ${wpm || '–'} WPM` : ''}</span>
      </div>
      <div class="mc-stage-actions">
        {state !== 'on' ? (
          <button type="button" class="mc-btn primary" disabled={state === 'starting'} onClick={start}>
            {state === 'starting' ? 'Starting…' : 'Start listening'}
          </button>
        ) : (
          <button type="button" class="mc-btn" onClick={stop}>
            Stop
          </button>
        )}
        <button type="button" class="mc-btn ghost" onClick={() => setText('')}>
          Clear
        </button>
      </div>
      {state === 'error' && (
        <p class="mc-feedback mc-warn-note" role="alert">
          {err}
        </p>
      )}
      <Switch
        label="Find the tone automatically"
        checked={auto}
        onChange={(v) => {
          setAuto(v);
          if (dec.current) dec.current.auto = v;
        }}
      />
      {!auto && (
        <Slider
          label="Tone"
          min={300}
          max={1200}
          step={10}
          value={pitch}
          display={`${pitch} Hz`}
          onInput={(v) => {
            setPitch(v);
            dec.current?.setPitch(v);
          }}
        />
      )}
      <p class="mc-transcript mc-mono" aria-live="polite" data-testid="offair-text">
        {text || ' '}
      </p>
    </div>
  );
}
