import { getAudio } from './engine';
import { Player } from './player';
import { encodeText } from '../core/codec';
import { humanSchedule, FIST_PRESETS } from '../core/fist-model';
import type { Rng } from '../learn/random';

/**
 * Band conditions: everything between the other station's transmitter and your
 * ears. Each is 0–1 unless noted.
 */
export interface Conditions {
  /** Background noise (hiss). */
  noise: number;
  pink: boolean;
  /** Static crashes (QRN): how often. */
  qrn: number;
  /** Fading (QSB): how deep, and how fast (Hz, 0.03–1). */
  qsb: number;
  qsbRate: number;
  /** Another station nearby (QRM): how loud, and how far off in pitch (Hz). */
  qrm: number;
  qrmOffset: number;
  /** Transmitter faults: chirp (Hz), key clicks, mains hum, drift (Hz per minute). */
  chirp: number;
  clicks: boolean;
  hum: number;
  drift: number;
  /** Auroral flutter: a fast, rough wobble on the signal. */
  flutter: number;
  /** Multipath: a faint, slightly late second copy of the signal. */
  echo: number;
}

/** Your receiver. */
export interface Receiver {
  /** Filter bandwidth, Hz (2400 = wide open, down to 100 = very narrow). */
  filter: number;
  /** Receiver incremental tuning, Hz: shifts the station's pitch (and out of a narrow filter). */
  rit: number;
  /** Automatic gain control: evens out fading and tames crashes. */
  agc: boolean;
}

export const QUIET: Conditions = {
  noise: 0,
  pink: true,
  qrn: 0,
  qsb: 0,
  qsbRate: 0.15,
  qrm: 0,
  qrmOffset: 350,
  chirp: 0,
  clicks: false,
  hum: 0,
  drift: 0,
  flutter: 0,
  echo: 0,
};

export type ConditionsPreset = 'quiet' | 'moderate' | 'fading' | 'crowded' | 'static' | 'poorRig' | 'aurora';

export const CONDITION_PRESETS: Record<ConditionsPreset, { label: string; about: string; c: Conditions }> = {
  quiet: { label: 'Quiet band', about: 'A clean signal on a silent band.', c: QUIET },
  moderate: { label: 'Moderate noise', about: 'A steady hiss under the signal, like most evenings on 40 m.', c: { ...QUIET, noise: 0.45 } },
  fading: { label: 'Deep fading', about: 'The signal swells and drops away (QSB). AGC helps.', c: { ...QUIET, noise: 0.3, qsb: 0.85, qsbRate: 0.12 } },
  crowded: { label: 'Crowded band', about: 'Another station close by (QRM). Narrow the filter to lose it.', c: { ...QUIET, noise: 0.25, qrm: 0.8, qrmOffset: 280 } },
  static: { label: 'Static crashes', about: 'Thunderstorm crashes (QRN). AGC keeps them bearable.', c: { ...QUIET, noise: 0.25, qrn: 0.6 } },
  poorRig: { label: 'Poor transmitter', about: 'Chirp, key clicks, mains hum and a slowly drifting tone.', c: { ...QUIET, noise: 0.2, chirp: 60, clicks: true, hum: 0.5, drift: 40 } },
  aurora: { label: 'Aurora', about: 'A rough, buzzy flutter and a faint echo, like signals over the pole.', c: { ...QUIET, noise: 0.3, flutter: 0.8, echo: 0.4 } },
};

export const WIDE_OPEN: Receiver = { filter: 2400, rit: 0, agc: true };
export const FILTERS = [2400, 1000, 500, 250, 100] as const;

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const clampN = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

export function sanitizeConditions(raw: unknown): Conditions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    noise: clamp01(r.noise, QUIET.noise),
    pink: typeof r.pink === 'boolean' ? r.pink : QUIET.pink,
    qrn: clamp01(r.qrn, 0),
    qsb: clamp01(r.qsb, 0),
    qsbRate: clampN(r.qsbRate, 0.03, 1, QUIET.qsbRate),
    qrm: clamp01(r.qrm, 0),
    qrmOffset: clampN(r.qrmOffset, -800, 800, QUIET.qrmOffset),
    chirp: clampN(r.chirp, 0, 150, 0),
    clicks: r.clicks === true,
    hum: clamp01(r.hum, 0),
    drift: clampN(r.drift, -120, 120, 0),
    flutter: clamp01(r.flutter, 0),
    echo: clamp01(r.echo, 0),
  };
}

export function sanitizeReceiver(raw: unknown): Receiver {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f = typeof r.filter === 'number' && (FILTERS as readonly number[]).includes(r.filter) ? r.filter : WIDE_OPEN.filter;
  return { filter: f, rit: Math.round(clampN(r.rit, -500, 500, 0)), agc: r.agc !== false };
}

