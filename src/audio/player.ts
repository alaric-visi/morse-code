import type { Schedule } from '../core/schedule';
import { getAudio } from './engine';
import { createVoice, type Voice, type VoiceKind, type VoiceOptions } from './voices';

/** Lead time so the first tone isn't clipped while the graph starts. */
const LEAD = 0.06;
/** How far ahead tones are put on the audio clock while the page is visible. */
const LOOKAHEAD = 1.5;
/** When hidden, timers are throttled hard, so schedule much further ahead. */
const LOOKAHEAD_HIDDEN = 90;
const PUMP_MS = 50;
/** Silence between one pass of a loop and the next, in seconds. */
const LOOP_GAP = 0.6;

export type PlayerState = 'idle' | 'playing' | 'paused';

export interface PlayerParams {
  voice: VoiceKind;
  /** Hz */
  pitch: number;
  /** 0–1 */
  volume: number;
  /** Silent playback still drives the lamp and highlighting. */
  muted: boolean;
  /** Transmitter quirks (chirp, key clicks). */
  voiceOptions?: VoiceOptions;
  /** Where to send the sound (a band simulation); defaults to the speakers. */
  destination?: AudioNode;
}

/** A stretch of the message to repeat, in schedule seconds. */
export interface LoopRange {
  from: number;
  to: number;
}

interface Segment {
  /** Context time at which… */
  audioT: number;
  /** …the timeline was at this position. */
  pos: number;
}

interface Graph {
  ac: AudioContext;
  voice: Voice;
  vol: GainNode;
  analyser: AnalyserNode;
}

