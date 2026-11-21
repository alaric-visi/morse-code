import { MAX_WPM, MIN_WPM, SPACINGS, type Spacing } from '../core/timing';
import type { Mode } from '../core/codec';
import { isVoice, type VoiceKind } from '../audio/voices';

export interface TranslateSettings {
  /** Character speed. */
  charWpm: number;
  /** Overall speed when spacing is stretched. */
  effWpm: number;
  spacing: Spacing;
  voice: VoiceKind;
  /** Hz */
  pitch: number;
  /** 0–1 */
  volume: number;
  sound: boolean;
  /** The small indicator lamp. */
  lamp: boolean;
  /** Flash the whole output area too (large flashing area — off by default). */
  flashArea: boolean;
  /** Accented and non-English letters. */
  extended: boolean;
  /** Announce each letter to screen readers as it plays. */
  announce: boolean;
  loop: boolean;
  /** Soft ticks on buttons. */
  uiSounds: boolean;
}

export const DEFAULTS: Readonly<TranslateSettings> = {
  charWpm: 15,
  effWpm: 10,
  spacing: 'standard',
  voice: 'sine',
  pitch: 600,
  volume: 0.6,
  sound: true,
  lamp: true,
  flashArea: false,
  extended: false,
  announce: false,
  loop: false,
  uiSounds: false,
};

export const PITCH_MIN = 300;
export const PITCH_MAX = 1200;

const num = (v: unknown, min: number, max: number, fallback: number, step = 1) => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, +(Math.round(n / step) * step).toFixed(6)));
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Accept anything (old storage, a hand-edited link) and return valid settings. */
export function sanitize(raw: unknown): TranslateSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const charWpm = num(r.charWpm, MIN_WPM, MAX_WPM, DEFAULTS.charWpm);
  return {
    charWpm,
    effWpm: num(r.effWpm, MIN_WPM, charWpm, Math.min(DEFAULTS.effWpm, charWpm)),
    spacing: SPACINGS.includes(r.spacing as Spacing) ? (r.spacing as Spacing) : DEFAULTS.spacing,
    voice: isVoice(r.voice) ? r.voice : DEFAULTS.voice,
    pitch: num(r.pitch, PITCH_MIN, PITCH_MAX, DEFAULTS.pitch, 10),
    volume: num(r.volume, 0, 1, DEFAULTS.volume, 0.05),
    sound: bool(r.sound, DEFAULTS.sound),
    lamp: bool(r.lamp, DEFAULTS.lamp),
    flashArea: bool(r.flashArea, DEFAULTS.flashArea),
    extended: bool(r.extended, DEFAULTS.extended),
    announce: bool(r.announce, DEFAULTS.announce),
    loop: bool(r.loop, DEFAULTS.loop),
    uiSounds: bool(r.uiSounds, DEFAULTS.uiSounds),
  };
}

const STORAGE_KEY = 'mc:translate:v1';

/** Saved settings, or defaults. Storage can be missing or blocked; that's fine. */
export function loadSettings(): TranslateSettings {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return sanitize(s ? JSON.parse(s) : {});
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: TranslateSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage blocked */
  }
}

// ------------------------------------------------------------------ share links

/** What a share link carries: the message and how it sounds. */
export interface Shared {
  mode?: Mode;
  text?: string;
  settings?: Partial<TranslateSettings>;
}

/** `m=text&t=SOS&c=20&e=10&s=farnsworth&p=600&x=1` — short keys keep links tidy. */
export function encodeShare(mode: Mode, text: string, s: TranslateSettings): string {
  const q = new URLSearchParams();
  q.set('m', mode);
  q.set('t', text);
  q.set('c', String(s.charWpm));
  if (s.spacing !== 'standard') {
    q.set('s', s.spacing);
    q.set('e', String(s.effWpm));
  }
  q.set('p', String(s.pitch));
  if (s.voice !== 'sine') q.set('v', s.voice);
  if (s.extended) q.set('x', '1');
  return q.toString();
}

export function decodeShare(query: string): Shared {
  const q = new URLSearchParams(query);
  if (!q.has('t')) return {};
  const settings: Partial<TranslateSettings> = {};
  if (q.has('c')) settings.charWpm = Number(q.get('c'));
  if (q.has('e')) settings.effWpm = Number(q.get('e'));
  if (q.has('s')) settings.spacing = q.get('s') as Spacing;
  if (q.has('p')) settings.pitch = Number(q.get('p'));
  if (q.has('x')) settings.extended = q.get('x') === '1';
  if (q.has('v')) settings.voice = q.get('v') as VoiceKind;
  const m = q.get('m');
  return { mode: m === 'morse' ? 'morse' : 'text', text: q.get('t') ?? '', settings };
}
