import { useState } from 'preact/hooks';
import { Linked } from '../../ui/Linked';
import { Slider } from '../../ui/controls';

interface Block {
  id: string;
  label: string;
  x: number;
  y: number;
  path: 'rx' | 'tx' | 'both';
  about: string;
}

/** A CW transceiver as a single-conversion superhet, left to right. */
const BLOCKS: Block[] = [
  { id: 'ant', label: 'Antenna', x: 10, y: 95, path: 'both', about: 'Turns your RF into radio waves and catches other stations’ signals. The same antenna serves both directions, through the T/R switch.' },
  { id: 'tr', label: 'T/R switch', x: 120, y: 95, path: 'both', about: 'Connects the antenna to the receiver, or to the transmitter while you send. With QSK (full break-in) it flips between every dot and dash, so you can hear the other station between your elements. With semi break-in it switches to transmit when you start keying and back after a short pause you set (the delay).' },
  { id: 'rf', label: 'RF stage', x: 230, y: 30, path: 'rx', about: 'Band-pass filtering keeps strong out-of-band signals (and the image frequency) out of the mixer. An RF amplifier or preamp adds gain, which helps at VHF but on HF often just amplifies noise; an attenuator does the opposite when the band is loud.' },
  { id: 'vfo', label: 'VFO', x: 340, y: 95, path: 'both', about: 'The variable frequency oscillator: the tuning dial. It sets the frequency you receive and transmit on, by moving the local oscillator so the signal you want lands in the IF. RIT nudges the receive frequency alone; split uses a second VFO for transmit.' },
  { id: 'mix', label: 'Mixer', x: 340, y: 30, path: 'rx', about: 'Mixes the incoming signal with the VFO to produce the intermediate frequency (sum or difference). Every band and every frequency comes out at the same IF, so the filters only have to be good at one frequency.' },
  { id: 'ifilt', label: 'IF filter', x: 450, y: 30, path: 'rx', about: 'Sets how much of the band you hear. A CW filter is narrow (500 Hz, 250 Hz or less), built from quartz crystals or, in an SDR, done in software. Narrow means less noise and fewer neighbours, but too narrow rings and is hard to tune.' },
  { id: 'ifamp', label: 'IF amp, AGC', x: 560, y: 30, path: 'rx', about: 'Most of the receiver’s gain is here. AGC measures the signal and turns this gain down for strong stations so the volume stays even; its voltage also drives the S-meter. Fast AGC recovery suits CW; you can switch it off for very weak signals and ride the RF gain instead.' },
  { id: 'det', label: 'Detector', x: 670, y: 30, path: 'rx', about: 'Mixes the IF with the BFO. A CW signal is just a carrier, so on its own it would be silent; beating it against the BFO produces an audio note. Move the BFO and the pitch changes: that’s your CW pitch setting, usually 500–800 Hz.' },
  { id: 'bfo', label: 'BFO', x: 670, y: 95, path: 'rx', about: 'The beat frequency oscillator, set a few hundred hertz from the IF. The difference between the two is the tone you hear.' },
  { id: 'af', label: 'Audio', x: 780, y: 30, path: 'rx', about: 'Audio amplification and sometimes audio filtering (a peak filter or DSP noise reduction), then to your headphones. The sidetone, which lets you hear your own sending, is mixed in here.' },
  { id: 'key', label: 'Key, keyer', x: 780, y: 160, path: 'tx', about: 'A straight key, bug or cootie closes the circuit directly. Paddles feed an electronic keyer, which forms perfectly timed dots and dashes. The keyer also drives the T/R switching and the sidetone.' },
  { id: 'shape', label: 'Keying', x: 560, y: 160, path: 'tx', about: 'Switches the carrier on and off, with each edge rounded over a few milliseconds. Edges too sharp cause key clicks heard far either side of you; too soft and fast CW turns to mush. Keying the oscillator itself can cause chirp, so good rigs key a later stage.' },
  { id: 'pa', label: 'Power amp', x: 340, y: 160, path: 'tx', about: 'Raises the signal to your output power. CW doesn’t need a linear amplifier, but transceivers use one anyway for SSB. QRP means 5 W or less on CW; a Foundation licence allows 25 W, Intermediate 100 W, Full up to 1 kW in primary bands. ALC stops it being overdriven.' },
  { id: 'lpf', label: 'Low-pass', x: 230, y: 160, path: 'tx', about: 'Removes harmonics (multiples of your frequency) before they reach the antenna, so your 7 MHz signal doesn’t also appear on 14 and 21 MHz.' },
];

