import { useState } from 'preact/hooks';
import type { ReadonlySignal } from '@preact/signals';
import type { InputMode } from '../../audio/keyer-node';
import { KeyButton } from '../../ui/KeyButton';
import { Lamp } from '../../ui/Lamp';
import { Linked } from '../../ui/Linked';
import { Slider } from '../../ui/controls';
import { Paddles } from '../send/Send';
import { loadSend } from '../send/settings';
import { useKeying } from '../send/useKeying';

interface KeyKind {
  id: InputMode;
  name: string;
  draw: 'straight' | 'bug' | 'cootie' | 'single' | 'dual';
  how: string;
  history: string;
  feel: string;
}

const KEYS: KeyKind[] = [
  {
    id: 'straight',
    name: 'Straight key',
    draw: 'straight',
    how: 'A sprung lever with a contact underneath. Press it down and the circuit closes; let go and a spring opens it. Your hand makes every dot, every dash and every gap.',
    history: 'The original telegraph key of the 1840s, and still the first key most operators learn. Old hands call it a pump handle.',
    feel: 'Use your wrist and forearm, not your fingers, with the knob held lightly. Set the gap and spring so it feels firm but not tiring. Most people find 20 WPM a comfortable limit.',
  },
  {
    id: 'bug',
    name: 'Bug (semi-automatic)',
    draw: 'bug',
    how: 'Push the paddle one way and a weighted pendulum starts swinging, tapping out a string of perfectly even dots for as long as you hold it. Push the other way and it closes a plain contact, so you form each dash by hand. Sliding the weight along the pendulum sets the dot speed.',
    history: 'Horace Martin patented his semi-automatic key in 1904 and sold it as the Vibroplex, whose bug-shaped logo gave all such keys their nickname. Before electronic keyers, a bug was how professionals sent fast, untiring Morse.',
    feel: 'The dots run at a fixed speed, but the dahs and gaps are yours, which gives bug operators their famous swing (often with long dahs). The skill is matching your dahs to the pendulum.',
  },
  {
    id: 'cootie',
    name: 'Cootie (sideswiper)',
    draw: 'cootie',
    how: 'A single blade that moves sideways, with a contact on each side. Either direction closes the circuit, so you can make one element on the left and the next on the right, rocking to and fro. Nothing is automatic.',
    history: 'Sideswipers spread in the early 20th century as a way to send fast by hand without the "glass arm" that heavy straight-key work could cause. Cootie key is a nickname.',
    feel: 'Alternate sides for each element, so a letter like S is left-right-left. Its slightly uneven rhythm is easy to recognise on air.',
  },
  {
    id: 'single',
    name: 'Single-lever paddle',
    draw: 'single',
    how: 'One lever that swings either way, feeding an electronic keyer: press one side for dots, the other for dashes. The keyer makes the timing perfect. Because the lever can only touch one contact at a time, you can’t squeeze.',
    history: 'Paddles arrived with electronic keyers in the mid-20th century. Many operators still prefer a single lever because it never sends an extra element by mistake.',
    feel: 'Hold a side to repeat that element, and swap sides for the next. Letters like C (dah-dit-dah-dit) take more movement than with a squeeze.',
  },
  {
    id: 'iambicA',
    name: 'Dual-lever paddle, iambic Mode A',
    draw: 'dual',
    how: 'Two separate levers, one for dots and one for dashes. Squeeze both and the keyer alternates dot-dash-dot-dash, starting with whichever you pressed first. In Mode A it stops as soon as you let go.',
    history: 'Iambic (squeeze) keying became popular in the 1960s and 70s. The names Mode A and Mode B come from early keyer chips that behaved in these two ways.',
    feel: 'C is one squeeze, dah first, released after the fourth element. Mode A is forgiving: what you hold is what you get.',
  },
  {
    id: 'iambicB',
    name: 'Dual-lever paddle, iambic Mode B',
    draw: 'dual',
    how: 'Like Mode A, but the keyer remembers the opposite lever if you touch it during an element. So when you let go of a squeeze, it sends one more alternating element.',
    history: 'Mode B is the default on many modern keyers and rigs, and many fast operators prefer it.',
    feel: 'You release a squeeze one element earlier than in Mode A. If you learned on Mode A, Mode B will add extra elements until you adjust.',
  },
  {
    id: 'ultimatic',
    name: 'Dual-lever paddle, Ultimatic',
    draw: 'dual',
    how: 'Two levers, but squeezing doesn’t alternate: whichever lever you pressed last takes over and repeats. Let it go while still holding the first, and the first lever’s element comes back.',
    history: 'Ultimatic keying dates from the 1950s and is offered on many keyers as an alternative to iambic.',
    feel: 'Good for letters with runs, like J (dit-dah-dah-dah): hold dit, add dah, and the dahs continue. It never adds an element you didn’t ask for.',
  },
];

