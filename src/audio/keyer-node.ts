import { getAudio } from './engine';
import { keyerProcessorSource } from './worklets/keyer-processor';
import type { IambicMode } from '../core/keyer';

export type InputMode = 'straight' | 'iambicA' | 'iambicB' | 'ultimatic' | 'single' | 'bug' | 'cootie';

/** What the worklet runs for each kind of key. */
export const KEYER_MODE: Record<InputMode, 'straight' | IambicMode> = {
  straight: 'straight',
  iambicA: 'A',
  iambicB: 'B',
  ultimatic: 'ultimatic',
  single: 'ultimatic',
  bug: 'bug',
  cootie: 'cootie',
};

export interface KeyerConfig {
  input: InputMode;
  wpm: number;
  pitch: number;
  /** 0–1 */
  volume: number;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Main-thread handle on the keyer worklet: sends paddle/key state, receives
 * element timing (on the audio clock) for the decoder.
 */
export class KeyerNode {
  onElement: ((el: '.' | '-', t0: number, t1: number) => void) | null = null;
  /** Iambic key down/up as it happens, with the exact audio-clock time. */
  onKeyState: ((down: boolean, t: number) => void) | null = null;

  /** Latest audio time the worklet has reported up to (all key messages before it have arrived). */
  private reported = 0;

  private constructor(
    readonly ac: AudioContext,
    private node: AudioWorkletNode,
  ) {
    node.port.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'element') this.onElement?.(m.el, m.t0, m.t1);
      else if (m.type === 'down' || m.type === 'up') this.onKeyState?.(m.type === 'down', m.t);
      else if (m.type === 'now') this.reported = m.t;
    };
  }

  /** Null when the browser can't run AudioWorklets. */
  static async create(): Promise<KeyerNode | null> {
    const ac = getAudio();
    if (!ac.audioWorklet) return null;
    try {
      if (!loaded.has(ac)) {
        const url = URL.createObjectURL(new Blob([keyerProcessorSource()], { type: 'text/javascript' }));
        loaded.set(ac, ac.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
      }
      await loaded.get(ac);
      const node = new AudioWorkletNode(ac, 'mc-keyer', { numberOfInputs: 0, outputChannelCount: [1] });
      node.connect(ac.destination);
      return new KeyerNode(ac, node);
    } catch {
      return null;
    }
  }

  configure(c: KeyerConfig) {
    const mode = KEYER_MODE[c.input];
    this.node.port.postMessage({ type: 'config', mode, wpm: c.wpm, pitch: c.pitch, volume: c.volume });
  }

  paddles(dit: boolean, dah: boolean) {
    this.node.port.postMessage({ type: 'paddles', dit, dah });
  }

  key(down: boolean) {
    this.node.port.postMessage({ type: 'key', down });
  }

  /**
   * "Now" for the decoder, on the keyer's clock: the latest time the worklet has
   * reported. Because messages arrive in order, no key-down before this time can
   * still be in flight — so silence measured up to here is real silence.
   */
  now() {
    return this.reported || this.ac.currentTime;
  }

  /** Estimated delay from pressing to hearing: one render quantum plus the device's reported latency. */
  latencyMs() {
    const ac = this.ac as AudioContext & { outputLatency?: number };
    return Math.round((128 / ac.sampleRate + (ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000);
  }

  dispose() {
    this.node.port.onmessage = null;
    this.node.disconnect();
  }
}
