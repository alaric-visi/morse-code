import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { encodeText } from '../../core/codec';
import { FIST_PRESETS, humanSchedule, type FistPreset } from '../../core/fist-model';
import { elementsStarted, isKeyDown, letterAt, type Schedule } from '../../core/schedule';
import { timing } from '../../core/timing';
import { BandRig, CONDITION_PRESETS, sanitizeConditions, sanitizeReceiver, type Conditions, type ConditionsPreset, type Receiver } from '../../audio/band';
import { Player } from '../../audio/player';
import { loadSettings } from '../../app/settings';
import { seeded } from '../../learn/random';

/** How the simulated station sounds, and how you're listening. Shared by Listen and QSO. */
export interface RadioSettings {
  preset: ConditionsPreset | 'custom';
  c: Conditions;
  rx: Receiver;
  /** 0–1 */
  volume: number;
  charWpm: number;
  effWpm: number;
  fist: FistPreset;
}

export const RADIO_DEFAULTS: RadioSettings = {
  preset: 'quiet',
  c: CONDITION_PRESETS.quiet.c,
  rx: { filter: 2400, rit: 0, agc: true },
  volume: 0.7,
  charWpm: 20,
  effWpm: 15,
  fist: 'steady',
};

const KEY = 'mc:radio:v1';
const FISTS = Object.keys(FIST_PRESETS) as FistPreset[];

export function sanitizeRadio(raw: unknown): RadioSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const charWpm = n(r.charWpm, 5, 60, RADIO_DEFAULTS.charWpm);
  const preset = r.preset === 'custom' || (typeof r.preset === 'string' && r.preset in CONDITION_PRESETS) ? (r.preset as RadioSettings['preset']) : 'quiet';
  return {
    preset,
    c: sanitizeConditions(r.c ?? (preset !== 'custom' ? CONDITION_PRESETS[preset].c : undefined)),
    rx: sanitizeReceiver(r.rx),
    volume: typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : RADIO_DEFAULTS.volume,
    charWpm,
    effWpm: n(r.effWpm, 5, charWpm, Math.min(RADIO_DEFAULTS.effWpm, charWpm)),
    fist: FISTS.includes(r.fist as FistPreset) ? (r.fist as FistPreset) : RADIO_DEFAULTS.fist,
  };
}