/** How each kind of key works, with a drawing and a live try-out. */
export function Keys() {
  const [id, setId] = useState<InputMode>('straight');
  const k = KEYS.find((x) => x.id === id)!;
  return (
    <div class="mc-keys">
      <nav class="mc-drill-nav" aria-label="Kinds of key">
        {KEYS.map((x) => (
          <button key={x.id} type="button" aria-pressed={id === x.id} onClick={() => setId(x.id)}>
            {x.name.replace('Dual-lever paddle, iambic', 'Iambic').replace('Dual-lever paddle, ', '')}
          </button>
        ))}
      </nav>
      <section class="mc-panel mc-key-explain" aria-label={k.name}>
        <div>
          <h2 class="mc-display">{k.name}</h2>
          <p>
            <Linked text={k.how} />
          </p>
          <h3 class="mc-label">History</h3>
          <p>
            <Linked text={k.history} />
          </p>
          <h3 class="mc-label">How it feels</h3>
          <p>
            <Linked text={k.feel} />
          </p>
        </div>
        <TryKey key={k.id} kind={k} />
      </section>
    </div>
  );
}

function TryKey({ kind }: { kind: KeyKind }) {
  const base = loadSend();
  const [wpm, setWpm] = useState(Math.min(base.wpm, 20));
  const keying = useKeying({ input: kind.id, wpm, swap: base.swap, pitch: base.pitch, volume: base.volume });
  const text = keying.events.value
    .map((e) => (e.kind === 'space' ? ' ' : e.ch))
    .join('')
    .slice(-60);
  const plain = kind.id === 'straight';
  return (
    <div class="mc-key-try" data-key={kind.id} data-decoded={text.trim()} data-ready={keying.keyerState === "loading" ? undefined : ""}>
      <KeyDrawing kind={kind.draw} pressed={keying.pressed} lit={keying.lit} />
      <div class="mc-head-stage">
        <Lamp lit={keying.lit} size="sm" />
        <span class="mc-mono mc-key-decoded" aria-live="polite">
          {text || ' '}
          <span class="mc-help">{keying.pending.value}</span>
        </span>
      </div>
      {plain ? (
        <KeyButton
          auto={keying.lit}
          sound={{ voice: 'sine', pitch: base.pitch, volume: base.volume }}
          onPress={(t) => keying.onLine('dit', true, t)}
          onRelease={(t) => keying.onLine('dit', false, t)}
        />
      ) : (
        <Paddles disabled={keying.paddlesUnavailable} onLine={(l, d, t) => keying.onLine(l, d, t)} />
      )}
      {kind.id !== 'straight' && kind.id !== 'cootie' && (
        <Slider label={kind.id === 'bug' ? 'Pendulum speed' : 'Keyer speed'} min={8} max={35} step={1} value={wpm} display={`${wpm} WPM`} onInput={setWpm} />
      )}
      <p class="mc-help">
        {plain ? (
          <>
            Hold <kbd>Space</kbd>, or press the key on screen.
          </>
        ) : (
          <>
            <kbd>[</kbd> is the {kind.id === 'bug' ? 'dit (pendulum)' : kind.id === 'cootie' ? 'left' : 'dit'} side, <kbd>]</kbd> the {kind.id === 'cootie' ? 'right' : 'dah'} side. Full practice with timing analysis is on the Send page.
          </>
        )}
      </p>
    </div>
  );
}

