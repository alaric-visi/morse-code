import type { Fist } from '../../core/decoder/fist';
import { MIN_FIST_MARKS } from '../../core/decoder/fist';
import { Help } from '../../ui/Linked';

interface Row {
  label: string;
  value: string;
  target: string;
  ok: boolean;
}

const f1 = (n: number) => n.toFixed(1);
const pctStr = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;

/** Plain-language advice for the biggest problem, if there is one. */
function advice(f: Fist): string {
  if (f.dahRatio > 3.5) return `Your dahs are long, about ${f1(f.dahRatio)} dits. Aim for 3: think "dah" as a clipped syllable.`;
  if (f.dahRatio < 2.5) return `Your dahs are short, only ${f1(f.dahRatio)} dits, so they can be heard as dits. Hold them a little longer.`;
  if (f.elementGap > 1.5) return 'There are long pauses inside your letters; keep each letter in one smooth movement.';
  if (f.elementGap < 0.6) return 'The gaps inside your letters are clipped; let each element finish before the next.';
  if (Math.abs(f.drift) > 0.15) return f.drift > 0 ? "You're speeding up as you go. Relax and keep a steady pace." : "You're slowing down as you go; that's often tiredness. Take short breaks.";
  if ((f.ditSpread + f.dahSpread) / 2 > 0.2) return 'Your timing varies a lot from element to element. Sending slowly and evenly builds the habit.';
  return 'Nicely even. Try nudging the speed up.';
}

/** The fist report: how your sending compares with textbook timing. */
export function FistReport({ fist, marks }: { fist: Fist | null; marks: number }) {
  if (!fist) {
    return (
      <Help class="mc-help">
        Send at least {MIN_FIST_MARKS} elements ({marks} so far) and a report on your timing appears here.
      </Help>
    );
  }
  const rows: Row[] = [
    { label: 'Speed', value: `${Math.round(fist.wpm)} WPM`, target: `${Math.round(fist.wpmStart)} → ${Math.round(fist.wpmEnd)}`, ok: Math.abs(fist.drift) <= 0.15 },
    { label: 'Dah length', value: `${f1(fist.dahRatio)} dits`, target: '3', ok: Math.abs(fist.dahRatio - 3) <= 0.5 },
    { label: 'Gap inside letters', value: `${f1(fist.elementGap)}`, target: '1', ok: Math.abs(fist.elementGap - 1) <= 0.4 },
    ...(fist.letterGap !== null ? [{ label: 'Gap between letters', value: f1(fist.letterGap), target: '3', ok: fist.letterGap >= 2.4 && fist.letterGap <= 5 }] : []),
    ...(fist.wordGap !== null ? [{ label: 'Gap between words', value: f1(fist.wordGap), target: '7', ok: fist.wordGap >= 5 }] : []),
    { label: 'Evenness', value: `±${Math.round(((fist.ditSpread + fist.dahSpread + fist.gapSpread) / 3) * 100)}%`, target: 'small', ok: (fist.ditSpread + fist.dahSpread + fist.gapSpread) / 3 <= 0.2 },
    { label: 'Speed drift', value: pctStr(fist.drift), target: '0%', ok: Math.abs(fist.drift) <= 0.15 },
  ];
  return (
    <div class="mc-fist">
      <div class="mc-fist-score">
        <span class="mc-display mc-num">{fist.score}</span>
        <span class="mc-help">out of 100 · from {fist.marks} elements</span>
      </div>
      <table class="mc-fist-table">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Yours</th>
            <th scope="col">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} data-ok={r.ok ? 'true' : 'false'}>
              <th scope="row">{r.label}</th>
              <td class="mc-num">
                <span aria-hidden="true">{r.ok ? '✓ ' : '! '}</span>
                {r.value}
                <span class="mc-sr">{r.ok ? ' (on target)' : ' (off target)'}</span>
              </td>
              <td class="mc-num">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="mc-fist-advice">{advice(fist)}</p>
    </div>
  );
}
