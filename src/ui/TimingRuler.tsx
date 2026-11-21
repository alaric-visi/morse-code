import type { Letter } from '../core/codec';
import type { Timing } from '../core/timing';

interface Block {
  kind: 'dit' | 'dah' | 'gap' | 'letter-gap' | 'word-gap';
  units: number;
}

const fmt = (u: number) => (Math.abs(u - Math.round(u)) < 0.05 ? String(Math.round(u)) : u.toFixed(1));

/**
 * One letter on a grid of dit-length units: marks, the one-unit gaps inside the
 * letter, then the gap that follows it. Farnsworth and Wordsworth show up as gaps
 * stretched past their standard 3 and 7 units.
 */
export function TimingRuler({
  letter,
  timing,
  endOfWord,
  started,
}: {
  letter: Letter | null;
  timing: Timing;
  endOfWord: boolean;
  /** Elements already started, for live highlighting. */
  started: number;
}) {
  if (!letter || !letter.morse) {
    return <p class="mc-help mc-ruler-empty">Play a message to see each letter on the unit grid.</p>;
  }
  const blocks: Block[] = [];
  Array.from(letter.morse).forEach((m, i) => {
    if (i) blocks.push({ kind: 'gap', units: 1 });
    blocks.push({ kind: m === '.' ? 'dit' : 'dah', units: m === '.' ? 1 : 3 });
  });
  const gap = endOfWord ? timing.wordGap : timing.letterGap;
  blocks.push({ kind: endOfWord ? 'word-gap' : 'letter-gap', units: gap / timing.unit });

  const total = blocks.reduce((s, b) => s + b.units, 0);
  const H = 30;
  let x = 0;
  let el = 0;
  return (
    <figure class="mc-ruler">
      <svg viewBox={`-0.5 -1 ${total + 1} ${H / 10 + 2.2}`} preserveAspectRatio="xMinYMid meet" role="img" aria-label={`Timing of ${letter.ch}`}>
        {/* unit grid */}
        {Array.from({ length: Math.ceil(total) + 1 }, (_, i) => (
          <line key={`g${i}`} class="mc-ruler-tick" x1={i} x2={i} y1={0} y2={H / 10} />
        ))}
        {blocks.map((b, i) => {
          const bx = x;
          x += b.units;
          const mark = b.kind === 'dit' || b.kind === 'dah';
          const lit = mark && el++ < started;
          return (
            <g key={i} class={`mc-ruler-${b.kind}${lit ? ' lit' : ''}`}>
              {mark ? (
                <rect x={bx + 0.08} y={0.6} width={b.units - 0.16} height={H / 10 - 1.2} rx={0.35} />
              ) : (
                <rect x={bx} y={H / 20 - 0.08} width={b.units} height={0.16} />
              )}
              <text x={bx + b.units / 2} y={H / 10 + 1.1}>
                {b.kind === 'gap' ? '' : fmt(b.units)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption class="mc-help">
        <strong>{letter.ch}</strong> — dit 1 · dah 3 · gap 1 · {endOfWord ? 'word' : 'letter'} gap {fmt(gap / timing.unit)} units
        {Math.abs(gap / timing.unit - (endOfWord ? 7 : 3)) > 0.05 ? ' (stretched)' : ''}
      </figcaption>
    </figure>
  );
}
