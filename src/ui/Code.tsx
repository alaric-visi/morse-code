/**
 * A Morse code drawn as pills at their true proportions: a dit is one unit long,
 * a dah three, with one unit between them. The text form is kept for screen
 * readers and copy/paste.
 */
export function Code({ morse, class: cls }: { morse: string; class?: string }) {
  let x = 0;
  const pills = Array.from(morse, (m, i) => {
    const w = m === '.' ? 1 : 3;
    const el = <rect key={i} class="mc-pill" x={x} y={0} width={w} height={1} rx={0.5} />;
    x += w + 1;
    return el;
  });
  const units = Math.max(x - 1, 1);
  return (
    <span class={'mc-code' + (cls ? ' ' + cls : '')}>
      <svg viewBox={`0 0 ${units} 1`} style={{ width: `${units * 0.36}em`, '--mc-units': units }} aria-hidden="true">
        {pills}
      </svg>
      <span class="mc-sr">{morse}</span>
    </span>
  );
}
