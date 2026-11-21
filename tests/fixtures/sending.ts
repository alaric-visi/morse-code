import { charToMorse } from '../../src/core/codec';
import { seeded } from '../../src/learn/random';

export interface SendOptions {
  wpm: number;
  /** Relative timing noise, e.g. 0.12 = ±12% (roughly normal). */
  jitter?: number;
  seed?: number;
  /** Dah length in units (3 = textbook). */
  dah?: number;
  /** Gap inside a letter, in units (1 = textbook). */
  elementGap?: number;
  letterGap?: number;
  wordGap?: number;
  /** Speed at the end of the text (linear change from `wpm`). */
  wpmEnd?: number;
}

/** Key-down marks for `text` as a person might send it. Times in seconds. */
export function send(text: string, o: SendOptions): [number, number][] {
  const rng = seeded(o.seed ?? 1);
  const noise = () => {
    // Sum of uniforms ≈ normal, scaled to the jitter.
    const n = (rng() + rng() + rng() - 1.5) / 1.5;
    return 1 + n * (o.jitter ?? 0);
  };
  const chars = text.toUpperCase().split('');
  const total = chars.length;
  const marks: [number, number][] = [];
  let t = 0;
  chars.forEach((c, i) => {
    const wpm = o.wpmEnd ? o.wpm + ((o.wpmEnd - o.wpm) * i) / total : o.wpm;
    const u = 1.2 / wpm;
    if (c === ' ') {
      t += ((o.wordGap ?? 7) - (o.letterGap ?? 3)) * u * noise();
      return;
    }
    const code = charToMorse[c];
    if (!code) throw new Error(`no code for ${c}`);
    for (let j = 0; j < code.length; j++) {
      const d = (code[j] === '-' ? (o.dah ?? 3) : 1) * u * noise();
      marks.push([t, t + d]);
      t += d;
      if (j < code.length - 1) t += (o.elementGap ?? 1) * u * noise();
    }
    t += (o.letterGap ?? 3) * u * noise();
  });
  return marks;
}

export const REFERENCE =
  'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 0123456789 CQ CQ CQ DE G4ABC G4ABC K ' +
  'GM OM TNX FER CALL UR RST 579 579 NAME IS JOHN QTH NR LEEDS HW CPY ' +
  'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS. HOW VEXINGLY QUICK DAFT ZEBRAS JUMP?';
