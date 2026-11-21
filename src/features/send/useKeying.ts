import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AdaptiveDecoder, type DecodedLetter, type DecoderEvent } from '../../core/decoder/decoder';
import { getAudio } from '../../audio/engine';
import { KeyerNode, type InputMode } from '../../audio/keyer-node';
import { Sidetone } from '../../audio/sidetone';
import { bindKeyboard, connectMidi, connectSerial, type Line } from '../../input/devices';

export interface KeyingConfig {
  input: InputMode;
  wpm: number;
  swap: boolean;
  pitch: number;
  /** 0–1 */
  volume: number;
}

export interface KeyingListener {
  /** Decoded letters and word spaces. */
  onEvents?(evs: DecoderEvent[]): void;
  /** One key-down, on the keying clock (seconds). */
  onMark?(t0: number, t1: number): void;
  /** Every animation frame, with the keying clock's "now". */
  onFrame?(now: number): void;
  /** Any key or paddle press (performance clock), for the timing check. */
  onTap?(t: number): void;
}

/**
 * Everything about keying in one place: the worklet keyer (iambic + low-latency
 * sidetone) with a plain fallback, the keyboard/MIDI/serial inputs, and the
 * adaptive decoder, kept on the right clock for each kind of key.
 *
 * - Straight key: timing comes from the input events themselves (performance clock).
 * - Paddles: the worklet reports exact key-down/up times and a heartbeat; silence is
 *   judged only up to the last time it reported, so no key-down is still in flight.
 */
