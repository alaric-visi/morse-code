import type { InputMode } from '../../audio/keyer-node';
import { PITCH_MAX, PITCH_MIN } from '../../app/settings';

export type Drill = 'free' | 'char' | 'word' | 'echo';
export type Source = 'course' | 'all';

export interface SendSettings {
  input: InputMode;
  /** Keyer speed for paddles; the decoder's starting guess for a straight key. */
  wpm: number;
  /** Swap dit and dah paddles (for left-handers, or a paddle wired the other way). */
  swap: boolean;
  pitch: number;
  volume: number;
  drill: Drill;
  source: Source;
}

export const SEND_DEFAULTS: SendSettings = {
  input: 'straight',
  wpm: 15,
  swap: false,
  pitch: 650,
  volume: 0.5,
  drill: 'free',
  source: 'course',
};

const KEY = 'mc:send:v1';
const INPUTS: InputMode[] = ['straight', 'iambicA', 'iambicB', 'ultimatic', 'single', 'bug', 'cootie'];
const DRILLS: Drill[] = ['free', 'char', 'word', 'echo'];

const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

export function sanitizeSend(raw: unknown): SendSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    input: INPUTS.includes(r.input as InputMode) ? (r.input as InputMode) : SEND_DEFAULTS.input,
    wpm: Math.round(clamp(r.wpm, 5, 40, SEND_DEFAULTS.wpm)),
    swap: typeof r.swap === 'boolean' ? r.swap : SEND_DEFAULTS.swap,
    pitch: Math.round(clamp(r.pitch, PITCH_MIN, PITCH_MAX, SEND_DEFAULTS.pitch) / 10) * 10,
    volume: clamp(r.volume, 0, 1, SEND_DEFAULTS.volume),
    drill: DRILLS.includes(r.drill as Drill) ? (r.drill as Drill) : SEND_DEFAULTS.drill,
    source: r.source === 'all' ? 'all' : 'course',
  };
}

export function loadSend(): SendSettings {
  try {
    return sanitizeSend(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return { ...SEND_DEFAULTS };
  }
}

export function saveSend(s: SendSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}
