import { useComputed, type ReadonlySignal } from '@preact/signals';

/**
 * A signal lamp: brass bezel, glass, filament and bloom. The glow warms up fast
 * and cools a little slower, like an incandescent bulb (tokens --mc-lamp-warm/cool).
 */
export function Lamp({ lit, size = 'lg', testId }: { lit: ReadonlySignal<boolean>; size?: 'sm' | 'lg'; testId?: string }) {
  const cls = useComputed(() => `mc-lamp mc-lamp-${size}${lit.value ? ' on' : ''}`);
  return (
    <span class={cls} data-testid={testId} aria-hidden="true">
      <span class="mc-lamp-bloom" />
      <span class="mc-lamp-bezel">
        <span class="mc-lamp-glass">
          <span class="mc-lamp-filament" />
        </span>
      </span>
    </span>
  );
}
