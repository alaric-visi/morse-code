/**
 * Cut numbers: contest shorthand that replaces long digits with short letters.
 * T = 0 and N = 9 are universal; A = 1 and E = 5 are common too.
 */
const CUT: Record<string, string> = { '0': 'T', '9': 'N', '1': 'A', '5': 'E' };
const UNCUT: Record<string, string> = { T: '0', O: '0', N: '9', A: '1', E: '5' };

/** "599" → "5NN"; with `heavy`, "015" → "TAE". */
export function cut(s: string, heavy = false): string {
  return [...s].map((d) => (d === '0' || d === '9' || (heavy && (d === '1' || d === '5')) ? CUT[d] : d)).join('');
}

/** Read a number that may contain cut digits: "5NN" → "599", "1T" → "10". */
export function uncut(s: string): string {
  return [...s.toUpperCase()].map((c) => UNCUT[c] ?? c).join('');
}
