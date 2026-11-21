import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Player } from '../../audio/player';
import { loadSettings } from '../../app/settings';
import { encodeText } from '../../core/codec';
import { buildSchedule, isKeyDown } from '../../core/schedule';
import { timing } from '../../core/timing';
import { Lamp } from '../../ui/Lamp';
import { Linked } from '../../ui/Linked';
import { Slider } from '../../ui/controls';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const randomIdent = (n: number) => Array.from({ length: n }, () => LETTERS[Math.floor(Math.random() * 26)]).join('');

/** Morse outside amateur radio: aviation beacons, signal lamps, and Morse as an input method. */
export function Signals() {
  return (
    <div class="mc-signals">
      <Beacons />
      <LightCopy />
      <section class="mc-panel mc-prose" aria-label="Morse as an input method">
        <h2 class="mc-display">Morse as a way in</h2>
        <p>
          Morse needs only one or two switches, which makes it a powerful input method for people who can’t use a keyboard or touch screen. A single switch (pressed with a hand, foot, cheek or a sip-and-puff tube) can type anything, at a pace that suits the user, and phone keyboards such as Gboard offer Morse input for this reason.
        </p>
        <p>
          This app works the same way. On the Send page, any switch that types <kbd>Space</kbd> works as a straight key, and two switches that type <kbd>[</kbd> and <kbd>]</kbd> work as paddles. The decoder adapts to your speed, so there’s no fixed timing to keep up with. Slow and steady decodes just as well as fast.
        </p>
      </section>
    </div>
  );
}

function usePlayer(pitch: number, muted = false) {
  const app = loadSettings();
  const player = useMemo(() => new Player({ voice: 'sine', pitch, volume: app.volume * 0.5, muted }), [pitch, muted]);
  useEffect(() => () => player.stop(), [player]);
  return player;
}

function Beacons() {
  const [kind, setKind] = useState<'vor' | 'ndb'>('vor');
  const [ident, setIdent] = useState(() => randomIdent(3));
  const [guess, setGuess] = useState('');
  const [msg, setMsg] = useState('');
  const pitch = kind === 'vor' ? 1020 : 400;
  const player = usePlayer(pitch);
  const play = () => {
    player.stop();
    player.load(buildSchedule(encodeText(`${ident}  ${ident}`).words, timing({ charWpm: 7 })));
    player.play();
  };
  const next = () => {
    const id = randomIdent(kind === 'vor' ? 3 : 2 + Math.floor(Math.random() * 2));
    setIdent(id);
    setGuess('');
    setMsg('');
  };
  useEffect(() => next(), [kind]);
  return (
    <section class="mc-panel" aria-label="Beacon idents" data-ident={ident}>
      <h2 class="mc-display">Beacon idents</h2>
      <p>
        <Linked text="Aviation navigation beacons still identify themselves in Morse, slowly (about 7 WPM), so pilots can check they’ve tuned the right one. A VOR sends a three-letter ident on a 1020 Hz tone. An NDB on LF/MF usually sends two or three letters, keyed on a 400 or 1020 Hz tone; with a BFO you hear it as a note at whatever pitch you choose." />
      </p>
      <div class="mc-drill-controls">
        <div class="mc-seg" role="group" aria-label="Beacon type">
          <button type="button" aria-pressed={kind === 'vor'} onClick={() => setKind('vor')}>
            VOR (1020 Hz)
          </button>
          <button type="button" aria-pressed={kind === 'ndb'} onClick={() => setKind('ndb')}>
            NDB (400 Hz)
          </button>
        </div>
        <button type="button" class="mc-btn primary" onClick={play}>
          Play the ident
        </button>
      </div>
      <form
        class="mc-qrq-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (guess.trim().toUpperCase() === ident) {
            setMsg(`Right: ${ident}. Tuned and identified.`);
            setTimeout(next, 1200);
          } else setMsg(`Not quite. It was ${ident}.`);
        }}
      >
        <label class="mc-sr" for="mc-ident">
          Ident you heard
        </label>
        <input id="mc-ident" class="mc-qrq-input mc-mono" placeholder="IDENT" value={guess} autocomplete="off" onInput={(e) => setGuess(e.currentTarget.value.toUpperCase())} />
        <button type="submit" class="mc-btn">
          Check
        </button>
        <button type="button" class="mc-btn ghost" onClick={next}>
          Another
        </button>
      </form>
      <p class="mc-feedback" role="status" aria-live="polite">
        {msg || 'These idents are made up. Real ones are printed on aviation charts.'}
      </p>
    </section>
  );
}

/** Morse by light alone: no sound, just the lamp, as ships still signal. */
function LightCopy() {
  const [wpm, setWpm] = useState(6);
  const words = ['SOS', 'QRU', 'WHAT SHIP', 'AA', 'TT', 'R', 'K', 'HELLO', 'ALL OK', 'STOP', 'NAME', 'WAIT'];
  const [word, setWord] = useState(() => words[Math.floor(Math.random() * words.length)]);
  const [guess, setGuess] = useState('');
  const [msg, setMsg] = useState('');
  const lit = useSignal(false);
  const player = usePlayer(600, true);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const flash = () => {
    player.stop();
    const sched = buildSchedule(encodeText(word).words, timing({ charWpm: wpm }));
    player.load(sched);
    player.play();
    const loop = () => {
      const pos = player.position();
      lit.value = isKeyDown(sched.events, pos);
      if (player.state === 'playing' && pos <= sched.total) raf.current = requestAnimationFrame(loop);
      else lit.value = false;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(loop);
  };
  return (
    <section class="mc-panel" aria-label="Signal lamp" data-word={word}>
      <h2 class="mc-display">Signal lamp</h2>
      <p>
        <Linked text="Ships still carry an Aldis lamp, and navies signal by light when radio silence matters. Copying by eye is a different skill from copying by ear: there’s no sound, just the lamp. Lamp signalling is slow, so this runs at up to 7 WPM, which also keeps the flashing gentle." />
      </p>
      <div class="mc-light-stage">
        <Lamp lit={lit} testId="light-lamp" />
      </div>
      <div class="mc-drill-controls">
        <Slider label="Speed" min={3} max={7} step={1} value={wpm} display={`${wpm} WPM`} onInput={setWpm} />
        <button type="button" class="mc-btn primary" onClick={flash}>
          Flash it
        </button>
      </div>
      <form
        class="mc-qrq-form"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = guess.trim().toUpperCase() === word;
          setMsg(ok ? `Right: ${word}.` : `It was ${word}.`);
          setGuess('');
          setWord(words[Math.floor(Math.random() * words.length)]);
        }}
      >
        <label class="mc-sr" for="mc-light">
          What the lamp sent
        </label>
        <input id="mc-light" class="mc-qrq-input mc-mono" value={guess} autocomplete="off" onInput={(e) => setGuess(e.currentTarget.value.toUpperCase())} />
        <button type="submit" class="mc-btn">
          Check
        </button>
      </form>
      <p class="mc-feedback" role="status" aria-live="polite">
        {msg || 'Watch the lamp, then type what it sent.'}
      </p>
    </section>
  );
}
