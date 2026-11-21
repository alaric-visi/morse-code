import { useComputed, useSignal, type ReadonlySignal } from '@preact/signals';
import { useId } from 'preact/hooks';

type Value = number | ReadonlySignal<number>;
const read = (v: Value) => (typeof v === 'number' ? v : v.value);

/**
 * A labelled brass slider. The filled part of the track follows the value through
 * a CSS variable; a signal value updates the DOM without re-rendering the parent.
 */
export function Slider(props: {
  label: string;
  hideLabel?: boolean;
  min: number;
  max: number;
  step: number;
  value: Value;
  display?: string;
  valueText?: ReadonlySignal<string> | string;
  disabled?: boolean;
  onInput(v: number): void;
}) {
  const id = useId();
  const range = useSignal({ min: props.min, max: props.max });
  range.value = { min: props.min, max: props.max };
  const valueSig = useSignal(0);
  if (typeof props.value === 'number') valueSig.value = props.value;
  const fill = useComputed(() => {
    const v = typeof props.value === 'number' ? valueSig.value : props.value.value;
    const { min, max } = range.value;
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    return `--mc-fill: ${Math.min(100, Math.max(0, pct))}%`;
  });
  const input = (
    <input
      type="range"
      id={id}
      aria-label={props.hideLabel ? props.label : undefined}
      aria-valuetext={props.valueText}
      min={props.min}
      max={props.max}
      step={props.step}
      value={typeof props.value === 'number' ? props.value : props.value}
      style={fill}
      disabled={props.disabled}
      onInput={(e) => props.onInput(+e.currentTarget.value)}
    />
  );
  if (props.hideLabel) return input;
  return (
    <div class="mc-field">
      <div class="mc-field-row">
        <label for={id}>{props.label}</label>
        <output for={id}>{props.display ?? read(props.value)}</output>
      </div>
      {input}
    </div>
  );
}

/** A checkbox drawn as a toggle switch, with its label. */
export function Switch(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange(v: boolean): void;
}) {
  return (
    <label class="mc-switch" title={props.title}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onInput={(e) => props.onChange(e.currentTarget.checked)}
      />
      {props.label}
    </label>
  );
}
