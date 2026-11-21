import { encodeText } from '../core/codec';
import { FIST_PRESETS, humanSchedule, type FistPreset } from '../core/fist-model';
import type { BandRig } from './band';
import { Player } from './player';
import type { Rng } from '../learn/random';

/** A station that can be heard: where it is relative to you, how strong, how it sends. */
export interface ChorusVoice {
  id: number;
  /** Hz from your transmit frequency. */
  offset: number;
  /** 0–1 */
  strength: number;
  wpm: number;
  fist: FistPreset;
}

/** Further from your listening frequency than this and you can't hear it. */
const AUDIBLE_HZ = 2600;

/**
 * Many stations at once through one band rig: a pileup, a contest band, or a
 * net. Each sends with its own fist, speed, strength and pitch, and every pitch
 * moves when you retune (RX offset), just as on a real receiver.
 */
export class Chorus {
  private players = new Map<number, { p: Player; v: ChorusVoice }>();
  private loops = new Map<number, boolean>();
  /** Where you're listening, Hz relative to your transmit frequency (for split). */
  rx = 0;

  constructor(
    private rig: BandRig,
    private rng: Rng,
  ) {}

  private pitchOf(v: ChorusVoice) {
    return this.rig.stationPitch(v.offset - this.rx);
  }

  private audible(v: ChorusVoice) {
    return Math.abs(v.offset - this.rx) <= AUDIBLE_HZ;
  }

  /** One transmission from a station. Resolves when it's finished. */
  say(v: ChorusVoice, text: string, delay = 0): Promise<void> {
    this.silence(v.id);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const p = new Player({
          voice: 'sine',
          pitch: this.pitchOf(v),
          volume: this.audible(v) ? 0.08 + v.strength * 0.42 : 0,
          muted: false,
          destination: this.rig.signalIn,
        });
        this.players.set(v.id, { p, v });
        p.onEnd = () => {
          if (this.players.get(v.id)?.p === p) this.players.delete(v.id);
          resolve();
        };
        const sch = humanSchedule(encodeText(text).words, { wpm: v.wpm, ...FIST_PRESETS[v.fist].params }, this.rng);
        if (!sch.events.length) return resolve();
        p.load(sch);
        p.play(0);
      }, delay);
    });
  }

  /** Keep a station sending `lines` in turn, with pauses, until stopped. */
  loop(v: ChorusVoice, lines: string[], pause = [0.8, 2.5]) {
    if (this.loops.get(v.id)) return;
    this.loops.set(v.id, true);
    let i = Math.floor(this.rng() * lines.length);
    const go = async () => {
      while (this.loops.get(v.id)) {
        await this.say(v, lines[i++ % lines.length]);
        await new Promise((r) => window.setTimeout(r, (pause[0] + this.rng() * (pause[1] - pause[0])) * 1000));
      }
    };
    void go();
  }

  stopLoop(id: number) {
    this.loops.delete(id);
    this.silence(id);
  }

  silence(id: number) {
    const cur = this.players.get(id);
    if (cur) {
      cur.p.stop();
      this.players.delete(id);
    }
  }

  /** Move your receiver (split listening, or tuning across a band). */
  retune(rx: number) {
    this.rx = rx;
    for (const { p, v } of this.players.values()) p.setParams({ pitch: this.pitchOf(v), volume: this.audible(v) ? 0.08 + v.strength * 0.42 : 0 });
  }

  /** Move one station (e.g. as you tune past it). */
  move(id: number, offset: number) {
    const cur = this.players.get(id);
    if (!cur) return;
    cur.v.offset = offset;
    cur.p.setParams({ pitch: this.pitchOf(cur.v), volume: this.audible(cur.v) ? 0.08 + cur.v.strength * 0.42 : 0 });
  }

  get busy() {
    return this.players.size > 0;
  }

  stopAll() {
    this.loops.clear();
    for (const { p } of this.players.values()) p.stop();
    this.players.clear();
  }
}
