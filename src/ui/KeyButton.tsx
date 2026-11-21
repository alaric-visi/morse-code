import { useComputed, useSignal, type ReadonlySignal } from '@preact/signals';
import { useEffect, useId, useMemo } from 'preact/hooks';
import { Sidetone, type SidetoneParams } from '../audio/sidetone';

/**
 * An illustrated straight key. It moves by itself while a message plays, and you
 * can work it yourself (pointer, or Space/Enter when focused) to hear a sidetone.
 */
export function KeyButton({
  auto,
  sound,
  disabled,
  onPress,
  onRelease,
}: {
  auto: ReadonlySignal<boolean>;
  sound: SidetoneParams;
  disabled?: boolean;
  /** When given, the key reports presses (event time, seconds) instead of sounding its own tone. */
  onPress?(t: number): void;
  onRelease?(t: number): void;
}) {
  const uid = useId().replace(/[^\w-]/g, '');
  const g = (name: string) => `url(#${uid}-${name})`;
  const held = useSignal(false);
  const tone = useMemo(() => new Sidetone(sound), []);
  useEffect(() => tone.set(sound), [sound.voice, sound.pitch, sound.volume]);
  useEffect(() => () => tone.dispose(), []);
  const cls = useComputed(() => 'mc-key' + (held.value || auto.value ? ' down' : ''));

  const press = (t = performance.now() / 1000) => {
    if (held.peek() || disabled) return;
    held.value = true;
    if (onPress) onPress(t);
    else tone.down();
  };
  const release = (t = performance.now() / 1000) => {
    if (!held.peek()) return;
    held.value = false;
    if (onRelease) onRelease(t);
    else tone.up();
  };

  return (
    <button
      type="button"
      class={cls}
      aria-label="Straight key: hold to send a tone"
      aria-pressed={held}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        press(e.timeStamp / 1000);
      }}
      onPointerUp={(e) => release(e.timeStamp / 1000)}
      onPointerCancel={(e) => release(e.timeStamp / 1000)}
      onLostPointerCapture={(e) => release(e.timeStamp / 1000)}
      onKeyDown={(e) => {
        // With outside handlers, the page's own key bindings do the keying.
        if (onPress) return;
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          press();
        }
      }}
      onKeyUp={(e) => {
        if (onPress) return;
        if (e.key === ' ' || e.key === 'Enter') release();
      }}
      onBlur={() => release()}
    >
      <svg viewBox="0 0 220 110" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-brass`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="mc-stop-shine" />
            <stop offset="0.45" class="mc-stop-mid" />
            <stop offset="1" class="mc-stop-deep" />
          </linearGradient>
          <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="mc-stop-wood-hi" />
            <stop offset="1" class="mc-stop-wood" />
          </linearGradient>
          <radialGradient id={`${uid}-knob`} cx="0.38" cy="0.3" r="0.8">
            <stop offset="0" class="mc-stop-wood-hi" />
            <stop offset="1" class="mc-stop-wood" />
          </radialGradient>
        </defs>
        {/* shadow under the base */}
        <ellipse class="mc-key-shadow" cx="110" cy="103" rx="104" ry="5" />
        {/* wooden base */}
        <rect x="6" y="78" width="208" height="24" rx="6" fill={g('wood')} />
        <rect class="mc-key-base-top" x="8" y="79" width="204" height="3" rx="1.5" />
        {/* contact post and trunnion */}
        <rect x="150" y="62" width="14" height="18" rx="2" fill={g('brass')} />
        <rect x="40" y="58" width="22" height="22" rx="3" fill={g('brass')} />
        <circle class="mc-key-screw" cx="51" cy="64" r="4" />
        {/* lever + knob pivot at the trunnion */}
        <g class="mc-key-lever">
          <rect x="44" y="54" width="148" height="9" rx="4.5" fill={g('brass')} />
          <rect x="186" y="48" width="8" height="12" rx="2" fill={g('brass')} />
          <ellipse cx="190" cy="38" rx="22" ry="12" fill={g('knob')} />
          <ellipse class="mc-key-knob-top" cx="186" cy="33" rx="12" ry="4" />
        </g>
        {/* contact spark */}
        <circle class="mc-key-spark" cx="157" cy="62" r="5" />
      </svg>
    </button>
  );
}