function noiseBuffer(ac: BaseAudioContext, pink: boolean, seconds = 3): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 424242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  // Paul Kellet's economical pink filter.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd();
    if (!pink) {
      d[i] = w * 0.5;
      continue;
    }
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/**
 * A simulated band and receiver. Connect the station's Player to `signalIn`.
 * Noise, crashes and a second station are mixed in, the whole lot goes through
 * your receiver's filter (so a narrow filter really does lift the signal out of
 * the noise and lose the neighbour), then AGC, then your volume.
 */
export class BandRig {
  readonly ac: AudioContext;
  readonly signalIn: GainNode;
  private shape: GainNode;
  private sum: GainNode;
  private filters: BiquadFilterNode[];
  private agc: DynamicsCompressorNode;
  private agcBypass: GainNode;
  private out: GainNode;
  private noise: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;
  private qrnGain: GainNode;
  private humGain: GainNode;
  private hum: OscillatorNode[] = [];
  private echoDelay: DelayNode;
  private echoGain: GainNode;
  private lfos: { osc: OscillatorNode; gain: GainNode }[] = [];
  private flutterSrc: AudioBufferSourceNode | null = null;
  private flutterGain: GainNode;
  private qrnTimer = 0;
  private qrmPlayer: Player | null = null;
  private qrmIn: GainNode;
  private stopped = false;
  private c: Conditions = QUIET;
  private rx: Receiver = WIDE_OPEN;

  constructor(
    private centre: number,
    private rng: Rng,
  ) {
    const ac = (this.ac = getAudio());
    this.signalIn = ac.createGain();
    this.shape = ac.createGain();
    this.sum = ac.createGain();
    this.noiseGain = ac.createGain();
    this.qrnGain = ac.createGain();
    this.humGain = ac.createGain();
    this.qrmIn = ac.createGain();
    this.echoDelay = ac.createDelay(0.2);
    this.echoGain = ac.createGain();
    this.flutterGain = ac.createGain();
    this.filters = [ac.createBiquadFilter(), ac.createBiquadFilter()];
    this.agc = ac.createDynamicsCompressor();
    this.agcBypass = ac.createGain();
    this.out = ac.createGain();

    // signal → shape (QSB / flutter) → sum, plus a delayed echo
    this.signalIn.connect(this.shape).connect(this.sum);
    this.shape.connect(this.echoDelay).connect(this.echoGain).connect(this.sum);
    this.echoDelay.delayTime.value = 0.018;
    this.noiseGain.connect(this.sum);
    this.qrnGain.connect(this.sum);
    this.humGain.connect(this.sum);
    this.qrmIn.connect(this.sum);

    // receiver: two cascaded band-pass sections for steeper skirts
    this.sum.connect(this.filters[0]).connect(this.filters[1]);
    this.agc.threshold.value = -32;
    this.agc.knee.value = 6;
    this.agc.ratio.value = 12;
    this.agc.attack.value = 0.004;
    this.agc.release.value = 0.3;
    this.agc.connect(this.out);
    this.agcBypass.connect(this.out);
    this.out.connect(ac.destination);
  }

  /** Apply conditions and receiver settings (safe to call while running). */
  set(c: Conditions, rx: Receiver, volume: number) {
    const t = this.ac.currentTime;
    const prev = this.c;
    this.c = c;
    this.rx = rx;
    this.noiseGain.gain.setTargetAtTime(c.noise * 0.35, t, 0.05);
    this.qrnGain.gain.setTargetAtTime(1, t, 0.05);
    this.humGain.gain.setTargetAtTime(c.hum * 0.05, t, 0.05);
    this.echoGain.gain.setTargetAtTime(c.echo * 0.55, t, 0.05);
    this.qrmIn.gain.setTargetAtTime(c.qrm * 0.9, t, 0.05);

    // Filter: wide open is effectively bypassed; otherwise Q = centre / bandwidth.
    for (const f of this.filters) {
      if (rx.filter >= 2400) {
        f.type = 'lowpass';
        f.frequency.setTargetAtTime(3000, t, 0.02);
        f.Q.setTargetAtTime(0.5, t, 0.02);
      } else {
        f.type = 'bandpass';
        f.frequency.setTargetAtTime(this.centre, t, 0.02);
        f.Q.setTargetAtTime(Math.max(0.5, this.centre / rx.filter), t, 0.02);
      }
    }
    // Narrow filters lose level; make some of it back so volume stays usable.
    const makeup = rx.filter >= 2400 ? 1 : Math.min(4, Math.sqrt(2400 / rx.filter) * 0.9);
    this.out.gain.setTargetAtTime(volume * makeup, t, 0.05);

    this.filters[1].disconnect();
    this.filters[1].connect(rx.agc ? this.agc : this.agcBypass);

    if (prev.pink !== c.pink && this.noise) this.startNoise();
    this.setFades();
    // The neighbour moves with your tuning too, and appears if switched on mid-session.
    this.qrmPlayer?.setParams({ pitch: this.stationPitch(c.qrmOffset) });
    if (this.running && c.qrm > 0) this.startQrm();
  }

