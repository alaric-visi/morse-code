/**
 * "Morse Code" set in the display face, with the name spelled out in Morse
 * underneath as a row of pills: -- --- .-. ... .  -.-. --- -.. .
 */
const SPELLING = ['--', '---', '.-.', '...', '.', ' ', '-.-.', '---', '-..', '.'];

export function Wordmark() {
  let x = 0;
  const marks: preact.JSX.Element[] = [];
  for (const letter of SPELLING) {
    if (letter === ' ') {
      x += 4;
      continue;
    }
    for (const el of letter) {
      const w = el === '.' ? 1 : 3;
      marks.push(<rect key={marks.length} x={x} y={0} width={w} height={1} rx={0.5} />);
      x += w + 1;
    }
    x += 2;
  }
  return (
    <span class="mc-wordmark">
      <span class="mc-display mc-wordmark-text">Morse Code</span>
      <svg class="mc-wordmark-code" viewBox={`0 0 ${x - 3} 1`} preserveAspectRatio="none" aria-hidden="true">
        {marks}
      </svg>
    </span>
  );
}
