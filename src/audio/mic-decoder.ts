import { AdaptiveDecoder, type DecoderEvent } from '../core/decoder/decoder';
import { ToneKeyer } from '../core/decoder/tone-detect';
import { getAudio } from './engine';
import { toneProcessorSource } from './worklets/tone-processor';

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Register the processor once per context (registering twice throws). */
function loadProcessor(ac: AudioContext) {
  if (!loaded.has(ac)) {
    const url = URL.createObjectURL(new Blob([toneProcessorSource()], { type: 'text/javascript' }));
    loaded.set(ac, ac.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  return loaded.get(ac)!;
}

export interface MicDecoderEvents {
  onEvents(evs: DecoderEvent[]): void;
  onLevel(rms: number, signal: number, keyDown: boolean): void;
  onPitch(hz: number): void;
}

/**
 * Decode Morse from the microphone: point it at a receiver's speaker. Finds the
 * strongest tone (or uses the pitch you set), keys on its level, and runs the
 * adaptive decoder on the audio clock.
 */
export class MicDecoder {
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sink: GainNode | null = null;
  private timer = 0;
  private keyer = new ToneKeyer();
  readonly decoder: AdaptiveDecoder;
  auto = true;
  pitch = 700;

  constructor(
    private on: MicDecoderEvents,
    wpm = 18,
  ) {
    this.decoder = new AdaptiveDecoder(wpm);
  }

  /** Ask for the microphone and start. Must be called from a user gesture. */
  async start(): Promise<void> {
    const ac = getAudio();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    await loadProcessor(ac);
    this.source = ac.createMediaStreamSource(this.stream);
    // One (silent) output into the graph, so the browser always processes the node.
    this.node = new AudioWorkletNode(ac, 'mc-tone', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.sink = ac.createGain();
    this.sink.gain.value = 0;
    this.node.connect(this.sink).connect(ac.destination);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 4096;
    this.source.connect(this.node);
    this.source.connect(this.analyser);
    this.setPitch(this.pitch);
    this.node.port.onmessage = (ev) => {
      const { t, mag, rms } = ev.data as { t: number; mag: number; rms: number };
      const evs: DecoderEvent[] = [];
      for (const tr of this.keyer.push(t, mag)) evs.push(...(tr.down ? this.decoder.keyDown(tr.t) : this.decoder.keyUp(tr.t)));
      evs.push(...this.decoder.tick(t));
      if (evs.length) this.on.onEvents(evs);
      this.on.onLevel(rms, mag, this.keyer.down);
    };
    // Auto-tune: follow the strongest tone between 300 and 1200 Hz.
    const bins = new Float32Array(this.analyser.frequencyBinCount);
    this.timer = window.setInterval(() => {
      if (!this.auto || !this.analyser) return;
      this.analyser.getFloatFrequencyData(bins);
      const hzPerBin = ac.sampleRate / this.analyser.fftSize;
      let best = -Infinity;
      let at = this.pitch;
      for (let i = Math.floor(300 / hzPerBin); i <= Math.ceil(1200 / hzPerBin); i++) {
        if (bins[i] > best) {
          best = bins[i];
          at = i * hzPerBin;
        }
      }
      // Only move for a clear peak, and not for small wobbles.
      if (best > -70 && Math.abs(at - this.pitch) > 15) this.setPitch(Math.round(at));
    }, 400);
  }

  setPitch(hz: number) {
    this.pitch = hz;
    this.node?.port.postMessage({ type: 'pitch', hz });
    this.on.onPitch(hz);
  }

  stop() {
    window.clearInterval(this.timer);
    this.node?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.source = null;
    this.stream = null;
  }
}
