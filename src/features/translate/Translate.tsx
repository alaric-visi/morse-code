import { useComputed, useSignal, useSignalEffect, type ReadonlySignal } from '@preact/signals';
import { memo } from 'preact/compat';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { morseString, parse, plainOutput, textString, type Letter, type Mode } from '../../core/codec';
import { timing as makeTiming, type Spacing } from '../../core/timing';
import {
  buildSchedule,
  elementsStarted,
  fmtClock,
  fmtDuration,
  isKeyDown,
  letterAt,
  type Schedule,
} from '../../core/schedule';
import { Player, type LoopRange } from '../../audio/player';
import { renderWav, saveBlob } from '../../audio/export';
import { VOICES, type VoiceKind } from '../../audio/voices';
import { tick } from '../../audio/ui-sounds';
import {
  PITCH_MAX,
  PITCH_MIN,
  decodeShare,
  encodeShare,
  loadSettings,
  sanitize,
  saveSettings,
  type TranslateSettings,
} from '../../app/settings';
import { hashQuery, linkTo } from '../../app/router';
import { useReducedMotion } from '../../app/useReducedMotion';
import { Code } from '../../ui/Code';
import { Lamp } from '../../ui/Lamp';
import { Tape } from '../../ui/Tape';
import { Scope } from '../../ui/Scope';
import { KeyButton } from '../../ui/KeyButton';
import { MorseTree } from '../../ui/MorseTree';
import { TimingRuler } from '../../ui/TimingRuler';
import { Slider, Switch } from '../../ui/controls';
import { IconCopy, IconMore, IconPause, IconPlay, IconStop } from '../../ui/icons';
import type { PlaybackView } from '../../ui/playback';
import { Help } from '../../ui/Linked';

type PlayState = 'idle' | 'playing' | 'paused';
interface Status {
  text: string;
  kind: '' | 'playing' | 'warn';
}

const COPY = {
  text: {
    inputLabel: 'Your message',
    placeholder: 'Type your message here...',
    outputLabel: 'Morse code',
    empty: 'Your morse code will appear here as you type.',
  },
  morse: {
    inputLabel: 'Morse code',
    placeholder: '.... . .-.. .-.. --- / .-- --- .-. .-.. -..',
    outputLabel: 'Decoded text',
    empty: 'Type dots and dashes. Use a space between letters and / between words.',
  },
} as const;

const SPACING_HELP: Record<Spacing, string> = {
  standard: 'Letters and gaps at the same speed.',
  farnsworth: 'Letters at full speed; gaps between letters and words stretched to give you time to think.',
  wordsworth: 'Letters and letter gaps at full speed; only the gaps between words are stretched.',
};

/** Level at 100% volume. Leaves headroom; matches the legacy page at the default 60%. */
const MAX_LEVEL = 0.5;

/** Initial state: a share link wins, then saved settings. */
function initialState() {
  const shared = decodeShare(hashQuery());
  const saved = loadSettings();
  if (shared.text === undefined) return { mode: 'text' as Mode, text: '', settings: saved };
  // The link has been read; tidy the address so a refresh doesn't keep reloading it.
  try {
    history.replaceState(null, '', location.href.split('?')[0]);
  } catch {
    /* sandboxed */
  }
  return { mode: shared.mode ?? 'text', text: shared.text, settings: sanitize({ ...saved, ...shared.settings }) };
}