/** Stylised drawings of each key; the moving parts follow the contacts. */
function KeyDrawing({ kind, pressed, lit }: { kind: KeyKind['draw']; pressed: ReadonlySignal<{ dit: boolean; dah: boolean }>; lit: ReadonlySignal<boolean> }) {
  const p = pressed.value;
  const tilt = p.dit && !p.dah ? -1 : p.dah && !p.dit ? 1 : 0;
  return (
    <svg class="mc-key-drawing" viewBox="0 0 240 130" role="img" aria-label={`Drawing of a ${kind === 'dual' ? 'dual-lever paddle' : kind === 'single' ? 'single-lever paddle' : kind === 'bug' ? 'bug' : kind === 'cootie' ? 'sideswiper' : 'straight key'}`} data-lit={lit.value ? '' : undefined}>
      <rect class="mc-kd-base" x="20" y="100" width="200" height="18" rx="4" />
      {kind === 'straight' && (
        <g>
          <rect class="mc-kd-post" x="40" y="80" width="14" height="22" />
          <g style={{ transform: `rotate(${p.dit ? 4 : 0}deg)`, transformOrigin: '47px 84px' }} class="mc-kd-move">
            <rect class="mc-kd-arm" x="40" y="78" width="150" height="8" rx="3" />
            <ellipse class="mc-kd-knob" cx="185" cy="70" rx="20" ry="9" />
            <rect class="mc-kd-arm" x="181" y="70" width="8" height="12" />
          </g>
          <circle class="mc-kd-contact" cx="150" cy="97" r="4" />
        </g>
      )}
      {kind === 'bug' && (
        <g>
          <rect class="mc-kd-post" x="98" y="70" width="12" height="32" />
          <g class="mc-kd-move" style={{ transform: `translateX(${p.dit ? -6 : p.dah ? 6 : 0}px)` }}>
            <rect class="mc-kd-arm" x="30" y="76" width="110" height="6" rx="2" />
            <rect class="mc-kd-knob" x="24" y="62" width="10" height="34" rx="3" />
          </g>
          <g class={'mc-kd-move' + (p.dit ? ' mc-kd-swing' : '')} style={{ transformOrigin: '140px 79px' }}>
            <rect class="mc-kd-arm" x="140" y="77" width="80" height="4" />
            <rect class="mc-kd-weight" x="190" y="70" width="14" height="18" rx="2" />
          </g>
          <circle class="mc-kd-contact" cx="128" cy="90" r="4" />
          <circle class="mc-kd-contact" cx="70" cy="90" r="4" />
        </g>
      )}
      {kind === 'cootie' && (
        <g>
          <rect class="mc-kd-post" x="40" y="80" width="20" height="22" />
          <circle class="mc-kd-contact" cx="150" cy="70" r="4" />
          <circle class="mc-kd-contact" cx="150" cy="94" r="4" />
          <g class="mc-kd-move" style={{ transform: `rotate(${tilt * -4}deg)`, transformOrigin: '50px 82px' }}>
            <rect class="mc-kd-arm" x="50" y="80" width="140" height="4" rx="2" />
            <rect class="mc-kd-knob" x="186" y="66" width="10" height="32" rx="3" />
          </g>
        </g>
      )}
      {(kind === 'single' || kind === 'dual') && (
        <g>
          <rect class="mc-kd-post" x="40" y="62" width="40" height="40" rx="4" />
          <circle class="mc-kd-contact" cx="120" cy={kind === 'dual' ? 60 : 66} r="4" />
          <circle class="mc-kd-contact" cx="120" cy={kind === 'dual' ? 104 : 98} r="4" />
          {kind === 'single' ? (
            <g class="mc-kd-move" style={{ transform: `rotate(${tilt * -5}deg)`, transformOrigin: '80px 82px' }}>
              <rect class="mc-kd-arm" x="80" y="80" width="100" height="4" rx="2" />
              <rect class="mc-kd-knob" x="176" y="60" width="12" height="44" rx="4" />
            </g>
          ) : (
            <>
              <g class="mc-kd-move" style={{ transform: `rotate(${p.dit ? 5 : 0}deg)`, transformOrigin: '80px 74px' }}>
                <rect class="mc-kd-arm" x="80" y="70" width="100" height="4" rx="2" />
                <rect class="mc-kd-knob" x="176" y="52" width="12" height="26" rx="4" />
              </g>
              <g class="mc-kd-move" style={{ transform: `rotate(${p.dah ? -5 : 0}deg)`, transformOrigin: '80px 90px' }}>
                <rect class="mc-kd-arm" x="80" y="88" width="100" height="4" rx="2" />
                <rect class="mc-kd-knob" x="176" y="86" width="12" height="26" rx="4" />
              </g>
            </>
          )}
        </g>
      )}
    </svg>
  );
}
