import { IambicKeyer } from '../../core/keyer';

/**
 * The keyer + sidetone AudioWorklet, as source text.
 *
 * Built at runtime from the (self-contained) IambicKeyer class plus a small
 * processor, then loaded from a Blob URL. That works the same in dev and in the
 * production build, needs no separate worklet file to deploy, and avoids the dev
 * server's worker wrapper, which uses `URL` (not available inside a worklet).
 *
 * In:  { type: 'config', mode: 'straight' | 'A' | 'B', wpm, pitch, volume }
 *      { type: 'paddles', dit, dah }
 *      { type: 'key', down }            straight key: tone only; timing is measured on the main thread
 * Out: { type: 'element', el, t0, t1 } iambic elements, audio-clock seconds
 *      { type: 'down' | 'up', t }       iambic key state, exact to the sample
 *      { type: 'now', t }               heartbeat: everything before t has been reported
 */
export function keyerProcessorSource(): string {
  return `
const IambicKeyer = ${IambicKeyer.toString()};
const EDGE = 0.004;
class KeyerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mode = 'straight';
    this.keyer = new IambicKeyer('A', Math.round((1.2 / 20) * sampleRate));
    this.origin = currentFrame;
    this.straightDown = false;
    this.wasDown = false;
    this.env = 0;
    this.phase = 0;
    this.freq = 600;
    this.volume = 0.3;
    this.rate = 1 / (EDGE * sampleRate);
    this.keyer.onElement = (e) =>
      this.port.postMessage({ type: 'element', el: e.el, t0: (this.origin + e.start) / sampleRate, t1: (this.origin + e.end) / sampleRate });
    this.port.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'config') {
        this.mode = m.mode;
        if (m.mode !== 'straight') this.keyer.mode = m.mode;
        this.keyer.unit = Math.max(1, Math.round((1.2 / m.wpm) * sampleRate));
        this.freq = m.pitch;
        this.volume = m.volume;
      } else if (m.type === 'paddles') {
        this.keyer.setPaddles(!!m.dit, !!m.dah);
      } else if (m.type === 'key') {
        this.straightDown = !!m.down;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    const step = (2 * Math.PI * this.freq) / sampleRate;
    for (let i = 0; i < n; i++) {
      const down = this.mode === 'straight' ? this.straightDown : this.keyer.step();
      if (this.mode !== 'straight' && down !== this.wasDown) {
        this.port.postMessage({ type: down ? 'down' : 'up', t: (this.origin + this.keyer.sample) / sampleRate });
        this.wasDown = down;
      }
      this.env = down ? Math.min(1, this.env + this.rate) : Math.max(0, this.env - this.rate);
      this.phase += step;
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
      const v = Math.sin(this.phase) * this.env * this.volume;
      for (let c = 0; c < out.length; c++) out[c][i] = v;
    }
    // After each block (~3 ms): report how far we've got, after any key messages.
    if (this.mode !== 'straight') {
      this.port.postMessage({ type: 'now', t: (this.origin + this.keyer.sample) / sampleRate });
    }
    return true;
  }
}
registerProcessor('mc-keyer', KeyerProcessor);
`;
}
