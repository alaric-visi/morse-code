import { useMemo, useState } from 'preact/hooks';
import { FIST_PRESETS, type FistPreset } from '../../core/fist-model';
import { sentences, words, WORD_SOURCES, type WordSource } from '../../learn/material';
import { seeded } from '../../learn/random';
import { Slider } from '../../ui/controls';
import { CopyTask } from './CopyTask';
import { HeadCopy } from './HeadCopy';
import { Qrq } from './Qrq';
import { RadioPanel } from './RadioPanel';
import { SpeedTest } from './SpeedTest';
import { ZeroBeat } from './ZeroBeat';
import { loadRadio, useRadio, type RadioSettings } from './radio';
import { Help } from '../../ui/Linked';

type Drill = 'words' | 'head' | 'behind' | 'fists' | 'zerobeat' | 'qrq' | 'test';

const DRILLS: { id: Drill; label: string; about: string }[] = [
  { id: 'words', label: 'Words', about: 'Common words, abbreviations, Q-codes and callsigns, copied at speed.' },
  { id: 'head', label: 'Head copy', about: 'Understand without writing: words, then phrases, then sentences.' },
  { id: 'behind', label: 'Copy behind', about: 'Write a few characters behind the sound, the way experienced operators do.' },
  { id: 'fists', label: 'Fists', about: "Real people don't send textbook timing. Learn to read heavy dahs, bugs and rushed spacing." },
  { id: 'zerobeat', label: 'Zero-beat', about: 'Tune a station in until it matches your note.' },
  { id: 'qrq', label: 'QRQ', about: 'High speed: instant character recognition, word shapes and the speed ladder.' },
  { id: 'test', label: 'Speed tests', about: 'A minute of copy at 5–40 WPM. Pass and earn a certificate.' },
];

/** Real-world copy: practice material, human fists and band conditions. */
export function Listen() {
  const [s, setS] = useState<RadioSettings>(loadRadio);
  const radio = useRadio(s);
  const [drill, setDrill] = useState<Drill>('words');
  const info = DRILLS.find((d) => d.id === drill)!;
  const clean = drill === 'qrq' || drill === 'test';

  return (
    <div class="mc-listen">
      <nav class="mc-drill-nav" aria-label="Listening drills">
        {DRILLS.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={drill === d.id}
            onClick={() => {
              radio.rest();
              setDrill(d.id);
            }}
          >
            {d.label}
          </button>
        ))}
      </nav>
      <section class="mc-panel mc-listen-main" aria-labelledby="mc-listen-title">
        <h1 class="mc-display mc-listen-title" id="mc-listen-title">
          {info.label}
        </h1>
        <Help class="mc-help">{info.about}</Help>
        {drill === 'words' && <WordsDrill radio={radio} />}
        {drill === 'head' && <HeadCopy radio={radio} />}
        {drill === 'behind' && <BehindDrill radio={radio} />}
        {drill === 'fists' && <FistsDrill radio={radio} />}
        {drill === 'zerobeat' && <ZeroBeat radio={radio} s={s} onTune={(rit) => setS((x) => ({ ...x, rx: { ...x.rx, rit } }))} />}
        {drill === 'qrq' && <Qrq radio={radio} />}
        {drill === 'test' && <SpeedTest radio={radio} />}
      </section>
      <div class="mc-listen-side">
        {clean && <Help class="mc-help mc-side-note">This drill is sent cleanly at your own pitch, so band settings don't apply.</Help>}
        <RadioPanel s={s} onChange={setS} compact />
      </div>
    </div>
  );
}

function WordsDrill({ radio }: { radio: ReturnType<typeof useRadio> }) {
  const [source, setSource] = useState<WordSource>('top100');
  const [count, setCount] = useState(15);
  const [round, setRound] = useState(0);
  const text = useMemo(() => words(source, count, seeded(Date.now() & 0xffffffff)).join(' '), [source, count, round]);
  return (
    <div class="mc-drill-body">
      <div class="mc-drill-controls">
        <label class="mc-field mc-inline">
          <span>Material</span>
          <select value={source} onChange={(e) => setSource(e.currentTarget.value as WordSource)}>
            {(Object.keys(WORD_SOURCES) as WordSource[]).map((k) => (
              <option key={k} value={k}>
                {WORD_SOURCES[k]}
              </option>
            ))}
          </select>
        </label>
        <Slider label="Items" min={5} max={40} step={5} value={count} display={`${count}`} onInput={setCount} />
      </div>
      <CopyTask key={text} radio={radio} text={text} />
      <button type="button" class="mc-btn ghost" onClick={() => setRound((r) => r + 1)}>
        New set
      </button>
    </div>
  );
}

function BehindDrill({ radio }: { radio: ReturnType<typeof useRadio> }) {
  const [behind, setBehind] = useState(3);
  const [round, setRound] = useState(0);
  const text = useMemo(() => sentences(90, seeded(Date.now() & 0xffffffff)), [round]);
  return (
    <div class="mc-drill-body">
      <Slider label="Characters behind" min={0} max={10} step={1} value={behind} display={`${behind}`} onInput={setBehind} />
      <Help class="mc-help">
        The printer shows what was sent {behind} characters late. Keep your writing at least that far behind the sound and let the
        buffer in your head do the work.
      </Help>
      <CopyTask key={`${text}`} radio={radio} text={text} behind={behind} />
      <button type="button" class="mc-btn ghost" onClick={() => setRound((r) => r + 1)}>
        New passage
      </button>
    </div>
  );
}

const FIST_CHOICES = (Object.keys(FIST_PRESETS) as FistPreset[]).filter((f) => f !== 'textbook');

function FistsDrill({ radio }: { radio: ReturnType<typeof useRadio> }) {
  const [choice, setChoice] = useState<FistPreset | 'surprise'>('surprise');
  const [round, setRound] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), [round]);
  const fist = useMemo<FistPreset>(() => (choice === 'surprise' ? FIST_CHOICES[Math.floor(rng() * FIST_CHOICES.length)] : choice), [choice, round]);
  const text = useMemo(() => sentences(70, rng), [round]);
  return (
    <div class="mc-drill-body">
      <label class="mc-field mc-inline">
        <span>Sender</span>
        <select
          value={choice}
          onChange={(e) => {
            setChoice(e.currentTarget.value as FistPreset | 'surprise');
            setRevealed(false);
          }}
        >
          <option value="surprise">Surprise me</option>
          {FIST_CHOICES.map((f) => (
            <option key={f} value={f}>
              {FIST_PRESETS[f].label}
            </option>
          ))}
        </select>
      </label>
      <CopyTask key={`${fist}-${round}`} radio={radio} text={text} opts={{ fist }} onDone={() => setRevealed(true)} />
      {revealed && (
        <p class="mc-feedback" role="status">
          That was <strong>{FIST_PRESETS[fist].label}</strong>: {FIST_PRESETS[fist].about}
        </p>
      )}
      <button
        type="button"
        class="mc-btn ghost"
        onClick={() => {
          setRound((r) => r + 1);
          setRevealed(false);
        }}
      >
        Another sender
      </button>
    </div>
  );
}
