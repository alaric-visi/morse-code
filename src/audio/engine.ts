let ctx: AudioContext | null = null;

/** The one shared AudioContext, created and resumed on first use (call from a user gesture). */
export function getAudio(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** The shared context if it already exists (never creates one; safe before a gesture). */
export function peekAudio(): AudioContext | null {
  return ctx;
}
