import type { ElementCompare } from '../core/decoder/fist';

const pct = (c: ElementCompare) => Math.round(((c.actual - c.ideal) / c.ideal) * 100);
/** Drawn width of one dit-length unit, px. */
const PX_PER_UNIT = 48;
const ROW = 0.55;

/**
 * Your letter against the ideal, element by element, on a shared unit grid.
 * Top row: ideal. Bottom row: yours. Labels show how far each part was off.
 */
export function TimingCompare({ elements, label }: { elements: ElementCompare[]; label: string }) {
  if (!elements.length) return null;
  const idealTotal = elements.reduce((a, e) => a + e.ideal, 0);
  const actualTotal = elements.reduce((a, e) => a + e.actual, 0);
  const W = Math.max(idealTotal, actualTotal) + 0.4;
  const H = 2.3;
  const row = (y: number, key: 'ideal' | 'actual') => {
    let x = 0;
    return elements.map((e, i) => {
      const w = e[key];
      const bx = x;
      x += w;
      if (e.kind === 'gap') return null;
      return <rect key={`${key}${i}`} class={`mc-cmp-${key}`} x={bx + 0.05} y={y} width={Math.max(0.05, w - 0.1)} height={ROW} rx={ROW / 2} />;
    });
  };
  let lx = 0;
  const labels = elements.map((e, i) => {
    const cx = lx + e.actual / 2;
    lx += e.actual;
    const p = pct(e);
    const off = Math.abs(p) >= 25;
    if (e.kind === 'gap' && !off) return null;
    return (
      <text key={`l${i}`} x={cx} y={2.05} class={'mc-cmp-err' + (off ? ' off' : '')}>
        {`${p > 0 ? '+' : ''}${p}%`}
      </text>
    );
  });
  return (
    <figure class="mc-cmp">
      <svg viewBox={`-0.2 -0.1 ${W + 0.2} ${H}`} style={{ width: `${W * PX_PER_UNIT}px` }} role="img" aria-label={label}>
        {Array.from({ length: Math.ceil(W) + 1 }, (_, i) => (
          <line key={i} class="mc-cmp-tick" x1={i} x2={i} y1={-0.05} y2={1.5} />
        ))}
        {row(0, 'ideal')}
        {row(0.85, 'actual')}
        {labels}
      </svg>
      <figcaption class="mc-help">
        <span class="mc-cmp-key ideal" /> ideal · <span class="mc-cmp-key actual" /> yours · numbers show how far each part was off (gaps only when ±25% or more)
      </figcaption>
    </figure>
  );
}
