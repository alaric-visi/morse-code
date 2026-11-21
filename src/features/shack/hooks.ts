import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { encodeText } from '../../core/codec';
import { buildSchedule, isKeyDown } from '../../core/schedule';
import { timing } from '../../core/timing';
import { BandRig } from '../../audio/band';
import { Chorus } from '../../audio/chorus';
import { getAudio } from '../../audio/engine';
import { Player } from '../../audio/player';
import { loadSettings } from '../../app/settings';
import { seeded } from '../../learn/random';
import { addToLog, type LogEntry } from '../../learn/logbook';
import { updateProgress } from '../../learn/store';
import type { RadioSettings } from '../listen/radio';

/** A band rig with a chorus of stations, following the radio settings. Torn down on unmount. */
export function useChorus(s: RadioSettings) {
  const centre = useMemo(() => loadSettings().pitch, []);
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), []);
  const rig = useRef<BandRig | null>(null);
  const chorus = useRef<Chorus | null>(null);
  const live = useRef(s);
  live.current = s;

  const get = () => {
    if (!chorus.current) {
      getAudio();
      rig.current = new BandRig(centre, rng);
      rig.current.set(live.current.c, live.current.rx, live.current.volume);
      rig.current.start();
      chorus.current = new Chorus(rig.current, rng);
    }
    return chorus.current;
  };
  useEffect(() => {
    rig.current?.set(s.c, s.rx, s.volume);
    chorus.current?.retune(chorus.current.rx);
  }, [s.c, s.rx, s.volume]);
  const rest = () => {
    chorus.current?.stopAll();
    rig.current?.stop();
    chorus.current = null;
    rig.current = null;
  };
  useEffect(() => () => rest(), []);
  return { get, rest, centre, rng };
}

/** Your own transmitter: macros and replies sent cleanly at your sidetone pitch and speed. */
export function useMyTx(wpm: () => number) {
  const centre = useMemo(() => loadSettings().pitch, []);
  const volume = useMemo(() => loadSettings().volume * 0.5, []);
  const lit = useSignal(false);
  const sending = useSignal(false);
  const player = useRef<Player | null>(null);
  const raf = useRef(0);
  useEffect(() => () => stop(), []);

  function send(text: string): Promise<void> {
    stop();
    const w = wpm();
    const sch = buildSchedule(encodeText(text).words, timing({ charWpm: w }));
    if (!sch.events.length) return Promise.resolve();
    const p = new Player({ voice: 'sine', pitch: centre, volume, muted: false });
    player.current = p;
    sending.value = true;
    return new Promise((resolve) => {
      p.onEnd = () => {
        cancelAnimationFrame(raf.current);
        lit.value = false;
        sending.value = false;
        resolve();
      };
      p.load(sch);
      p.play(0);
      const frame = () => {
        lit.value = isKeyDown(sch.events, p.position());
        if (p.state === 'playing') raf.current = requestAnimationFrame(frame);
      };
      frame();
    });
  }
  function stop() {
    cancelAnimationFrame(raf.current);
    player.current?.stop();
    player.current = null;
    lit.value = false;
    sending.value = false;
  }
  return { send, stop, lit, sending };
}

/** Add a contact to your logbook (saved with your progress). */
export function logQso(e: LogEntry) {
  return updateProgress((p) => (p.log = addToLog(p.log, e)));
}
