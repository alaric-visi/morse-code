import { COUNTRIES, type Country } from './callsigns';

/** Strip /P, /M, /MM, /QRP and similar suffixes. */
export const baseCall = (call: string) => call.toUpperCase().split('/')[0];

/** The country a callsign belongs to, by its longest matching prefix in our table. */
export function countryOf(call: string): (Country & { zone: number; continent: string }) | null {
  const base = baseCall(call);
  let best: (Country & { zone: number; continent: string }) | null = null;
  let bestLen = 0;
  for (const c of COUNTRIES as (Country & { zone: number; continent: string })[]) {
    for (const p of c.prefixes) {
      if (!base.startsWith(p) || p.length <= bestLen) continue;
      const rest = base.slice(p.length);
      if (c.noDigit ? /^[A-Z]{1,3}$/.test(rest) : /^[0-9][A-Z]{1,3}$/.test(rest)) {
        best = c;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * CQ zone. Countries that span several zones are refined by call-area digit,
 * which is the usual rule of thumb (simplified):
 *   USA 6/7 → 3, 0/5/8/9 → 4, 1–4 → 5. Canada VE7 → 3, VE3–6 → 4, VE1/2/9 → 5.
 *   Australia VK6/VK8 → 29, others 30.
 */
export function zoneOf(call: string): number | null {
  const c = countryOf(call);
  if (!c) return null;
  const digit = baseCall(call).match(/[0-9]/)?.[0];
  if (c.country === 'USA' && digit) return '67'.includes(digit) ? 3 : '0589'.includes(digit) ? 4 : 5;
  if (c.country === 'Canada' && digit) return digit === '7' ? 3 : '3456'.includes(digit) ? 4 : 5;
  if (c.country === 'Australia' && digit) return '68'.includes(digit) ? 29 : 30;
  return c.zone;
}

export const continentOf = (call: string) => countryOf(call)?.continent ?? null;

/** The WPX-style prefix: everything up to and including the last digit (G4ABC → G4, 2E0XYZ → 2E0). */
export function prefixOf(call: string): string {
  const base = baseCall(call);
  const m = base.match(/^(.*\d)/);
  return m ? m[1] : base;
}
