import { useMemo } from 'preact/hooks';
import { buildTree, pathTo } from '../core/tree';

const W = 640;
const ROW = 62;
const TOP = 26;

/**
 * The Morse tree as a diagram: dit goes left, dah goes right. While a letter
 * plays, its path lights up one element at a time.
 */
export function MorseTree({
  code = '',
  started = code.length,
  extended = false,
  depth = 4,
  onPick,
  compact = false,
}: {
  /** Code of the letter to trace (empty for none). */
  code?: string;
  /** How many of its elements to light so far. */
  started?: number;
  extended?: boolean;
  depth?: number;
  /** Make nodes buttons that report their character. */
  onPick?(ch: string, code: string): void;
  compact?: boolean;
}) {
  const nodes = useMemo(() => buildTree(depth, extended), [depth, extended]);
  const lit = new Set(pathTo(code, started));
  const beyond = code.length > depth && started > depth;
  const H = TOP + depth * ROW + 24;
  const pos = (d: number, i: number) => ({ x: ((i + 0.5) / 2 ** d) * W, y: TOP + d * ROW });

  return (
    <figure class={'mc-tree' + (compact ? ' compact' : '')}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={code ? `Morse tree, tracing ${code}` : 'Morse tree: dit goes left, dah goes right'}>
        <g class="mc-tree-edges">
          {nodes.slice(1).map((n) => {
            const parent = pos(n.depth - 1, n.index >> 1);
            const p = pos(n.depth, n.index);
            const isDah = n.code.endsWith('-');
            return (
              <path
                key={`e${n.code}`}
                class={`mc-tree-edge${isDah ? ' dah' : ' dit'}${lit.has(n.code) ? ' lit' : ''}`}
                d={`M${parent.x} ${parent.y} C ${parent.x} ${(parent.y + p.y) / 2}, ${p.x} ${(parent.y + p.y) / 2}, ${p.x} ${p.y}`}
              />
            );
          })}
        </g>
        <g class="mc-tree-nodes">
          <circle class="mc-tree-root" cx={W / 2} cy={TOP} r={7} />
          {nodes.slice(1).map((n) => {
            const p = pos(n.depth, n.index);
            const r = n.depth >= 4 ? 13 : 16;
            const cls = `mc-tree-node${n.ch ? '' : ' empty'}${n.extended ? ' ext' : ''}${lit.has(n.code) ? ' lit' : ''}${
              lit.has(n.code) && n.code === code.slice(0, started) ? ' head' : ''
            }`;
            const content = (
              <>
                <circle cx={p.x} cy={p.y} r={r} />
                {n.ch && (
                  <text x={p.x} y={p.y} dy="0.35em">
                    {n.ch}
                  </text>
                )}
              </>
            );
            return onPick && n.ch ? (
              <g
                key={n.code}
                class={cls + ' pickable'}
                role="button"
                tabindex={0}
                aria-label={`${n.ch}, ${n.code.replace(/\./g, 'dit ').replace(/-/g, 'dah ').trim()}`}
                onClick={() => onPick(n.ch, n.code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(n.ch, n.code);
                  }
                }}
              >
                {content}
              </g>
            ) : (
              <g key={n.code} class={cls}>
                {content}
              </g>
            );
          })}
        </g>
        <g class="mc-tree-legend" aria-hidden="true">
          <text x={W / 2 - 22} y={TOP + 4} text-anchor="end">· dit</text>
          <text x={W / 2 + 22} y={TOP + 4} text-anchor="start">dah –</text>
        </g>
      </svg>
      {beyond && <figcaption class="mc-help">{code} goes deeper than this tree shows.</figcaption>}
    </figure>
  );
}
