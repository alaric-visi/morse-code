import type { ReadonlySignal } from '@preact/signals';
import type { Letter } from '../core/codec';
import type { Schedule } from '../core/schedule';
import type { Timing } from '../core/timing';

/**
 * Everything the instruments need to follow playback, as signals so each one
 * re-renders (or redraws) on its own without touching the rest of the page.
 */
export interface PlaybackView {
  /** Timeline position, seconds. */
  pos: ReadonlySignal<number>;
  /** A tone is sounding. */
  lit: ReadonlySignal<boolean>;
  /** Index of the letter being sent, or -1. */
  cursor: ReadonlySignal<number>;
  /** Elements of the current letter started so far. */
  elems: ReadonlySignal<number>;
  /** Playing or paused (not idle). */
  active: ReadonlySignal<boolean>;
  schedule: ReadonlySignal<Schedule>;
  letters: ReadonlySignal<Letter[]>;
  timing: ReadonlySignal<Timing>;
  pitch: ReadonlySignal<number>;
  /** The live analyser, when audio is running. */
  analyser(): AnalyserNode | null;
}