const LINKS: [string, string][] = [
  ['ant', 'tr'],
  ['tr', 'rf'],
  ['rf', 'mix'],
  ['vfo', 'mix'],
  ['mix', 'ifilt'],
  ['ifilt', 'ifamp'],
  ['ifamp', 'det'],
  ['bfo', 'det'],
  ['det', 'af'],
  ['key', 'shape'],
  ['vfo', 'shape'],
  ['shape', 'pa'],
  ['pa', 'lpf'],
  ['lpf', 'tr'],
];

const W = 96;
const H = 40;
const centre = (b: Block) => [b.x + W / 2, b.y + H / 2] as const;

/** How a CW transceiver works, block by block. */
export function Rig() {
  const [sel, setSel] = useState('vfo');
  const b = BLOCKS.find((x) => x.id === sel)!;
  return (
    <div class="mc-rig">
      <section class="mc-panel" aria-label="Transceiver block diagram">
        <div class="mc-rig-scroll">
          <svg class="mc-rig-diagram" viewBox="0 0 890 215" role="group" aria-label="Blocks of a CW transceiver">
            <text class="mc-rig-path" x="230" y="20">
              Receive
            </text>
            <text class="mc-rig-path" x="230" y="210">
              Transmit
            </text>
            {LINKS.map(([a, z]) => {
              const [x1, y1] = centre(BLOCKS.find((q) => q.id === a)!);
              const [x2, y2] = centre(BLOCKS.find((q) => q.id === z)!);
              return <line key={a + z} class="mc-rig-link" x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
            {BLOCKS.map((x) => (
              <g
                key={x.id}
                class="mc-rig-block"
                data-path={x.path}
                data-on={sel === x.id ? '' : undefined}
                role="button"
                tabIndex={0}
                aria-pressed={sel === x.id}
                aria-label={x.label}
                onClick={() => setSel(x.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(x.id))}
              >
                <rect x={x.x} y={x.y} width={W} height={H} rx={6} />
                <text x={x.x + W / 2} y={x.y + H / 2 + 4} text-anchor="middle">
                  {x.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div class="mc-seg mc-rig-list" role="group" aria-label="Blocks of a CW transceiver">
          {BLOCKS.map((x) => (
            <button key={x.id} type="button" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <div class="mc-rig-detail" role="status" aria-live="polite">
          <h2 class="mc-display">{b.label}</h2>
          <p>
            <Linked text={b.about} seen={new Set(BLOCKS.filter((x) => x.id === sel).map((x) => x.id))} />
          </p>
        </div>
      </section>
      <BeatNote />
      <BreakIn />
    </div>
  );
}

/** The pitch you hear is the difference between the signal and where you're tuned. */
function BeatNote() {
  const [offset, setOffset] = useState(600);
  const [filter, setFilter] = useState(500);
  const inPass = Math.abs(offset - 600) <= filter / 2;
  return (
    <section class="mc-panel" aria-label="The beat note">
      <h2 class="mc-display">The beat note</h2>
      <p>
        <Linked text="A CW signal is a single frequency. You hear it as a tone because the receiver beats it against the BFO; the pitch is how far the signal is from where you’re tuned. With the CW filter centred on your chosen pitch (600 Hz here), a station heard at 600 Hz is right on frequency. That’s zero beat, and it means your reply will land on their frequency too." />
      </p>
      <Slider label="Signal’s offset from your dial" min={100} max={1500} step={10} value={offset} display={`${offset} Hz`} onInput={setOffset} />
      <Slider label="CW filter width" min={100} max={2400} step={50} value={filter} display={`${filter} Hz`} onInput={setFilter} />
      <svg class="mc-rig-pass" viewBox="0 0 300 60" aria-hidden="true">
        <rect class="mc-rig-passband" x={((600 - filter / 2) / 1500) * 300} y="10" width={(filter / 1500) * 300} height="40" />
        <line class="mc-rig-signal" data-in={inPass ? '' : undefined} x1={(offset / 1500) * 300} x2={(offset / 1500) * 300} y1="4" y2="56" />
      </svg>
      <p class="mc-feedback" role="status">
        {offset === 600
          ? 'Zero beat: right on their frequency.'
          : inPass
            ? `You hear a ${offset} Hz tone. You’re ${Math.abs(offset - 600)} Hz off their frequency.`
            : 'Outside the filter: you won’t hear it (or only faintly).'}
      </p>
    </section>
  );
}

/** QSK versus semi break-in: when the receiver is listening. */
function BreakIn() {
  const [mode, setMode] = useState<'qsk' | 'semi'>('qsk');
  const [delay, setDelay] = useState(300);
  // "TEST" at 20 WPM: 60 ms units.
  const u = 60;
  const els: [number, number][] = [];
  let t = 0;
  for (const letter of ['-', '.', '...', '-']) {
    for (let i = 0; i < letter.length; i++) {
      const d = letter[i] === '.' ? u : 3 * u;
      els.push([t, t + d]);
      t += d + u;
    }
    t += 2 * u;
  }
  const end = els[els.length - 1][1];
  const span = end + 700;
  const x = (ms: number) => (ms / span) * 300;
  return (
    <section class="mc-panel" aria-label="Break-in">
      <h2 class="mc-display">QSK or semi break-in</h2>
      <p>
        <Linked text="With full break-in (QSK) the receiver listens between your dots and dashes, so the other station can break in at any moment. Semi break-in stays on transmit until you pause for the delay you’ve set, which is quieter on relays and amplifiers but means you only hear the band between words." />
      </p>
      <div class="mc-drill-controls">
        <div class="mc-seg" role="group" aria-label="Break-in mode">
          <button type="button" aria-pressed={mode === 'qsk'} onClick={() => setMode('qsk')}>
            QSK
          </button>
          <button type="button" aria-pressed={mode === 'semi'} onClick={() => setMode('semi')}>
            Semi break-in
          </button>
        </div>
        {mode === 'semi' && <Slider label="Delay" min={50} max={800} step={10} value={delay} display={`${delay} ms`} onInput={setDelay} />}
      </div>
      <svg class="mc-rig-timeline" viewBox="0 0 300 70" role="img" aria-label={mode === 'qsk' ? 'Receive between every element' : `Transmit held until ${delay} ms after the last element`}>
        <text x="0" y="12">
          Key
        </text>
        {els.map(([a, b], i) => (
          <rect key={i} class="mc-rig-key" x={x(a) + 40 * 0} y="16" width={x(b) - x(a)} height="10" />
        ))}
        <text x="0" y="44">
          Receiver
        </text>
        {mode === 'qsk' ? (
          els.slice(0, -1).map(([, b], i) => <rect key={i} class="mc-rig-rx" x={x(b)} y="48" width={x(els[i + 1][0]) - x(b)} height="10" />)
        ) : (
          <rect class="mc-rig-rx" x={x(end + delay)} y="48" width={Math.max(0, 300 - x(end + delay))} height="10" />
        )}
        {mode === 'qsk' && <rect class="mc-rig-rx" x={x(end)} y="48" width={300 - x(end)} height="10" />}
      </svg>
    </section>
  );
}
