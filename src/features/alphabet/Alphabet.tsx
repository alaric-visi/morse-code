import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { charToMorse, extendedChars, prosigns, type Letter } from '../../core/codec';
import { timing } from '../../core/timing';
import { buildSchedule, elementsStarted } from '../../core/schedule';
import { Player } from '../../audio/player';
import { loadSettings } from '../../app/settings';
import { Code } from '../../ui/Code';
import { Lamp } from '../../ui/Lamp';
import { MorseTree } from '../../ui/MorseTree';
import { Switch } from '../../ui/controls';
import { Help } from '../../ui/Linked';

interface Entry {
  ch: string;
  code: string;
  note?: string;
}

const ITU = Object.entries(charToMorse);
const GROUPS: { title: string; entries: Entry[] }[] = [
  { title: 'Letters', entries: ITU.filter(([c]) => /[A-Z]/.test(c)).map(([ch, code]) => ({ ch, code })) },
  { title: 'Numbers', entries: ITU.filter(([c]) => /[0-9]/.test(c)).map(([ch, code]) => ({ ch, code })) },
  { title: 'Punctuation', entries: ITU.filter(([c]) => !/[A-Z0-9]/.test(c)).map(([ch, code]) => ({ ch, code })) },
  { title: 'Prosigns', entries: prosigns.map((p) => ({ ch: `<${p.name}>`, code: p.code, note: p.meaning })) },
];
const ACCENTED: Entry[] = Object.entries(extendedChars).map(([ch, code]) => ({ ch, code }));

/** The whole code at a glance: the tree, and every character to tap and hear. */
export function Alphabet() {
  const settings = useMemo(loadSettings, []);
  const [extended, setExtended] = useState(settings.extended);
  const player = useMemo(
    () => new Player({ voice: settings.voice, pitch: settings.pitch, volume: settings.volume * 0.5, muted: !settings.sound }),
    [],
  );
  const playing = useSignal<Entry | null>(null);
  const started = useSignal(0);
  const lit = useSignal(false);
  const raf = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    player.stop();
  }, []);

  function hear(entry: Entry) {
    cancelAnimationFrame(raf.current);
    player.stop();
    const letter: Letter = { ch: entry.ch, morse: entry.code, known: true, kind: 'char', raw: entry.ch, start: 0, end: 0 };
    const sch = buildSchedule([[letter]], timing({ charWpm: settings.charWpm }));
    player.load(sch);
    player.onEnd = () => {
      cancelAnimationFrame(raf.current);
      lit.value = false;
      started.value = entry.code.length;
      setTimeout(() => {
        if (playing.peek() === entry) playing.value = null;
      }, 500);
    };
    player.play(0);
    playing.value = entry;
    const frame = () => {
      const p = Math.max(player.position(), 0);
      started.value = elementsStarted(sch.events, p);
      lit.value = sch.events.some((e) => p >= e.t0 && p < e.t1);
      if (player.state === 'playing') raf.current = requestAnimationFrame(frame);
    };
    frame();
  }

  const current = playing.value;
  const pickFromTree = (ch: string, code: string) => hear({ ch, code });
  const groups = extended ? [...GROUPS, { title: 'Accented letters', entries: ACCENTED }] : GROUPS;

  return (
    <div class="mc-alphabet">
      <section class="mc-panel mc-alpha-tree" aria-labelledby="mc-alpha-title">
        <div class="mc-panel-head">
          <div>
            <h1 class="mc-display mc-alpha-title" id="mc-alpha-title">
              The alphabet
            </h1>
            <Help class="mc-help">
              Start at the top. Each dit steps left, each dah steps right, and wherever you stop is the letter.
              Tap any letter to hear it.
            </Help>
          </div>
          <Lamp lit={lit} />
        </div>
        <MorseTree
          code={current?.code ?? ''}
          started={current ? started.value : 0}
          extended={extended}
          onPick={pickFromTree}
        />
        <Switch label="Accented letters (É, Ñ, Ü …)" checked={extended} onChange={setExtended} />
      </section>

      {groups.map((g) => (
        <section class="mc-alpha-group" key={g.title} aria-labelledby={`mc-g-${g.title}`}>
          <h2 class="mc-label" id={`mc-g-${g.title}`}>
            {g.title}
          </h2>
          <div class="mc-alpha-grid">
            {g.entries.map((e) => (
              <button
                type="button"
                key={e.ch + e.code}
                class={'mc-alpha-tile' + (e.note ? ' wide' : '')}
                data-playing={current === e ? 'true' : undefined}
                aria-label={`${e.ch}: ${e.code.replace(/\./g, 'dit ').replace(/-/g, 'dah ').trim()}${e.note ? `. ${e.note}` : ''}`}
                onClick={() => hear(e)}
              >
                <span class="mc-alpha-ch mc-display">{e.ch}</span>
                <Code morse={e.code} />
                {e.note && <span class="mc-alpha-note">{e.note}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
