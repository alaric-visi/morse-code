import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { charToMorse } from '../../core/codec';
import { makeCallsign } from '../../learn/callsigns';
import { codeDistance, gradeCopy } from '../../learn/drills';
import { seeded, type Rng } from '../../learn/random';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import type { Radio } from '../listen/radio';
import { Help } from '../../ui/Linked';

type Kind = 'mixed' | 'uk' | 'portable' | 'similar';
const KINDS: Record<Kind, { label: string; about: string }> = {
  mixed: { label: 'Worldwide', about: 'Callsigns from around the world, in their real formats.' },
  uk: { label: 'UK', about: 'G, M and 2E calls with the regional letters: GM Scotland, GW Wales, GI Northern Ireland, GD Isle of Man, GJ Jersey, GU Guernsey.' },
  portable: { label: 'Portable and special', about: 'Suffixes /P (portable), /M (mobile), /MM (maritime mobile), /QRP (low power), and GB special-event calls.' },
  similar: { label: 'Easily confused', about: 'Calls one character away from the last one, swapping letters that sound alike (U/V, B/6, H/5, S/H…).' },
};

const UK_REGIONS = ['G', 'M', 'M', '2E', 'GM', 'MM', 'GW', 'MW', 'GI', 'MI', 'GD', 'GJ', 'GU'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function ukCall(rng: Rng) {
  const p = UK_REGIONS[Math.floor(rng() * UK_REGIONS.length)];
  const n = p.startsWith('2') ? String(Math.floor(rng() * 2)) : String(Math.floor(rng() * 10));
  const len = 2 + Math.floor(rng() * 2);
  return p + n + Array.from({ length: len }, () => LETTERS[Math.floor(rng() * 26)]).join('');
}

/** Swap one character for one that sounds alike (a code one element away). */
function similar(call: string, rng: Rng): string {
  const chars = [...call];
  const idx = chars.map((c, i) => [c, i] as const).filter(([c]) => /[A-Z0-9]/.test(c));
  for (let t = 0; t < 20; t++) {
    const [c, i] = idx[Math.floor(rng() * idx.length)];
    const near = Object.keys(charToMorse).filter((o) => /[A-Z0-9]/.test(o) && o !== c && codeDistance(o, c) === 1 && /[A-Z]/.test(o) === /[A-Z]/.test(c));
    if (near.length) {
      chars[i] = near[Math.floor(rng() * near.length)];
      return chars.join('');
    }
  }
  return call;
}

/** One callsign at a time: hear it, type it, see exactly what you got. */
export function CallsignTrainer({ radio }: { radio: Radio }) {
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const [kind, setKind] = useState<Kind>('mixed');
  const make = (k: Kind, prev?: string): string => {
    if (k === 'uk') return ukCall(rng);
    if (k === 'portable') {
      if (rng() < 0.25) return `GB${Math.floor(rng() * 10)}${Array.from({ length: 2 + Math.floor(rng() * 2) }, () => LETTERS[Math.floor(rng() * 26)]).join('')}`;
      const base = rng() < 0.5 ? ukCall(rng) : makeCallsign(rng, { portable: false }).call;
      return `${base}/${['P', 'M', 'MM', 'QRP', 'P'][Math.floor(rng() * 5)]}`;
    }
    if (k === 'similar' && prev) return similar(prev, rng);
    return makeCallsign(rng, { portable: false }).call;
  };
  const [call, setCall] = useState(() => make('mixed'));
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ReturnType<typeof gradeCopy> | null>(null);
  const [tally, setTally] = useState({ right: 0, total: 0 });
  const [started, setStarted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => radio.stop(), []);

  const play = (c = call) => {
    setStarted(true);
    void radio.play(c).then(() => input.current?.focus());
  };
  const submit = () => {
    if (!typed.trim()) return play();
    const r = gradeCopy(call, typed.toUpperCase());
    const ok = typed.trim().toUpperCase() === call;
    setResult(r);
    setTally((t) => ({ right: t.right + (ok ? 1 : 0), total: t.total + 1 }));
  };
  const next = () => {
    const c = make(kind, call);
    setCall(c);
    setTyped('');
    setResult(null);
    play(c);
  };

  return (
    <div class="mc-qrq" data-target={call}>
      <div class="mc-seg" role="group" aria-label="Callsigns">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              const c = make(k, call);
              setCall(c);
              setResult(null);
              setTyped('');
            }}
          >
            {KINDS[k].label}
          </button>
        ))}
      </div>
      <Help class="mc-help">{KINDS[kind].about}</Help>
      <div class="mc-head-stage">
        <Lamp lit={radio.lit} />
        <p class={'mc-head-reveal mc-display' + (result ? ' shown' : '')}>{result ? call : started ? 'Callsign?' : 'Ready when you are.'}</p>
      </div>
      {!started ? (
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={() => play()}>
            <IconPlay />
            Start
          </button>
        </div>
      ) : (
        <form
          class="mc-qrq-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (result) next();
            else submit();
          }}
        >
          <label class="mc-sr" for="mc-call-in">
            Callsign you heard
          </label>
          <input id="mc-call-in" ref={input} class="mc-qrq-input mc-mono" autocomplete="off" spellcheck={false} value={typed} onInput={(e) => setTyped(e.currentTarget.value.toUpperCase())} />
          <button type="submit" class="mc-btn">
            {result ? 'Next' : 'Check'}
          </button>
        </form>
      )}
      {result && (
        <div class="mc-copy-marks" role="status">
          <span class="mc-copy-group">
            {result.marks.map((m, i) => (
              <span key={i} class={`mc-mark ${m.mark}`}>
                <span class="mc-mark-sent">{m.sent}</span>
                <span class="mc-mark-got">{m.mark === 'wrong' ? m.got : m.mark === 'missed' ? '–' : ''}</span>
              </span>
            ))}
          </span>
        </div>
      )}
      <div class="mc-stage-actions">
        {started && (
          <button type="button" class="mc-btn" onClick={() => play()}>
            Hear again
          </button>
        )}
        <span class="mc-help mc-num mc-push">
          {tally.right} / {tally.total}
        </span>
      </div>
    </div>
  );
}
