import { getAudio } from './engine';

/** A very soft tick for button presses — off unless the viewer turns UI sounds on. */
export function tick(enabled: boolean, freq = 1800) {
  if (!enabled) return;
  const ac = getAudio();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.04, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.04);
}