export function loadRadio(): RadioSettings {
  try {
    return sanitizeRadio(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return { ...RADIO_DEFAULTS };
  }
}

export function saveRadio(s: RadioSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

export interface PlayOptions {
  /** Character speed and overall (Farnsworth) speed; default from settings. */
  wpm?: number;
  effWpm?: number;
  fist?: FistPreset;
  /** The station's offset from your receiver's centre, Hz. */
  offset?: number;
  seed?: number;
  /** Straight to the speakers at your own pitch, bypassing the band (speed tests). */
  clean?: boolean;
}

/** A human-sent schedule at the given speeds; Farnsworth stretches the fist's own gaps. */
export function stationSchedule(text: string, wpm: number, effWpm: number, fist: FistPreset, seed: number): Schedule {
  const p = { wpm, ...FIST_PRESETS[fist].params };
  if (effWpm < wpm) {
    const t = timing({ charWpm: wpm, effWpm, spacing: 'farnsworth' });
    p.letterGap *= t.letterGap / t.unit / 3;
    p.wordGap *= t.wordGap / t.unit / 7;
  }
  return humanSchedule(encodeText(text).words, p, seeded(seed));
}

/**
 * Plays text as a station on a simulated band. The band (noise, fading,
 * neighbours…) keeps running between items until `rest()`, like a real receiver.
 */
export function useRadio(s: RadioSettings) {
  const live = useRef(s);
  live.current = s;
  const centre = useMemo(() => loadSettings().pitch, []);
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const rig = useRef<BandRig | null>(null);
  const player = useRef<Player | null>(null);
  const offset = useRef(0);
  const driftTimer = useRef(0);
  const lit = useSignal(false);
  const cursor = useSignal(-1);
  const elems = useSignal(0);
  const playing = useSignal(false);
  const raf = useRef(0);
  const done = useRef<(() => void) | null>(null);

  const ensureRig = () => {
    if (!rig.current) {
      rig.current = new BandRig(centre, rng);
      rig.current.set(live.current.c, live.current.rx, live.current.volume);
      rig.current.start();
    }
    return rig.current;
  };

  // Live changes to conditions and receiver apply straight away.
  useEffect(() => {
    rig.current?.set(s.c, s.rx, s.volume);
    if (rig.current && player.current) {
      player.current.setParams({
        pitch: rig.current.stationPitch(offset.current),
        voiceOptions: { chirp: s.c.chirp, hardEdges: s.c.clicks },
      });
    }
  }, [s.c, s.rx, s.volume]);

  useEffect(() => () => rest(), []);

  const settle = () => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(driftTimer.current);
    lit.value = false;
    playing.value = false;
    const d = done.current;
    done.current = null;
    d?.();
  };

  function scheduleFor(text: string, o: PlayOptions = {}) {
    const cur = live.current;
    const wpm = o.wpm ?? cur.charWpm;
    return stationSchedule(text, wpm, Math.min(o.effWpm ?? cur.effWpm, wpm), o.fist ?? cur.fist, o.seed ?? Math.floor(rng() * 1e9));
  }

  /** Play `text`; resolves when it's finished (or stopped). */
  function play(text: string, o: PlayOptions = {}): Promise<void> {
    stop();
    if (o.clean) rest();
    const r = o.clean ? null : ensureRig();
    const sch = scheduleFor(text, o);
    if (!sch.events.length) return Promise.resolve();
    offset.current = o.offset ?? 0;
    const c = o.clean ? { chirp: 0, clicks: false, drift: 0 } : live.current.c;
    const p = new Player({
      voice: 'sine',
      pitch: r ? r.stationPitch(offset.current) : centre,
      volume: r ? 0.4 : live.current.volume * 0.5,
      muted: false,
      destination: r?.signalIn,
      voiceOptions: { chirp: c.chirp, hardEdges: c.clicks },
    });
    player.current = p;
    return new Promise((resolve) => {
      done.current = resolve;
      p.onEnd = settle;
      p.load(sch);
      p.play(0);
      playing.value = true;
      // A drifting transmitter: the tone wanders steadily while it sends.
      const startedAt = performance.now();
      if (r && c.drift) {
        driftTimer.current = window.setInterval(() => {
          const mins = (performance.now() - startedAt) / 60000;
          p.setParams({ pitch: r.stationPitch(offset.current) + live.current.c.drift * mins });
        }, 250);
      }
      const frame = () => {
        const pos = p.position();
        lit.value = isKeyDown(sch.events, pos);
        const at = Math.max(pos, 0);
        const n = letterAt(sch, at);
        if (n !== -1) {
          cursor.value = n;
          elems.value = elementsStarted(sch.events, at);
        }
        if (p.state === 'playing') raf.current = requestAnimationFrame(frame);
      };
      frame();
    });
  }

  function stop() {
    if (player.current && player.current.state !== 'idle') player.current.stop();
    player.current = null;
    cursor.value = -1;
    settle();
  }

  /** Stop and switch the band off (noise and all). */
  function rest() {
    stop();
    rig.current?.stop();
    rig.current = null;
  }

  /** Tune the current station by `hz` (zero-beat practice). */
  function retune(hz: number) {
    offset.current = hz;
    if (rig.current && player.current) player.current.setParams({ pitch: rig.current.stationPitch(hz) });
  }

  return {
    play,
    stop,
    rest,
    retune,
    scheduleFor,
    centre,
    position: () => player.current?.position() ?? 0,
    total: () => player.current?.total ?? 0,
    lit,
    cursor,
    elems,
    playing,
  };
}

export type Radio = ReturnType<typeof useRadio>;
