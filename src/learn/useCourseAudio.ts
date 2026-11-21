import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { encodeText } from '../core/codec';
import { buildSchedule, elementsStarted, isKeyDown, letterAt, type Schedule } from '../core/schedule';
import { timing } from '../core/timing';
import { Player } from '../audio/player';
import { loadSettings } from '../app/settings';
import type { CourseSettings } from './progress';

/**
 * Plays course material: characters at the course's character speed with
 * Farnsworth gaps, in the viewer's chosen voice, pitch and volume. Exposes the
 * lamp, current letter and element as signals for the instruments.
 */
export function useCourseAudio(course: CourseSettings) {
  const sound = useMemo(loadSettings, []);
  const player = useMemo(
    () => new Player({ voice: sound.voice, pitch: sound.pitch, volume: sound.volume * 0.5, muted: !sound.sound }),
    [],
  );
  const lit = useSignal(false);
  const cursor = useSignal(-1);
  const elems = useSignal(0);
  const playing = useSignal(false);
  const raf = useRef(0);
  const done = useRef<(() => void) | null>(null);
  const courseRef = useRef(course);
  courseRef.current = course;

  const settle = () => {
    cancelAnimationFrame(raf.current);
    lit.value = false;
    playing.value = false;
    const d = done.current;
    done.current = null;
    d?.();
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      player.stop();
    },
    [],
  );

  /** Build the schedule for `text` at course speed. */
  function scheduleFor(text: string): Schedule {
    const c = courseRef.current;
    return buildSchedule(encodeText(text).words, timing({ charWpm: c.charWpm, effWpm: c.effWpm, spacing: 'farnsworth' }));
  }

  /** Play `text`; resolves when it finishes (or is stopped). */
  function play(text: string): Promise<void> {
    stop();
    const sch = scheduleFor(text);
    if (!sch.events.length) return Promise.resolve();
    return new Promise((resolve) => {
      done.current = resolve;
      player.onEnd = settle;
      player.load(sch);
      player.play(0);
      playing.value = true;
      const frame = () => {
        const p = player.position();
        lit.value = isKeyDown(sch.events, p);
        const at = Math.max(p, 0);
        const n = letterAt(sch, at);
        if (n !== -1) {
          cursor.value = n;
          elems.value = elementsStarted(sch.events, at);
        }
        if (player.state === 'playing') raf.current = requestAnimationFrame(frame);
      };
      frame();
    });
  }

  function stop() {
    if (player.state !== 'idle') player.stop();
    cursor.value = -1;
    elems.value = 0;
    settle();
  }

  /** Seconds into the current sound (negative during lead-in), and its length. */
  const position = () => player.position();
  const total = () => player.total;

  return { play, stop, position, total, scheduleFor, lit, cursor, elems, playing };
}

export type CourseAudio = ReturnType<typeof useCourseAudio>;
