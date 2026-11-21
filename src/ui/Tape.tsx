import { eventIndexAt } from '../core/schedule';
import { useCanvas } from './canvas';
import type { PlaybackView } from './playback';

const TOKENS = ['tape', 'tape-edge', 'tape-ink', 'tape-preview', 'tape-pen', 'tape-text', 'tape-text-dim', 'font-mono'] as const;
/** Fixed pixels per dit, so the tape looks the same at any speed and moves faster when you speed up. */
const PX_PER_UNIT = 7;
const PAD = 24;

/**
 * Paper tape, drawn the way an undulator recorder inked it: a line that lifts while
 * the key is down. It scrolls past a fixed pen; what's been sent is inked, what's
 * coming is a faint preview, and each letter is printed underneath.
 */
export function Tape({ view, emptyText }: { view: PlaybackView; /** Shown when there's nothing on the tape yet. */ emptyText?: string }) {
  const ref = useCanvas(
    TOKENS,
    ({ ctx, w, h, colors: c }) => {
      const sch = view.schedule.value;
      const letters = view.letters.value;
      const unit = view.timing.value.unit;
      const pxPerSec = PX_PER_UNIT / unit;
      const active = view.active.value;
      const p = active ? view.pos.value : 0;
      const penX = active ? Math.round(w * 0.68) : PAD;
      const x = (t: number) => penX + (t - p) * pxPerSec;

      // Paper with a darker edge, top and bottom.
      ctx.fillStyle = c.tape;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = c['tape-edge'];
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h - 2, w, 2);

      if (!sch.events.length && emptyText) {
        ctx.fillStyle = c['tape-text-dim'];
        ctx.font = `500 13px ${c['font-mono']}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emptyText, w / 2, h / 2);
        return;
      }

      const base = Math.round(h * 0.46);
      const lift = Math.max(8, Math.round(h * 0.2));
      const tLeft = p - penX / pxPerSec;
      const tRight = p + (w - penX) / pxPerSec;

      // The trace: preview first (whole visible span), then ink over what's been sent.
      const trace = (from: number, to: number, color: string, width: number) => {
        if (to <= from) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x(from), base);
        let y = base;
        for (let i = eventIndexAt(sch.events, from); i < sch.events.length; i++) {
          const e = sch.events[i];
          if (e.t0 >= to) break;
          const a = Math.max(e.t0, from);
          const b = Math.min(e.t1, to);
          ctx.lineTo(x(a), base);
          ctx.lineTo(x(a), base - lift);
          ctx.lineTo(x(b), base - lift);
          y = base - lift;
          if (b < to) {
            ctx.lineTo(x(b), base);
            y = base;
          }
        }
        ctx.lineTo(x(to), y);
        ctx.stroke();
      };
      trace(Math.max(0, tLeft), Math.min(sch.total, tRight), c['tape-preview'], 2);
      if (active) trace(Math.max(0, tLeft), Math.min(p, sch.total), c['tape-ink'], 2.25);

      // Letters printed under the trace.
      ctx.font = `600 12px ${c['font-mono']}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let n = 0; n < letters.length; n++) {
        const a = sch.letterStart[n];
        const b = sch.letterEnd[n];
        if (b < tLeft || a > tRight || !letters[n].known) continue;
        ctx.fillStyle = active && a < p ? c['tape-text'] : c['tape-text-dim'];
        ctx.fillText(letters[n].ch, x((a + b) / 2), base + 8);
      }

      // The pen.
      if (active) {
        ctx.fillStyle = c['tape-pen'];
        ctx.beginPath();
        ctx.moveTo(penX - 5, 0);
        ctx.lineTo(penX + 5, 0);
        ctx.lineTo(penX, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(penX - 0.5, 7, 1, h - 9);
      }
    },
    () => view.active.peek(),
    [view.schedule.value, view.letters.value],
  );
  return (
    <div class="mc-tape">
      <canvas ref={ref} role="img" aria-label="Paper tape recording of the message" />
    </div>
  );
}
