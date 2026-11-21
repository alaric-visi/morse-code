/**
 * An iambic keyer, stepped one audio sample at a time so it can run inside an
 * AudioWorklet with sample-accurate timing. Pure: no audio, no DOM.
 *
 * - Hold the dit paddle: dits. Hold dah: dahs. Squeeze both: they alternate,
 *   starting with whichever paddle went down first.
 * - Mode A: after each element (and its one-unit space), the next is chosen from
 *   the paddles held *now*. Let go of a squeeze and it stops after the current element.
 * - Mode B: pressing the opposite paddle at any time during an element is
 *   remembered and sent next, so letting go of a squeeze sends one more element.
 * - Ultimatic: squeezing sends repeats of whichever paddle went down last;
 *   let it go and the other one takes over again. (A single-lever paddle
 *   behaves the same way, because it can only close one side at a time.)
 * - Bug (semi-automatic): the dit side runs automatic dits, like the pendulum;
 *   the dah side is a plain contact, so you time every dah yourself.
 * - Cootie (sideswiper): both sides are plain contacts; you make every element
 *   by hand, alternating sides.
 */
export type IambicMode = 'A' | 'B' | 'ultimatic' | 'bug' | 'cootie';
export type Element = '.' | '-';

export interface ElementEvent {
  el: Element;
  /** Sample index the element started at, and the first sample after it. */
  start: number;
  end: number;
}

export class IambicKeyer {
  /** Samples stepped so far. */
  sample = 0;
  onElement: ((e: ElementEvent) => void) | null = null;

  private dit = false;
  private dah = false;
  private state: 'idle' | 'mark' | 'space' = 'idle';
  private current: Element = '.';
  private remaining = 0;
  private markStart = 0;
  private sending = false;
  private ditMem = false;
  private dahMem = false;
  private squeezeFirst: Element = '.';
  private lastPressed: Element = '.';
  private manual = false;

  constructor(
    public mode: IambicMode,
    /** Dit length in samples. */
    public unit: number,
  ) {}

  setPaddles(dit: boolean, dah: boolean) {
    if (dit && dah && !(this.dit && this.dah)) {
      // The paddle that was already down goes first; both at once → dit.
      this.squeezeFirst = this.dah && !this.dit ? '-' : '.';
    }
    if (dit && !this.dit) this.lastPressed = '.';
    if (dah && !this.dah) this.lastPressed = '-';
    this.dit = dit;
    this.dah = dah;
    this.remember();
  }

  get keyDown() {
    return this.state === 'mark' || this.manual;
  }

  /** Advance one sample. Returns whether the key is down during it. */
  step(): boolean {
    // Plain contacts: the cootie's two sides, and the bug's dah side.
    this.manual = this.mode === 'cootie' ? this.dit || this.dah : this.mode === 'bug' && this.dah;
    if (this.mode === 'cootie') {
      this.sample++;
      return this.manual;
    }
    if (this.state === 'idle') this.next();
    const down = this.state === 'mark' || this.manual;
    if (this.state !== 'idle') {
      this.remember();
      if (--this.remaining <= 0) {
        if (this.state === 'mark') {
          this.onElement?.({ el: this.current, start: this.markStart, end: this.sample + 1 });
          this.state = 'space';
          this.remaining = this.unit;
        } else {
          this.state = 'idle';
        }
      }
    }
    this.sample++;
    return down;
  }

  /** Mode B: latch the opposite paddle while an element and its space are under way. */
  private remember() {
    if (this.mode !== 'B' || this.state === 'idle') return;
    if (this.current === '.' && this.dah) this.dahMem = true;
    if (this.current === '-' && this.dit) this.ditMem = true;
  }

  private next() {
    const opposite: Element = this.current === '.' ? '-' : '.';
    let el: Element | null = null;
    if (this.mode === 'bug') el = this.dit && !this.dah ? '.' : null;
    else if (this.mode === 'ultimatic') el = this.dit && this.dah ? this.lastPressed : this.dit ? '.' : this.dah ? '-' : null;
    else if (this.dit && this.dah) el = this.sending ? opposite : this.squeezeFirst;
    else if (this.sending && ((opposite === '-' && this.dahMem) || (opposite === '.' && this.ditMem))) el = opposite;
    else if (this.dit) el = '.';
    else if (this.dah) el = '-';
    this.ditMem = false;
    this.dahMem = false;
    if (!el) {
      this.sending = false;
      return;
    }
    this.sending = true;
    this.current = el;
    this.state = 'mark';
    this.markStart = this.sample;
    this.remaining = el === '.' ? this.unit : 3 * this.unit;
  }
}
