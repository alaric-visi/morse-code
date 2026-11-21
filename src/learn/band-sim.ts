import type { FistPreset } from '../core/fist-model';
import { makeCallsign } from './callsigns';
import type { Rng } from './random';
import { continentOf } from './zones';

/** CW segments of the HF bands (IARU Region 1 band plan, kHz). */
export interface Band {
  id: string;
  lo: number;
  hi: number;
  mhz: number;
}

export const BANDS: readonly Band[] = [
  { id: '160m', lo: 1810, hi: 1838, mhz: 1.8 },
  { id: '80m', lo: 3500, hi: 3570, mhz: 3.5 },
  { id: '40m', lo: 7000, hi: 7040, mhz: 7 },
  { id: '30m', lo: 10100, hi: 10130, mhz: 10.1 },
  { id: '20m', lo: 14000, hi: 14070, mhz: 14 },
  { id: '17m', lo: 18068, hi: 18095, mhz: 18.1 },
  { id: '15m', lo: 21000, hi: 21070, mhz: 21 },
  { id: '12m', lo: 24890, hi: 24915, mhz: 24.9 },
  { id: '10m', lo: 28000, hi: 28070, mhz: 28 },
];
export const bandById = (id: string) => BANDS.find((b) => b.id === id) ?? BANDS[2];

export interface Propagation {
  /** Solar flux index, 65 (sunspot minimum) to 250 (very high). */
  sfi: number;
  /** Planetary K-index, 0 (quiet) to 9 (severe storm). */
  k: number;
  /** UTC hour, 0–23 (fractions allowed). */
  hour: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));

/** 0 at night, 1 at midday (as seen from western Europe), with a soft dawn and dusk. */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h > 20) return 0;
  if (h < 8) return smooth((h - 5) / 3);
  if (h > 17) return smooth((20 - h) / 3);
  return 1;
}

/** Near dawn or dusk: the grey line, when low bands open to far places. */
export const greyLine = (hour: number) => {
  const d = daylight(hour);
  return d > 0.05 && d < 0.95 ? 1 : 0;
};

/**
 * How open a band is for a path, 0–1. A deliberately simple model that gets the
 * familiar patterns right:
 * - Higher bands need a higher maximum usable frequency, which comes with
 *   daylight and a high solar flux; at night they close.
 * - Low bands are absorbed by day (so 160 and 80 metres are night bands for DX),
 *   with a boost along the grey line.
 * - Short ("near", within Europe) paths need a lower MUF than long ones, so the
 *   high bands skip over nearby stations.
 * - Geomagnetic storms (high K) degrade everything, the high bands most.
 */
export function openness(band: Band, path: 'near' | 'dx', p: Propagation): number {
  const day = daylight(p.hour);
  const muf = (8 + (p.sfi - 65) * 0.14) * (0.5 + 0.5 * day) * (path === 'near' ? 0.45 : 1);
  const usable = smooth((muf - band.mhz) / (muf * 0.35 + 1) + 0.5);
  const absorption = band.mhz < 8 ? 1 - day * (band.mhz < 2.5 ? 0.92 : band.mhz < 5 ? 0.7 : 0.3) * (path === 'dx' ? 1 : 0.4) : 1;
  const grey = band.mhz < 8 && path === 'dx' && greyLine(p.hour) ? 1.3 : 1;
  const storm = clamp01(1 - (p.k / 9) * (0.6 + band.mhz / 60));
  return clamp01(usable * absorption * grey * storm);
}

export type Activity = 'weekday' | 'contest' | 'dx';
export const ACTIVITIES: Record<Activity, { label: string; about: string }> = {
  weekday: { label: 'Quiet weekday', about: 'A few people calling CQ, a couple of contacts in progress, maybe some DX.' },
  contest: { label: 'Contest weekend', about: 'Wall-to-wall stations sending CQ TEST. Fast and busy.' },
  dx: { label: 'DX expedition', about: 'A rare station working a big pileup, split, while the band carries on around it.' },
};

