/**
 * Key and paddle inputs. Everything reports the same two things: the straight
 * key (or dit paddle) and the dah paddle, each down or up, with a timestamp in
 * seconds on the performance clock.
 *
 * - Keyboard: Space = straight key; [ and ] = dit / dah paddles. Left/Right Ctrl
 *   also work as paddles, which is what common USB paddle adapters send.
 * - Web MIDI: the first note you press is dit/straight, the next different note dah.
 * - Web Serial: CTS = dit/straight, DSR = dah (the usual serial-port key wiring).
 */
export type Line = 'dit' | 'dah';
export type LineHandler = (line: Line, down: boolean, t: number) => void;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/** Keyboard keys → lines. Returns a cleanup function. */
export function bindKeyboard(onLine: LineHandler, swap = () => false): () => void {
  const map = (e: KeyboardEvent): Line | null => {
    let line: Line | null = null;
    if (e.code === 'Space' || e.code === 'BracketLeft' || e.code === 'ControlLeft') line = 'dit';
    else if (e.code === 'BracketRight' || e.code === 'ControlRight') line = 'dah';
    if (line && swap() && e.code !== 'Space') line = line === 'dit' ? 'dah' : 'dit';
    return line;
  };
  const handle = (down: boolean) => (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const line = map(e);
    if (!line) return;
    // Keep Space from scrolling the page or pressing a focused button.
    e.preventDefault();
    if (down && e.repeat) return;
    onLine(line, down, e.timeStamp / 1000);
  };
  const down = handle(true);
  const up = handle(false);
  // Losing focus mid-press must not leave the key stuck down.
  const blur = () => {
    const t = performance.now() / 1000;
    onLine('dit', false, t);
    onLine('dah', false, t);
  };
  document.addEventListener('keydown', down);
  document.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    document.removeEventListener('keydown', down);
    document.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

export const midiSupported = () => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;

/** Listen to every MIDI input. Returns a cleanup function. Must be called from a user gesture. */
export async function connectMidi(onLine: LineHandler): Promise<() => void> {
  const access = await (navigator as Navigator & { requestMIDIAccess(): Promise<MIDIAccess> }).requestMIDIAccess();
  let ditNote: number | null = null;
  const onMessage = (e: Event) => {
    const data = (e as MIDIMessageEvent).data;
    if (!data || data.length < 3) return;
    const [status, note, velocity] = data;
    const cmd = status & 0xf0;
    if (cmd !== 0x90 && cmd !== 0x80) return;
    ditNote ??= note;
    const down = cmd === 0x90 && velocity > 0;
    onLine(note === ditNote ? 'dit' : 'dah', down, performance.now() / 1000);
  };
  const inputs = [...access.inputs.values()];
  inputs.forEach((i) => i.addEventListener('midimessage', onMessage));
  return () => inputs.forEach((i) => i.removeEventListener('midimessage', onMessage));
}

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getSignals(): Promise<{ clearToSend: boolean; dataSetReady: boolean }>;
}

/** Poll a serial port's CTS/DSR lines. Returns a cleanup function. Must be called from a user gesture. */
export async function connectSerial(onLine: LineHandler): Promise<() => void> {
  const serial = (navigator as Navigator & { serial: { requestPort(): Promise<SerialPortLike> } }).serial;
  const port = await serial.requestPort();
  await port.open({ baudRate: 9600 });
  let running = true;
  let dit = false;
  let dah = false;
  void (async () => {
    while (running) {
      try {
        const s = await port.getSignals();
        const t = performance.now() / 1000;
        if (s.clearToSend !== dit) onLine('dit', (dit = s.clearToSend), t);
        if (s.dataSetReady !== dah) onLine('dah', (dah = s.dataSetReady), t);
      } catch {
        running = false;
      }
      await new Promise((r) => setTimeout(r, 2));
    }
  })();
  return () => {
    running = false;
    void port.close().catch(() => {});
  };
}
