import { useEffect, useMemo, useState } from 'preact/hooks';
import { Player } from '../../audio/player';
import { loadSettings } from '../../app/settings';
import { CODES, SOURCE, encodeIn, variantSchedule, type CodeTable } from '../../reference/codes';
import { timing } from '../../core/timing';
import { Slider } from '../../ui/controls';
import { Linked } from '../../ui/Linked';

const SAMPLES: Record<string, string> = {
  american: 'WHAT HATH GOD WROUGHT',
  wabun: 'もーるす',
  cyrillic: 'МОРЗЕ',
  greek: 'ΜΟΡΣ',
  hebrew: 'מורס',
  arabic: 'مورس',
  korean: 'ㅁㅗㄹㅡㅅㅡ',
};

/** Morse in other scripts, and the original American code, with playback. */
export function OtherCodes() {
  const [id, setId] = useState(CODES[0].id);
  const table = CODES.find((c) => c.id === id)!;
  const [text, setText] = useState(SAMPLES[id] ?? '');
  const [wpm, setWpm] = useState(15);
  const app = loadSettings();
  const player = useMemo(() => new Player({ voice: id === 'american' ? 'sounder' : app.voice, pitch: app.pitch, volume: app.volume * 0.5, muted: false }), [id]);
  useEffect(() => () => player.stop(), [player]);
  useEffect(() => setText(SAMPLES[id] ?? ''), [id]);

  const unit = timing({ charWpm: wpm }).unit;
  const play = (codes: string[]) => {
    player.stop();
    player.load(variantSchedule(table, codes, unit));
    player.play();
  };
  const enc = encodeIn(table, text);

  return (
    <section class="mc-panel mc-codes" aria-label="Other codes">
      <div class="mc-drill-controls">
        <label class="mc-field mc-inline">
          <span>Code</span>
          <select value={id} onChange={(e) => setId(e.currentTarget.value)}>
            {CODES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Slider label="Speed" min={5} max={30} step={1} value={wpm} display={`${wpm} WPM`} onInput={setWpm} />
      </div>
      <p>
        <Linked text={table.about} />
      </p>
      {table.timing && <p class="mc-help">{table.timing.note}</p>}
      {table.switch && (
        <p class="mc-help">
          Switch in: <span class="mc-mono">{table.switch.start}</span> (DO). Switch back: <span class="mc-mono">{table.switch.end}</span> (SN).
        </p>
      )}
      <form
        class="mc-qrq-form"
        onSubmit={(e) => {
          e.preventDefault();
          play(enc.codes);
        }}
      >
        <label class="mc-sr" for="mc-variant-text">
          Text to send in {table.name}
        </label>
        <input id="mc-variant-text" class="mc-qrq-input" dir={table.dir} lang={langOf(table)} value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="mc-btn primary" disabled={!enc.codes.length}>
          Play
        </button>
      </form>
      <p class="mc-mono mc-help mc-variant-encoded" data-codes={enc.codes.join('|')}>
        {enc.codes.map((c) => (c === '' ? ' / ' : show(c))).join(' ')}
      </p>
      {table.legend && <p class="mc-help">{table.legend}</p>}
      <div class="mc-variant-grid" role="group" dir={table.dir} lang={langOf(table)} aria-label={`${table.name} characters`}>
        {table.chars.map(([ch, code, latin]) => (
          <button key={ch} type="button" class="mc-variant-cell" onClick={() => play([code])} aria-label={`${ch}${latin ? ` (${latin})` : ''}: ${show(code)}. Play`}>
            <span class="mc-variant-char">{ch}</span>
            <span class="mc-mono mc-variant-code" dir="ltr">
              {show(code)}
            </span>
            {latin && <span class="mc-help">{latin}</span>}
          </button>
        ))}
      </div>
      <p class="mc-help">{SOURCE}</p>
    </section>
  );
}

/** Codes as dots and dashes, with American Morse's long marks spelled out. */
const show = (code: string) => code.replace(/_/g, '▬').replace(/=/g, '▬▬').replace(/\./g, '·').replace(/-/g, '–').replace(/ /g, '  ');

const langOf = (t: CodeTable) => ({ wabun: 'ja', cyrillic: 'ru', greek: 'el', hebrew: 'he', arabic: 'ar', korean: 'ko' })[t.id] ?? 'en';
