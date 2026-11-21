import { useCanvas } from './canvas';
import type { PlaybackView } from './playback';

const TOKENS = ['scope-bg', 'scope-grid', 'scope-trace'] as const;
const CYCLES = 6;
let buf: Float32Array<ArrayBuffer> | null = null;

/**
 * An oscilloscope on the output: a few cycles of the live waveform, triggered on a
 * rising zero crossing so it stands still. Flat when nothing is sounding.
 */
export function Scope({ view }: { view: PlaybackView }) {
  const ref = useCanvas(
    TOKENS,
    ({ ctx, w, h, colors: c }) => {
      ctx.fillStyle = c['scope-bg'];
      ctx.fillRect(0, 0, w, h);

      // Graticule.
      ctx.strokeStyle = c['scope-grid'];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) {
        const gx = Math.round((w * i) / 8) + 0.5;
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
      }
      for (let i = 1; i < 4; i++) {
        const gy = Math.round((h * i) / 4) + 0.5;
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
      }
      ctx.stroke();

      const mid = h / 2;
      const amp = h * 0.42;
      ctx.strokeStyle = c['scope-trace'];
      ctx.lineWidth = 2;
      ctx.shadowColor = c['scope-trace'];
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const an = view.active.value ? view.analyser() : null;
      if (!an) {
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
      } else {
        if (!buf || buf.length !== an.fftSize) buf = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(buf);
        const span = Math.min(buf.length / 2, Math.round((an.context.sampleRate / view.pitch.value) * CYCLES));
        let start = 0;
        for (let i = 1; i < buf.length - span; i++) {
          if (buf[i - 1] < 0 && buf[i] >= 0) {
            start = i;
            break;
          }
        }
        // Normalise so quiet volumes still read, but silence stays flat.
        let peak = 0;
        for (let i = start; i < start + span; i++) peak = Math.max(peak, Math.abs(buf[i]));
        const gain = peak > 0.02 ? 1 / Math.max(peak, 0.25) : 0;
        for (let i = 0; i <= span; i++) {
          const v = buf[start + i] * gain;
          const px = (i / span) * w;
          const py = mid - v * amp;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
    () => view.active.peek(),
  );
  return (
    <div class="mc-scope">
      <canvas ref={ref} role="img" aria-label="Oscilloscope trace of the tone" />
    </div>
  );
}
