import type { Schedule } from '../core/schedule';
import { createVoice, type VoiceKind } from './voices';
import { encodeWav } from './wav';

/** 12 kHz is plenty for a ≤1 kHz sine and keeps long messages small (~1.4 MB a minute). */
export const WAV_SAMPLE_RATE = 12000;
const TAIL = 0.25;

/** Render the whole schedule offline and return a WAV blob. */
export async function renderWav(
  schedule: Schedule,
  { pitch, volume, voice = 'sine' }: { pitch: number; volume: number; voice?: VoiceKind },
): Promise<Blob> {
  const lead = 0.1;
  const length = Math.ceil((lead + schedule.total + TAIL) * WAV_SAMPLE_RATE);
  const ac = new OfflineAudioContext(1, length, WAV_SAMPLE_RATE);
  const v = createVoice(ac, voice, pitch);
  const vol = ac.createGain();
  vol.gain.value = volume;
  v.output.connect(vol).connect(ac.destination);
  for (const e of schedule.events) v.key(lead + e.t0, lead + e.t1);
  v.start(0);
  const rendered = await ac.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0), WAV_SAMPLE_RATE)], { type: 'audio/wav' });
}

/** Offer a blob to the viewer as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
