/**
 * How a key-down sounds. Every voice works on any BaseAudioContext, so live
 * playback and WAV export share the same code.
 *
 * - sine: a clean practice-oscillator tone
 * - buzzer: a buzzy square wave through a soft low-pass, like a code-practice buzzer
 * - radio: a sine through a receiver's band-pass with a bed of band noise
 * - sounder: a landline telegraph sounder — no tone; the armature clicks down on
 *   key-down and clacks up on key-up, so you read the gaps between sounds
 */
export type VoiceKind = 'sine' | 'buzzer' | 'radio' | 'sounder';
export const VOICES: readonly { kind: VoiceKind; label: string }[] = [
  { kind: 'sine', label: 'Sine' },
  { kind: 'buzzer', label: 'Buzzer' },
  { kind: 'radio', label: 'Radio' },
  { kind: 'sounder', label: 'Sounder' },
];
export const isVoice = (v: unknown): v is VoiceKind => VOICES.some((x) => x.kind === v);

/** Seconds of attack/release on every tone. 4 ms removes clicks without softening the keying. */
export const EDGE = 0.004;

/** How the transmitter itself sounds, for "poor rig" conditions. */
export interface VoiceOptions {
  /** Hz the tone starts off-pitch at each key-down, settling within ~20 ms (a chirpy transmitter). */
  chirp?: number;
  /** No shaping on key-down/up: audible clicks (a badly adjusted transmitter). */
  hardEdges?: boolean;
}

export interface Voice {
  /** Connect this to the rest of the graph. */
  readonly output: AudioNode;
  /** Sound one element from a to b (context seconds). */
  key(a: number, b: number): void;
  /** Open-ended key-down / key-up, for a hand key. */
  down(t: number): void;
  up(t: number): void;
  /** Cancel everything scheduled from t and fall silent. */
  silence(t: number): void;
  setPitch(hz: number, t: number): void;
  start(t: number): void;
  stop(t: number): void;
}

function envelope(ctx: BaseAudioContext, hardEdges = false) {
  const g = ctx.createGain();
  g.gain.value = 0;
  const p = g.gain;
  const EDGE_NOW = hardEdges ? 0.0002 : EDGE;
  return {
    node: g,
    key(a: number, b: number) {
      const edge = Math.min(EDGE_NOW, (b - a) / 3);
      p.setValueAtTime(0, a);
      p.linearRampToValueAtTime(1, a + edge);
      p.setValueAtTime(1, b - edge);
      p.linearRampToValueAtTime(0, b);
    },
    down(t: number) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(1, t + EDGE);
    },
    up(t: number) {
      hold(p, t);
      p.linearRampToValueAtTime(0, t + EDGE);
    },
    silence(t: number) {
      hold(p, t);
      p.linearRampToValueAtTime(0, t + 0.005);
    },
  };
}

function hold(p: AudioParam, t: number) {
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
  }
}

/** A looping buffer of white noise. */
function noiseSource(ctx: BaseAudioContext) {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function toneVoice(ctx: BaseAudioContext, pitch: number, kind: 'sine' | 'buzzer' | 'radio', opts: VoiceOptions = {}): Voice {
  const osc = ctx.createOscillator();
  const env = envelope(ctx, opts.hardEdges);
  let pitchNow = pitch;
  const out = ctx.createGain();
  osc.frequency.value = pitch;
  osc.connect(env.node);

  let filter: BiquadFilterNode | null = null;
  let noise: AudioBufferSourceNode | null = null;
  let noiseFilter: BiquadFilterNode | null = null;

  if (kind === 'sine') {
    osc.type = 'sine';
    env.node.connect(out);
  } else if (kind === 'buzzer') {
    osc.type = 'square';
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = pitch * 3;
    filter.Q.value = 0.7;
    const trim = ctx.createGain();
    trim.gain.value = 0.45; // squares are much louder than sines
    env.node.connect(filter).connect(trim).connect(out);
  } else {
    osc.type = 'sine';
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = pitch;
    filter.Q.value = 4;
    env.node.connect(filter).connect(out);
    // Band noise heard through the same receiver filter, always on.
    noise = noiseSource(ctx);
    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = pitch;
    noiseFilter.Q.value = 1.2;
    const level = ctx.createGain();
    level.gain.value = 0.16;
    noise.connect(noiseFilter).connect(level).connect(out);
  }

  const chirp = opts.chirp ?? 0;
  return {
    output: out,
    key(a, b) {
      if (chirp) {
        // Each key-down starts off-pitch and pulls in, like an unstable oscillator.
        osc.frequency.setValueAtTime(pitchNow + chirp, a);
        osc.frequency.setTargetAtTime(pitchNow, a, 0.006);
      }
      env.key(a, b);
    },
    down: env.down,
    up: env.up,
    silence: env.silence,
    setPitch(hz, t) {
      pitchNow = hz;
      osc.frequency.setTargetAtTime(hz, t, 0.01);
      if (filter) filter.frequency.setTargetAtTime(kind === 'buzzer' ? hz * 3 : hz, t, 0.01);
      noiseFilter?.frequency.setTargetAtTime(hz, t, 0.01);
    },
    start(t) {
      osc.start(t);
      noise?.start(t);
    },
    stop(t) {
      osc.stop(t);
      noise?.stop(t);
    },
  };
}

/** A short struck-metal transient: a damped resonance plus a noise burst. */
function strike(ctx: BaseAudioContext, freq: number, decay: number, noiseAmt: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 98765;
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = (seed / 0x7fffffff) * 2 - 1;
    const env = Math.exp(-t / decay);
    d[i] = env * (0.7 * Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2.7 * t) + noiseAmt * n * Math.exp(-t / 0.002));
  }
  return buf;
}

function sounderVoice(ctx: BaseAudioContext): Voice {
  const out = ctx.createGain();
  const click = strike(ctx, 2300, 0.008, 0.9); // armature hits the bottom stop
  const clack = strike(ctx, 1400, 0.012, 0.6); // and the top stop on release
  const pending: { src: AudioBufferSourceNode; at: number }[] = [];
  const play = (buf: AudioBuffer, at: number, gain: number) => {
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.start(at);
    pending.push({ src, at });
    if (pending.length > 64) pending.splice(0, pending.length - 64);
  };
  return {
    output: out,
    key(a, b) {
      play(click, a, 1);
      play(clack, b, 0.8);
    },
    down: (t) => play(click, t, 1),
    up: (t) => play(clack, t, 0.8),
    silence(t) {
      for (const p of pending) if (p.at >= t) {
        try {
          p.src.stop();
        } catch {
          /* not started */
        }
      }
      pending.length = 0;
    },
    setPitch: () => {},
    start: () => {},
    stop: () => {},
  };
}

export function createVoice(ctx: BaseAudioContext, kind: VoiceKind, pitch: number, opts?: VoiceOptions): Voice {
  return kind === 'sounder' ? sounderVoice(ctx) : toneVoice(ctx, pitch, kind, opts);
}
