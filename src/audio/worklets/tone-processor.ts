import { goertzel } from '../../core/decoder/tone-detect';

/**
 * Off-air decoder worklet, as source text (loaded from a Blob URL like the keyer).
 * Measures the level at the chosen pitch every ~4 ms, and posts
 * { t, mag, rms } on the audio clock. The main thread keys and decodes.
 *
 * In: { type: 'pitch', hz }
 */
export function toneProcessorSource(): string {
  return `
const goertzel = ${goertzel.toString()};
class ToneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pitch = 700;
    this.block = Math.round(sampleRate * 0.004);
    this.buf = new Float32Array(this.block);
    this.fill = 0;
    this.origin = currentFrame;
    this.count = 0;
    this.port.onmessage = (ev) => { if (ev.data.type === 'pitch') this.pitch = ev.data.hz; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.fill++] = ch[i];
      if (this.fill === this.block) {
        let sq = 0;
        for (let j = 0; j < this.block; j++) sq += this.buf[j] * this.buf[j];
        const t = (this.origin + this.count * this.block) / sampleRate;
        this.port.postMessage({ t, mag: goertzel(this.buf, 0, this.block, this.pitch, sampleRate), rms: Math.sqrt(sq / this.block) });
        this.count++;
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor('mc-tone', ToneProcessor);
`;
}