export function Translate() {
  const id = useId();
  const init = useMemo(initialState, []);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [text, setText] = useState(init.text);
  const [s, setSettings] = useState<TranslateSettings>(init.settings);
  const [status, setStatus] = useState<Status>({ text: '', kind: '' });
  const [copied, setCopied] = useState('');
  const [exporting, setExporting] = useState(false);
  const reducedMotion = useReducedMotion();

  const set = <K extends keyof TranslateSettings>(k: K, v: TranslateSettings[K]) =>
    setSettings((prev) => {
      const next = sanitize({ ...prev, [k]: v });
      saveSettings(next);
      return next;
    });

  // Frame-rate state lives in signals bound straight to the DOM.
  const playState = useSignal<PlayState>('idle');
  const pos = useSignal(0);
  const lit = useSignal(false);
  const cursor = useSignal(-1);
  const elems = useSignal(0);
  const spoken = useSignal('');
  const active = useComputed(() => playState.value !== 'idle');

  const parsed = useMemo(() => parse(mode, text, { extended: s.extended }), [mode, text, s.extended]);
  const letters = useMemo(() => parsed.words.flat(), [parsed]);
  const timing = useMemo(
    () => makeTiming({ charWpm: s.charWpm, effWpm: s.effWpm, spacing: s.spacing }),
    [s.charWpm, s.effWpm, s.spacing],
  );
  const schedule = useMemo(() => buildSchedule(parsed.words, timing), [parsed, timing]);
  const copy = COPY[mode];
  const flashArea = s.flashArea && !reducedMotion;
  const level = s.volume * MAX_LEVEL;
  const opts = { extended: s.extended };

  const player = useMemo(() => new Player({ voice: s.voice, pitch: s.pitch, volume: level, muted: !s.sound }), []);
  const live = useRef({ s, letters });
  live.current = { s, letters };
  const input = useRef<HTMLTextAreaElement>(null);
  const outputEl = useRef<HTMLDivElement>(null);

  // Computeds only re-run when a signal they read changes, so render values the
  // instruments need are mirrored into signals here.
  const scheduleSig = useSignal(schedule);
  const lettersSig = useSignal(letters);
  const timingSig = useSignal(timing);
  const pitchSig = useSignal(s.pitch);
  const flashSig = useSignal(flashArea);
  scheduleSig.value = schedule;
  lettersSig.value = letters;
  timingSig.value = timing;
  pitchSig.value = s.pitch;
  flashSig.value = flashArea;

  const view: PlaybackView = useMemo(
    () => ({
      pos,
      lit,
      cursor,
      elems,
      active,
      schedule: scheduleSig,
      letters: lettersSig,
      timing: timingSig,
      pitch: pitchSig,
      analyser: () => player.analyser,
    }),
    [],
  );

  const outputClass = useComputed(
    () =>
      'mc-output' +
      (active.value ? ' playing' : '') +
      (flashSig.value ? ' flash-bg' : '') +
      (lit.value && flashSig.value ? ' lit' : ''),
  );
  const outputEl_ = useComputed(() => String(elems.value));
  const clock = useComputed(() => `${fmtClock(pos.value)} / ${fmtClock(scheduleSig.value.total)}`);

  // ---------------------------------------------------------------- status line
  useEffect(() => {
    const u = parsed.unknown;
    if (u.length) {
      const n = u.length;
      setStatus({
        text:
          mode === 'text'
            ? `${n} character${n > 1 ? 's' : ''} can't be sent in Morse and will be skipped: ${u.join(' ')}`
            : `${n} code${n > 1 ? 's' : ''} not recognised: ${u.join('  ')}`,
        kind: 'warn',
      });
    } else if (playState.peek() === 'idle') {
      setStatus({ text: '', kind: '' });
    }
  }, [parsed]);

  // ---------------------------------------------------------------- frame loop
  const raf = useRef(0);
  function frame() {
    const { s: cur } = live.current;
    // The player's own schedule: after a speed change, a frame can land between
    // the re-render and the re-timing, and must not mix old positions with new times.
    const sch = player.current;
    const p = player.position();
    const at = Math.max(p, 0);
    pos.value = Math.min(at, sch.total);
    lit.value = cur.lamp && isKeyDown(sch.events, p);
    const n = letterAt(sch, at);
    if (n !== -1) {
      elems.value = elementsStarted(sch.events, at);
      if (n !== cursor.peek()) {
        cursor.value = n;
        if (cur.announce) spoken.value = live.current.letters[n]?.ch ?? '';
      }
    }
    if (player.state === 'playing') raf.current = requestAnimationFrame(frame);
  }
  const startFrames = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(frame);
  };

  function finish(message: string) {
    cancelAnimationFrame(raf.current);
    playState.value = 'idle';
    lit.value = false;
    cursor.value = -1;
    elems.value = 0;
    pos.value = 0;
    spoken.value = '';
    setStatus({ text: message, kind: '' });
  }
  player.onEnd = () => finish('Complete');

  // ---------------------------------------------------------------- loop range
  /** The letters selected in the input, or the whole message. */
  function loopRange(sch: Schedule = schedule): LoopRange | null {
    if (!live.current.s.loop || !letters.length) return null;
    const ta = input.current;
    let a = 0;
    let b = letters.length - 1;
    if (ta && ta.selectionEnd > ta.selectionStart) {
      const lo = ta.selectionStart;
      const hi = ta.selectionEnd;
      const hit = letters.flatMap((l, n) => (l.end > lo && l.start < hi ? [n] : []));
      if (hit.length) [a, b] = [hit[0], hit[hit.length - 1]];
    }
    return { from: sch.letterStart[a], to: sch.letterEnd[b] };
  }

  // ---------------------------------------------------------------- transport
  const playingParsed = useRef(parsed);
  function play(from = pos.peek()) {
    if (!schedule.events.length) return;
    if (player.state === 'paused') return resume();
    playingParsed.current = parsed;
    player.load(schedule, loopRange());
    player.play(from >= schedule.total ? 0 : from);
    playState.value = 'playing';
    setStatus({ text: 'Playing…', kind: 'playing' });
    startFrames();
  }
  function pause() {
    if (player.state !== 'playing') return;
    player.pause();
    playState.value = 'paused';
    lit.value = false;
    pos.value = Math.min(player.position(), schedule.total);
    setStatus({ text: 'Paused', kind: '' });
  }
  function resume() {
    player.resume();
    playState.value = 'playing';
    setStatus({ text: 'Playing…', kind: 'playing' });
    startFrames();
  }
  function stop() {
    if (player.state === 'idle' && playState.peek() === 'idle') return;
    player.stop();
    finish('Stopped');
  }
  function toggle() {
    tick(s.uiSounds);
    if (player.state === 'playing') pause();
    else play();
  }
  function seek(to: number) {
    player.seek(to);
    pos.value = to;
    const n = letterAt(schedule, to);
    cursor.value = player.state === 'idle' && playState.peek() === 'idle' ? -1 : n;
    if (player.state === 'idle' && playState.peek() === 'idle' && to > 0) {
      // Scrubbing before playing: hold the position as a pause.
      playState.value = 'paused';
      playingParsed.current = parsed;
      player.load(schedule, loopRange());
      player.play(to);
      player.pause();
      cursor.value = n;
      setStatus({ text: 'Paused', kind: '' });
    }
    if (player.state === 'paused') frame();
  }
  /** Click a letter: play from there (or jump there if already going). */
  function pick(n: number) {
    const t = schedule.letterStart[n];
    if (t === undefined) return;
    if (playState.peek() === 'idle') play(t);
    else seek(t);
  }

  // Live parameters: voice, pitch, volume and sound apply mid-tone.
  useEffect(
    () => player.setParams({ voice: s.voice, pitch: s.pitch, volume: level, muted: !s.sound }),
    [s.voice, s.pitch, level, s.sound],
  );
  useEffect(() => {
    if (!s.lamp) lit.value = false;
  }, [s.lamp]);

  // While playing: if the message itself changed (e.g. the alphabet toggle), stop;
  // if only speed or spacing changed, re-time and carry on from the same letter.
  // Compared against what's actually playing, since effects can run after a new play().
  useEffect(() => {
    if (player.state === 'idle' || player.current === schedule) return;
    if (playingParsed.current !== parsed) {
      stop();
      return;
    }
    const n = Math.max(cursor.peek(), 0);
    player.replace(schedule, schedule.letterStart[n] ?? 0, loopRange(schedule));
    if (player.state === 'paused') frame();
  }, [schedule]);

  useEffect(() => {
    if (player.state !== 'idle') player.setLoop(loopRange());
  }, [s.loop]);

  // Keep the letter being sent in view.
  useSignalEffect(() => {
    const n = cursor.value;
    if (n >= 0) outputEl.current?.querySelector(`[data-n="${n}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  // Ctrl/⌘+Enter plays/pauses, Esc stops. Handlers read the latest render through a ref.
  const keys = useRef({ toggle, stop });
  keys.current = { toggle, stop };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        keys.current.toggle();
      } else if (e.key === 'Escape') {
        keys.current.stop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      player.stop();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  // ---------------------------------------------------------------- copy & export
  async function copyText(value: string, label: string) {
    tick(s.uiSounds);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? '' : c)), 1500);
  }

  async function downloadWav() {
    setExporting(true);
    try {
      const blob = await renderWav(schedule, { pitch: s.pitch, volume: level, voice: s.voice });
      const slug = textString(parsed.words, opts)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
      saveBlob(blob, `morse-${slug || 'message'}.wav`);
    } finally {
      setExporting(false);
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    stop();
    // Carry the translation across so you can round-trip.
    setText(plainOutput(mode, parsed.words, opts));
    setMode(next);
  }

  const state = playState.value;
  const busy = state !== 'idle';
  const canPlay = schedule.events.length > 0;
  const hasWords = parsed.words.length > 0;
  const primaryLabel = state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Play';

  return (
    <div class="mc-translate">
      {/* ------------------------------------------------ message */}
      <section class="mc-panel mc-area-message" aria-labelledby={`${id}-in-label`}>
        <div class="mc-panel-head">
          <label class="mc-label" id={`${id}-in-label`} for={`${id}-in`}>
            {copy.inputLabel}
          </label>
          <div class="mc-seg" role="group" aria-label="Translation direction">
            <button type="button" aria-pressed={mode === 'text'} onClick={() => switchMode('text')}>
              Text → Morse
            </button>
            <button type="button" aria-pressed={mode === 'morse'} onClick={() => switchMode('morse')}>
              Morse → Text
            </button>
          </div>
        </div>
        <textarea
          ref={input}
          id={`${id}-in`}
          class={mode === 'morse' ? 'morse-in' : undefined}
          placeholder={copy.placeholder}
          spellcheck={false}
          readOnly={busy}
          value={text}
          aria-describedby={`${id}-syntax`}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <Help class="mc-help" id={`${id}-syntax`}>
          {mode === 'text'
            ? 'Write prosigns as <AR> or [SK]. Select part of the message to loop just that part.'
            : 'Unknown codes are kept in {braces} when you switch back.'}
        </Help>
      </section>

      {/* ------------------------------------------------ instruments */}
      <section class="mc-panel mc-instruments mc-area-instruments" aria-label="Instruments">
        <div class="mc-instrument mc-instrument-lamp">
          <Lamp lit={lit} testId="lamp" />
          <span class="mc-label">Lamp</span>
        </div>
        <div class="mc-instrument mc-instrument-key">
          <KeyButton auto={lit} sound={{ voice: s.voice, pitch: s.pitch, volume: s.sound ? level : 0 }} disabled={busy} />
          <span class="mc-label">Key</span>
        </div>
        <div class="mc-instrument mc-instrument-scope">
          <Scope view={view} />
          <span class="mc-label">Scope</span>
        </div>
      </section>

      {/* ------------------------------------------------ transport */}
      <section class="mc-transport mc-area-transport" aria-label="Playback">
        <button
          type="button"
          class="mc-btn primary mc-play"
          disabled={!canPlay}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onClick={toggle}
        >
          {state === 'playing' ? <IconPause /> : <IconPlay />}
          {primaryLabel}
        </button>
        <button type="button" class="mc-btn" disabled={!busy} aria-keyshortcuts="Escape" onClick={stop}>
          <IconStop />
          Stop
        </button>
        <div class="mc-scrub">
          <Slider
            label="Position"
            hideLabel
            valueText={clock}
            min={0}
            max={schedule.total || 1}
            step={0.01}
            value={pos}
            disabled={!canPlay}
            onInput={seek}
          />
          <span class="mc-clock mc-num">{clock}</span>
        </div>
        <Switch label="Loop" checked={s.loop} onChange={(v) => set('loop', v)} />
        <button
          type="button"
          class="mc-btn"
          disabled={!hasWords}
          onClick={() => copyText(plainOutput(mode, parsed.words, opts), 'translation')}
        >
          <IconCopy />
          {copied === 'translation' ? 'Copied' : 'Copy'}
        </button>
        <details class="mc-menu">
          <summary class="mc-btn" aria-label="More options">
            <IconMore />
          </summary>
          <div class="mc-menu-items">
            <button type="button" disabled={!hasWords} onClick={() => copyText(morseString(parsed.words, opts), 'morse')}>
              {copied === 'morse' ? 'Copied' : 'Copy as Morse code'}
            </button>
            <button type="button" disabled={!hasWords} onClick={() => copyText(textString(parsed.words, opts), 'text')}>
              {copied === 'text' ? 'Copied' : 'Copy as text'}
            </button>
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => copyText(linkTo('/translate', encodeShare(mode, text, s)), 'link')}
            >
              {copied === 'link' ? 'Copied' : 'Copy share link'}
            </button>
            <button type="button" disabled={!canPlay || exporting} onClick={downloadWav}>
              {exporting ? 'Rendering…' : 'Download WAV'}
            </button>
          </div>
        </details>
      </section>

      {/* ------------------------------------------------ tape */}
      <section class="mc-area-tape" aria-label="Tape">
        <Tape view={view} />
      </section>

      {/* ------------------------------------------------ output */}
      <section class="mc-panel mc-area-output" aria-labelledby={`${id}-out`}>
        <div class="mc-panel-head">
          <span class="mc-label" id={`${id}-out`}>
            {copy.outputLabel}
          </span>
          <span class="mc-duration mc-num">{canPlay ? `≈ ${fmtDuration(schedule.total)}` : ''}</span>
        </div>
        <div
          class={outputClass}
          data-el={outputEl_}
          ref={outputEl}
          role="region"
          aria-labelledby={`${id}-out`}
          onClick={(e) => {
            const el = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
            if (el) pick(+el.dataset.n!);
          }}
        >
          {!hasWords ? <span class="empty">{copy.empty}</span> : <Words words={parsed.words} cursor={cursor} />}
        </div>
        <div class="mc-status">
          <span class={'msg' + (status.kind ? ' ' + status.kind : '')} role="status" aria-live="polite">
            {status.text}
          </span>
          <span class="hint">Ctrl/⌘+Enter plays or pauses · Esc stops · click a letter to play from it</span>
        </div>
        <span class="mc-sr" aria-live="assertive">
          {spoken}
        </span>
      </section>

      {/* ------------------------------------------------ anatomy */}
      <section class="mc-panel mc-area-anatomy" aria-label="Anatomy of the letter">
        <span class="mc-label">Anatomy</span>
        <Anatomy view={view} extended={s.extended} />
      </section>

      {/* ------------------------------------------------ settings */}
      <section class="mc-panel mc-settings mc-area-settings" aria-label="Settings">
        <fieldset class="mc-group">
          <legend class="mc-label">Speed &amp; spacing</legend>
          <Slider
            label="Character speed"
            min={5}
            max={60}
            step={1}
            value={s.charWpm}
            display={`${s.charWpm} WPM`}
            onInput={(v) => set('charWpm', v)}
          />
          <div class="mc-field">
            <label for={`${id}-spacing`}>Spacing</label>
            <select
              id={`${id}-spacing`}
              value={s.spacing}
              aria-describedby={`${id}-spacing-help`}
              onChange={(e) => set('spacing', e.currentTarget.value as Spacing)}
            >
              <option value="standard">Standard</option>
              <option value="farnsworth">Farnsworth</option>
              <option value="wordsworth">Wordsworth</option>
            </select>
            <Help class="mc-help" id={`${id}-spacing-help`}>
              {SPACING_HELP[s.spacing]}
            </Help>
          </div>
          {s.spacing !== 'standard' && (
            <Slider
              label="Effective speed"
              min={5}
              max={s.charWpm}
              step={1}
              value={Math.min(s.effWpm, s.charWpm)}
              display={`${Math.min(s.effWpm, s.charWpm)} WPM`}
              onInput={(v) => set('effWpm', v)}
            />
          )}
        </fieldset>

        <fieldset class="mc-group">
          <legend class="mc-label">Sound</legend>
          <div class="mc-field">
            <label for={`${id}-voice`}>Voice</label>
            <select id={`${id}-voice`} value={s.voice} onChange={(e) => set('voice', e.currentTarget.value as VoiceKind)}>
              {VOICES.map((v) => (
                <option key={v.kind} value={v.kind}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <Slider
            label="Pitch"
            min={PITCH_MIN}
            max={PITCH_MAX}
            step={10}
            value={s.pitch}
            display={`${s.pitch} Hz`}
            disabled={s.voice === 'sounder'}
            onInput={(v) => set('pitch', v)}
          />
          <Slider
            label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            display={`${Math.round(s.volume * 100)}%`}
            onInput={(v) => set('volume', v)}
          />
          <div class="mc-switches">
            <Switch label="Sound" checked={s.sound} onChange={(v) => set('sound', v)} />
            <Switch label="UI sounds" checked={s.uiSounds} onChange={(v) => set('uiSounds', v)} />
          </div>
        </fieldset>

        <fieldset class="mc-group">
          <legend class="mc-label">Display &amp; access</legend>
          <div class="mc-switches">
            <Switch label="Lamp" checked={s.lamp} onChange={(v) => set('lamp', v)} />
            <Switch
              label="Flash the whole output"
              checked={flashArea}
              disabled={reducedMotion}
              title={
                reducedMotion
                  ? 'Off because your system asks for reduced motion'
                  : 'A large flashing area can affect people with photosensitive epilepsy'
              }
              onChange={(v) => set('flashArea', v)}
            />
            <Switch label="Accented letters (É, Ñ, Ü …)" checked={s.extended} onChange={(v) => set('extended', v)} />
            <Switch label="Announce letters" checked={s.announce} onChange={(v) => set('announce', v)} />
          </div>
        </fieldset>
      </section>
    </div>
  );
}

/** Tree + timing ruler for the letter being sent (or the first letter when idle). */
function Anatomy({ view, extended }: { view: PlaybackView; extended: boolean }) {
  const letters = view.letters.value;
  const c = view.cursor.value;
  const n = c >= 0 ? c : letters.findIndex((l) => l.known);
  const letter = n >= 0 ? letters[n] : null;
  const started = c >= 0 ? view.elems.value : letter?.morse.length ?? 0;
  const sch = view.schedule.value;
  // End of word if the next letter starts after a word gap.
  const endOfWord =
    n >= 0 && n + 1 < letters.length
      ? sch.letterStart[n + 1] - sch.letterEnd[n] > view.timing.value.letterGap + 1e-9
      : false;
  return (
    <div class="mc-anatomy">
      <MorseTree code={letter?.morse ?? ''} started={started} extended={extended} compact />
      <TimingRuler letter={letter} timing={view.timing.value} endOfWord={endOfWord} started={started} />
    </div>
  );
}

function Words({ words, cursor }: { words: Letter[][]; cursor: ReadonlySignal<number> }) {
  let n = 0;
  return (
    <>
      {words.map((word, wi) => (
        <span class="mc-word" key={wi}>
          {word.map((l, li) => (
            <Cell key={li} l={l} n={n++} cursor={cursor} />
          ))}
        </span>
      ))}
    </>
  );
}

/**
 * One letter. Its highlight comes from the shared cursor signal and is bound
 * straight to a data attribute, so playback never re-renders the list.
 */
const Cell = memo(
  function Cell({ l, n, cursor }: { l: Letter; n: number; cursor: ReadonlySignal<number> }) {
    const state = useComputed(() => {
      const c = cursor.value;
      return c === n ? 'current' : c > n ? 'done' : '';
    });
    const cls = 'mc-cell' + (l.known ? '' : ' unknown') + (l.kind === 'prosign' ? ' prosign' : '');
    return (
      <span class={cls} data-n={n} data-state={state}>
        <span class="ch">{l.ch}</span>
        {l.known ? (
          <Code morse={l.morse} class="code" />
        ) : (
          <span class="code raw">{l.morse || (l.ch === '#' ? l.raw : '#')}</span>
        )}
      </span>
    );
  },
  (a, b) =>
    a.n === b.n &&
    a.cursor === b.cursor &&
    a.l.ch === b.l.ch &&
    a.l.morse === b.l.morse &&
    a.l.known === b.l.known &&
    a.l.kind === b.l.kind &&
    a.l.raw === b.l.raw,
);