/** First event index whose tone starts at or after `pos`. */
function firstFrom(s: Schedule, pos: number): number {
  let lo = 0;
  let hi = s.events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.events[mid].t0 < pos - 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Plays a schedule with a look-ahead scheduler: tones are put on the audio clock a
 * little at a time, so pause, seek, loop and live speed changes are all cheap and
 * a long message never floods one AudioParam with thousands of events.
 */
export class Player {
  state: PlayerState = 'idle';
  /** Called when playback reaches the end on its own (not on stop()). */
  onEnd: (() => void) | null = null;

  private schedule: Schedule = { events: [], total: 0, letterStart: [], letterEnd: [] };
  private loop: LoopRange | null = null;
  private graph: Graph | null = null;
  private segments: Segment[] = [];
  private cursor = 0;
  private timer = 0;
  private pausedAt = 0;

  constructor(private params: PlayerParams) {}

  get total() {
    return this.schedule.total;
  }

  /** The schedule currently loaded — always read timings from this, not a newer one. */
  get current(): Schedule {
    return this.schedule;
  }

  /** Current timeline position in seconds (negative during the lead-in). */
  position(): number {
    if (this.state !== 'playing' || !this.graph) return this.pausedAt;
    const now = this.graph.ac.currentTime;
    let seg = this.segments[0];
    for (const s of this.segments) if (s.audioT <= now) seg = s;
    const pos = seg.pos + (now - seg.audioT);
    // In the silence between loop passes, hold on the loop's last letter.
    return this.loop ? Math.min(pos, this.loop.to - 1e-6) : pos;
  }

  load(schedule: Schedule, loop: LoopRange | null = null) {
    this.schedule = schedule;
    this.loop = loop;
  }

  play(from = 0) {
    this.startAt(from);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.pausedAt = Math.max(0, this.position());
    this.silence();
    this.halt();
    this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.startAt(this.pausedAt);
  }

  /** Jump to `pos`. Keeps playing if playing; otherwise just moves the paused position. */
  seek(pos: number) {
    const p = Math.max(0, Math.min(pos, this.schedule.total));
    if (this.state === 'playing') {
      this.silence();
      this.startAt(p);
    } else {
      this.pausedAt = p;
    }
  }

  /** Swap in a re-timed schedule (speed changed) and carry on from `pos`. */
  replace(schedule: Schedule, pos: number, loop: LoopRange | null = this.loop) {
    this.load(schedule, loop);
    this.seek(pos);
  }

  setLoop(loop: LoopRange | null) {
    if (this.state === 'playing') {
      const pos = this.position();
      this.loop = loop;
      this.silence();
      this.startAt(pos);
    } else {
      this.loop = loop;
    }
  }

  setParams(next: Partial<PlayerParams>) {
    const voiceChanged =
      (next.voice !== undefined && next.voice !== this.params.voice) ||
      (next.voiceOptions !== undefined && JSON.stringify(next.voiceOptions) !== JSON.stringify(this.params.voiceOptions)) ||
      (next.destination !== undefined && next.destination !== this.params.destination);
    this.params = { ...this.params, ...next };
    const g = this.graph;
    if (!g) return;
    const t = g.ac.currentTime;
    if (voiceChanged) {
      // Swap the voice under the running timeline and re-queue from here.
      const pos = this.position();
      const playing = this.state === 'playing';
      this.silence();
      this.teardown();
      this.ensureGraph();
      if (playing) this.startAt(Math.max(0, pos));
      return;
    }
    g.voice.setPitch(this.params.pitch, t);
    g.vol.gain.setTargetAtTime(this.params.muted ? 0 : this.params.volume, t, 0.01);
  }

  /** Live signal for the scope, or null when nothing is playing. */
  get analyser(): AnalyserNode | null {
    return this.graph?.analyser ?? null;
  }

  stop() {
    if (this.state === 'idle') return;
    this.silence();
    this.halt();
    this.teardown();
    this.state = 'idle';
    this.pausedAt = 0;
  }

  // ------------------------------------------------------------------ internals

  private startAt(pos: number) {
    const g = this.ensureGraph();
    if (this.loop && (pos < this.loop.from || pos >= this.loop.to)) pos = this.loop.from;
    this.segments = [{ audioT: g.ac.currentTime + LEAD, pos }];
    this.cursor = firstFrom(this.schedule, pos);
    this.state = 'playing';
    this.pump();
    if (!this.timer) this.timer = window.setInterval(() => this.pump(), PUMP_MS);
  }

  private audioTimeOf(pos: number) {
    const seg = this.segments[this.segments.length - 1];
    return seg.audioT + (pos - seg.pos);
  }

  private pump() {
    const g = this.graph;
    if (this.state !== 'playing' || !g) return;
    const { events, total } = this.schedule;
    const now = g.ac.currentTime;
    const horizon = now + (document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
    const loop = this.loop;

    for (;;) {
      const e = events[this.cursor];
      if (loop && (!e || e.t0 >= loop.to - 1e-9)) {
        // Wrap: the next pass starts LOOP_GAP after the end of this one.
        const audioT = this.audioTimeOf(loop.to) + LOOP_GAP;
        if (audioT > horizon) break;
        this.segments.push({ audioT, pos: loop.from });
        // Drop segments that are fully in the past.
        while (this.segments.length > 2 && this.segments[1].audioT <= now) this.segments.shift();
        this.cursor = firstFrom(this.schedule, loop.from);
        if (this.schedule.letterStart.length === 0 || loop.to <= loop.from) break;
        continue;
      }
      if (!e) break;
      const a = this.audioTimeOf(e.t0);
      if (a > horizon) break;
      g.voice.key(a, this.audioTimeOf(e.t1));
      this.cursor++;
    }

    if (!loop && this.cursor >= events.length && now >= this.audioTimeOf(total) + 0.05) {
      this.halt();
      this.teardown();
      this.state = 'idle';
      this.pausedAt = 0;
      this.onEnd?.();
    }
  }

  private ensureGraph(): Graph {
    if (this.graph) return this.graph;
    const ac = getAudio();
    const voice = createVoice(ac, this.params.voice, this.params.pitch, this.params.voiceOptions);
    const vol = ac.createGain();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    vol.gain.value = this.params.muted ? 0 : this.params.volume;
    voice.output.connect(vol).connect(analyser).connect(this.params.destination ?? ac.destination);
    voice.start(ac.currentTime);
    this.graph = { ac, voice, vol, analyser };
    return this.graph;
  }

  /** Cancel everything queued and fade out in 5 ms. */
  private silence() {
    const g = this.graph;
    if (!g) return;
    g.voice.silence(g.ac.currentTime);
  }

  private halt() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private teardown() {
    const g = this.graph;
    if (!g) return;
    this.graph = null;
    const t = g.ac.currentTime;
    try {
      g.voice.stop(t + 0.03);
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => g.vol.disconnect(), 80);
  }
}