export interface BandStation {
  id: number;
  call: string;
  country: string;
  /** Frequency in kHz. */
  khz: number;
  wpm: number;
  fist: FistPreset;
  /** Received strength 0–1 (0.05 is barely there). */
  strength: number;
  role: 'cq' | 'qso' | 'contest' | 'dx' | 'caller';
  /** What they send, in order, then round again. */
  lines: string[];
}

const FISTS: FistPreset[] = ['steady', 'steady', 'heavy', 'rushed', 'bug', 'swing', 'drifting'];
const pick = <T,>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];

/** S-meter reading (S1–S9, then +10/+20 dB) for a strength 0–1. */
export function sUnits(strength: number): string {
  const s = Math.round(1 + strength * 10);
  return s <= 9 ? `S${s}` : `S9+${(s - 9) * 10}`;
}

/** Who's on the band right now. Stations only appear if the band is open on their path. */
export function populate(band: Band, prop: Propagation, activity: Activity, rng: Rng, myContinent = 'EU'): BandStation[] {
  const out: BandStation[] = [];
  let id = 1;
  const freqs: number[] = [];
  const freeKhz = () => {
    for (let t = 0; t < 40; t++) {
      const f = Math.round((band.lo + 2 + rng() * (band.hi - band.lo - 4)) * 100) / 100;
      if (!freqs.some((x) => Math.abs(x - f) < 0.7)) {
        freqs.push(f);
        return f;
      }
    }
    return band.lo + 1 + rng() * (band.hi - band.lo - 2);
  };
  const station = (role: BandStation['role'], khz: number, lines: (call: string) => string[]): BandStation | null => {
    const c = makeCallsign(rng);
    const path = continentOf(c.call) === myContinent ? 'near' : 'dx';
    const open = openness(band, path, prop);
    if (open < 0.08) return null;
    return {
      id: id++,
      call: c.call,
      country: c.country,
      khz,
      wpm: 16 + Math.floor(rng() * 14),
      fist: pick(FISTS, rng),
      strength: Math.min(1, open * (0.35 + rng() * 0.75)),
      role,
      lines: lines(c.call),
    };
  };

  const n = activity === 'contest' ? 22 : activity === 'dx' ? 8 : 9;
  // Some stations are on paths that are closed right now; keep trying until the band fills.
  for (let i = 0; i < n * 5 && out.length < n; i++) {
    const roll = rng();
    if (activity === 'contest') {
      const s = station('contest', freeKhz(), (c) => [`CQ TEST ${c} ${c}`, `CQ TEST ${c}`]);
      if (s) out.push(s);
    } else if (roll < 0.5) {
      const s = station('cq', freeKhz(), (c) => [`CQ CQ CQ DE ${c} ${c} ${c} K`]);
      if (s) out.push(s);
    } else {
      // A contact in progress: two stations taking turns on one frequency.
      const f = freeKhz();
      const a = station('qso', f, () => []);
      const b = station('qso', f + 0.02, () => []);
      if (a && b) {
        a.lines = [`${b.call} DE ${a.call} R FB OM = UR RST 579 = WX HR FINE = ${b.call} DE ${a.call} KN`];
        b.lines = [`${a.call} DE ${b.call} R TNX = RIG HR 100W ES DIPOLE = HW? ${a.call} DE ${b.call} KN`];
        out.push(a, b);
      }
    }
  }

  if (activity === 'dx' || (activity === 'weekday' && rng() < 0.4)) {
    const f = freeKhz();
    const dx = station('dx', f, (c) => [`${c} UP 2`, `TU UP 2 ${c}`]);
    if (dx) {
      dx.strength = Math.max(dx.strength, 0.3);
      out.push(dx);
      // Its pileup: callers 1–3 kHz up.
      for (let i = 0; i < (activity === 'dx' ? 7 : 3); i++) {
        const caller = station('caller', Math.round((f + 1 + rng() * 2) * 100) / 100, (c) => [`${c} ${c}`, c]);
        if (caller) out.push(caller);
      }
    }
  }
  return out.sort((a, b) => a.khz - b.khz);
}

/** The beat-note pitch you hear for a station at `khz` with the dial at `dial` (Hz). */
export const beatPitch = (centre: number, khz: number, dial: number) => centre + (khz - dial) * 1000;