  private running = false;

  /** The station's tone pitch, after its offset and your RIT. */
  stationPitch(offset = 0) {
    return this.centre + offset - this.rx.rit;
  }

  start() {
    this.running = true;
    this.startNoise();
    // Hum: 50 Hz mains and its third harmonic.
    for (const [f, g] of [
      [50, 1],
      [150, 0.4],
    ]) {
      const o = this.ac.createOscillator();
      const og = this.ac.createGain();
      o.frequency.value = f;
      og.gain.value = g;
      o.connect(og).connect(this.humGain);
      o.start();
      this.hum.push(o);
    }
    // Flutter: low-passed noise modulating the signal level.
    const fl = this.ac.createBufferSource();
    fl.buffer = noiseBuffer(this.ac, false, 4);
    fl.loop = true;
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 18;
    fl.connect(lp).connect(this.flutterGain).connect(this.shape.gain);
    fl.start();
    this.flutterSrc = fl;
    this.setFades();
    // Static crashes, at random.
    this.qrnTimer = window.setInterval(() => {
      if (this.rng() < this.c.qrn * 0.12) this.crash();
    }, 100);
    if (this.c.qrm > 0) this.startQrm();
  }

  private startNoise() {
    this.noise?.stop();
    const n = this.ac.createBufferSource();
    n.buffer = noiseBuffer(this.ac, this.c.pink);
    n.loop = true;
    n.connect(this.noiseGain);
    n.start();
    this.noise = n;
  }

  /** QSB as two slow, incommensurate swells; flutter depth. */
  private setFades() {
    const t = this.ac.currentTime;
    for (const l of this.lfos) {
      l.osc.stop();
      l.gain.disconnect();
    }
    this.lfos = [];
    const depth = this.c.qsb;
    this.shape.gain.setTargetAtTime(1 - depth * 0.5, t, 0.05);
    if (depth > 0 && !this.stopped) {
      for (const [mul, share] of [
        [1, 0.6],
        [1.618, 0.4],
      ]) {
        const osc = this.ac.createOscillator();
        const gain = this.ac.createGain();
        osc.frequency.value = this.c.qsbRate * mul;
        gain.gain.value = depth * 0.5 * share;
        osc.connect(gain).connect(this.shape.gain);
        osc.start();
        this.lfos.push({ osc, gain });
      }
    }
    this.flutterGain.gain.setTargetAtTime(this.c.flutter * 6, t, 0.05);
  }

  private crash() {
    const ac = this.ac;
    const dur = 0.05 + this.rng() * 0.35;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, false, 0.5);
    const g = ac.createGain();
    const t = ac.currentTime + 0.01;
    const peak = 0.4 + this.rng() * 0.8;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g).connect(this.qrnGain);
    src.start(t, this.rng() * 2);
    src.stop(t + dur + 0.05);
  }

  /** A neighbouring station calling CQ and chatting, over and over. */
  private startQrm() {
    if (this.qrmPlayer) return;
    const p = new Player({
      voice: 'sine',
      pitch: this.stationPitch(this.c.qrmOffset),
      volume: 0.35,
      muted: false,
      destination: this.qrmIn,
    });
    this.qrmPlayer = p;
    const lines = ['CQ CQ CQ DE DL5XYZ DL5XYZ K', 'UR RST 579 579 = NAME HANS HANS = QTH BONN BONN', 'TNX FER QSO 73 GL', 'QRZ? DE OK1AB K'];
    const go = () => {
      if (this.stopped || !this.qrmPlayer) return;
      const text = lines[Math.floor(this.rng() * lines.length)];
      const sch = humanSchedule(encodeText(text).words, { wpm: 18 + Math.floor(this.rng() * 10), ...FIST_PRESETS.steady.params }, this.rng);
      p.onEnd = () => window.setTimeout(go, 400 + this.rng() * 1500);
      p.load(sch);
      p.play(0);
    };
    go();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    window.clearInterval(this.qrnTimer);
    this.qrmPlayer?.stop();
    this.qrmPlayer = null;
    const t = this.ac.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.02);
    window.setTimeout(() => {
      this.noise?.stop();
      this.hum.forEach((h) => h.stop());
      this.flutterSrc?.stop();
      this.lfos.forEach((l) => l.osc.stop());
      this.out.disconnect();
    }, 120);
  }
}