export function useKeying(cfg: KeyingConfig, enabled = true) {
  const live = useRef(cfg);
  live.current = cfg;
  const keyer = useRef<KeyerNode | null>(null);
  const [keyerState, setKeyerState] = useState<'loading' | 'ok' | 'none'>('loading');
  const fallback = useMemo(() => new Sidetone({ voice: 'sine', pitch: cfg.pitch, volume: cfg.volume * 0.5 }), []);
  const decoder = useRef(new AdaptiveDecoder(cfg.wpm));
  const lit = useSignal(false);
  const events = useSignal<DecoderEvent[]>([]);
  const pending = useSignal('');
  const wpmLive = useSignal(cfg.wpm);
  const lastLetter = useSignal<DecodedLetter | null>(null);
  /** Which contacts are closed right now (after any paddle swap), for drawing the key. */
  const pressed = useSignal({ dit: false, dah: false });
  const listeners = useRef(new Set<KeyingListener>());
  const emit = <K extends keyof KeyingListener>(k: K, ...args: Parameters<NonNullable<KeyingListener[K]>>) =>
    listeners.current.forEach((l) => (l[k] as ((...a: unknown[]) => void) | undefined)?.(...args));

  useEffect(() => {
    let disposed = false;
    void KeyerNode.create().then((k) => {
      if (disposed) return k?.dispose();
      keyer.current = k;
      setKeyerState(k ? 'ok' : 'none');
      if (k) k.onKeyState = (down, t) => keyerKey.current(down, t);
    });
    return () => {
      disposed = true;
      keyer.current?.dispose();
      fallback.dispose();
    };
  }, []);
  useEffect(() => {
    keyer.current?.configure({ input: cfg.input, wpm: cfg.wpm, pitch: cfg.pitch, volume: cfg.volume * 0.5 });
    fallback.set({ voice: 'sine', pitch: cfg.pitch, volume: cfg.volume * 0.5 });
  }, [cfg.input, cfg.wpm, cfg.pitch, cfg.volume, keyerState]);

  const clock = () => (live.current.input === 'straight' || !keyer.current ? performance.now() / 1000 : keyer.current.now());

  function handle(evs: DecoderEvent[]) {
    if (evs.length) {
      events.value = [...events.peek(), ...evs].slice(-600);
      for (const e of evs) if (e.kind === 'letter') lastLetter.value = e;
      emit('onEvents', evs);
    }
    pending.value = decoder.current.pending;
    wpmLive.value = Math.round(decoder.current.wpm);
  }

  // Iambic: the worklet says exactly when its key went down and up.
  const keyerDownAt = useRef<number | null>(null);
  const keyerKey = useRef<(down: boolean, t: number) => void>(() => {});
  keyerKey.current = (down, t) => {
    if (live.current.input === 'straight') return;
    lit.value = down;
    if (down) {
      keyerDownAt.current = t;
      handle(decoder.current.keyDown(t));
    } else if (keyerDownAt.current !== null) {
      const t0 = keyerDownAt.current;
      keyerDownAt.current = null;
      handle(decoder.current.keyUp(t));
      emit('onMark', t0, t);
    }
  };

  // Finish letters and words as the silence grows.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = clock();
      handle(decoder.current.tick(now));
      emit('onFrame', now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const paddles = useRef({ dit: false, dah: false });
  const straightAt = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  function onLine(line: Line, down: boolean, t: number) {
    if (!enabledRef.current) return;
    getAudio(); // resume audio on the first press
    const cur = live.current;
    if (down) emit('onTap', t);
    if (cur.input === 'straight') {
      if (down && straightAt.current === null) {
        straightAt.current = t;
        if (keyer.current) keyer.current.key(true);
        else fallback.down();
        pressed.value = { dit: true, dah: false };
        lit.value = true;
        handle(decoder.current.keyDown(t));
      } else if (!down && straightAt.current !== null) {
        const t0 = straightAt.current;
        straightAt.current = null;
        if (keyer.current) keyer.current.key(false);
        else fallback.up();
        pressed.value = { dit: false, dah: false };
        lit.value = false;
        handle(decoder.current.keyUp(t));
        emit('onMark', t0, t);
      }
      return;
    }
    if (cur.swap) line = line === 'dit' ? 'dah' : 'dit';
    paddles.current[line] = down;
    pressed.value = { ...paddles.current };
    keyer.current?.paddles(paddles.current.dit, paddles.current.dah);
  }
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;
  useEffect(() => bindKeyboard((l, d, t) => onLineRef.current(l, d, t)), []);

  const disconnect = useRef<(() => void) | null>(null);
  useEffect(() => () => disconnect.current?.(), []);
  /** Connect a MIDI or serial key. Resolves to a message for the user. */
  async function connect(kind: 'midi' | 'serial'): Promise<string> {
    try {
      disconnect.current?.();
      disconnect.current = await (kind === 'midi' ? connectMidi : connectSerial)((l, d, t) => onLineRef.current(l, d, t));
      return kind === 'midi' ? 'MIDI connected. Press your dit paddle (or key) first.' : 'Serial port connected: CTS = dit/key, DSR = dah.';
    } catch (e) {
      return `Couldn't connect: ${(e as Error).message}`;
    }
  }

  function clear() {
    decoder.current.reset(live.current.wpm);
    events.value = [];
    lastLetter.value = null;
    pending.value = '';
    paddles.current = { dit: false, dah: false };
    keyer.current?.paddles(false, false);
  }

  // Changing key type or speed starts the decoder afresh.
  useEffect(() => clear(), [cfg.input, cfg.wpm]);

  /** Subscribe; returns an unsubscribe function. */
  function listen(l: KeyingListener) {
    listeners.current.add(l);
    return () => void listeners.current.delete(l);
  }

  return {
    lit,
    events,
    pending,
    wpmLive,
    lastLetter,
    pressed,
    keyerState,
    paddlesUnavailable: cfg.input !== 'straight' && keyerState === 'none',
    unit: () => decoder.current.unit,
    latencyMs: () => (keyerState === 'ok' && keyer.current ? keyer.current.latencyMs() : null),
    onLine: (l: Line, d: boolean, t: number) => onLineRef.current(l, d, t),
    connect,
    clear,
    listen,
  };
}

export type Keying = ReturnType<typeof useKeying>;
