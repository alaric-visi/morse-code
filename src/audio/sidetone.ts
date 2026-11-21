import { getAudio } from './engine';
import { createVoice, type Voice, type VoiceKind } from './voices';

export interface SidetoneParams {
  voice: VoiceKind;
  pitch: number;
  volume: number;
}

/** Live tone for a hand key: sounds while held. One graph, reused between presses. */
export class Sidetone {
  private voice: Voice | null = null;
  private vol: GainNode | null = null;
  private kind: VoiceKind | null = null;

  constructor(private params: SidetoneParams) {}

  set(params: SidetoneParams) {
    this.params = params;
    if (this.voice && this.vol) {
      if (params.voice !== this.kind) this.dispose();
      else {
        const t = this.vol.context.currentTime;
        this.voice.setPitch(params.pitch, t);
        this.vol.gain.setTargetAtTime(params.volume, t, 0.01);
      }
    }
  }

  down() {
    const ac = getAudio();
    if (!this.voice) {
      this.voice = createVoice(ac, this.params.voice, this.params.pitch);
      this.vol = ac.createGain();
      this.vol.gain.value = this.params.volume;
      this.voice.output.connect(this.vol).connect(ac.destination);
      this.voice.start(ac.currentTime);
      this.kind = this.params.voice;
    }
    this.voice.down(ac.currentTime);
  }

  up() {
    if (this.voice && this.vol) this.voice.up(this.vol.context.currentTime);
  }

  dispose() {
    if (!this.voice || !this.vol) return;
    const t = this.vol.context.currentTime;
    this.voice.silence(t);
    try {
      this.voice.stop(t + 0.03);
    } catch {
      /* already stopped */
    }
    const vol = this.vol;
    setTimeout(() => vol.disconnect(), 80);
    this.voice = null;
    this.vol = null;
    this.kind = null;
  }
}
