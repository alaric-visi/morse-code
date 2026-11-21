import table from '../../content/callsigns/prefixes.json';
import type { Rng } from './random';

export interface Country {
  country: string;
  prefixes: string[];
  suffix: number[];
  /** The prefix already ends in its digit (HB9). */
  noDigit?: boolean;
  cities: string[];
}

export const COUNTRIES: readonly Country[] = table.countries;

export interface Callsign {
  call: string;
  country: string;
  city: string;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pick = <T,>(xs: readonly T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];

/**
 * A realistic callsign: a real prefix for the country, a call-area digit, and
 * a 1–3 letter suffix. Sometimes portable (/P) or mobile (/M).
 */
export function makeCallsign(rng: Rng, opts: { country?: string; portable?: boolean } = {}): Callsign {
  const c = (opts.country && COUNTRIES.find((x) => x.country === opts.country)) || pick(COUNTRIES, rng);
  const prefix = pick(c.prefixes, rng);
  const digit = c.noDigit ? '' : String(Math.floor(rng() * 10));
  const len = pick(c.suffix, rng);
  const suffix = Array.from({ length: len }, () => LETTERS[Math.floor(rng() * 26)]).join('');
  let call = prefix + digit + suffix;
  if (opts.portable ?? rng() < 0.08) call += rng() < 0.5 ? '/P' : '/M';
  return { call, country: c.country, city: pick(c.cities, rng) };
}

/** Does `call` look like a callsign from our table? (prefix + digit + 1–3 letters, optional /P or /M) */
export function looksLikeCallsign(call: string): boolean {
  const base = call.replace(/\/(P|M)$/, '');
  return COUNTRIES.some((c) =>
    c.prefixes.some((p) => {
      if (!base.startsWith(p)) return false;
      const rest = base.slice(p.length);
      return c.noDigit ? /^[A-Z]{1,3}$/.test(rest) : /^[0-9][A-Z]{1,3}$/.test(rest);
    }),
  );
}
