import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * WCAG AA for every pairing the UI actually uses, in both themes, read straight
 * from tokens.css: 4.5:1 for text, 3:1 for graphics and control boundaries.
 */
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {');
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--mc-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}
const light = block('.mc-root');
const dark = { ...light, ...block(".mc-root[data-theme='dark']") };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** [foreground, background, minimum] */
const TEXT = 4.5;
const UI = 3;
const PAIRS: [string, string, number][] = [
  ['ink', 'paper', TEXT],
  ['ink', 'surface', TEXT],
  ['ink', 'well', TEXT],
  ['ink', 'input-bg', TEXT],
  ['ink-3', 'input-bg', TEXT],
  ['tape-text', 'tape', TEXT],
  ['tape-text-dim', 'tape', TEXT],
  ['ink-2', 'paper', TEXT],
  ['ink-2', 'surface', TEXT],
  ['ink-2', 'well', TEXT],
  ['ink-3', 'surface', TEXT],
  ['ink-3', 'well', TEXT],
  ['brass', 'surface', TEXT],
  ['brass', 'paper', TEXT],
  ['on-brass', 'brass', TEXT],
  ['on-brass-hi', 'brass-hi', TEXT],
  ['warn', 'surface', TEXT],
  ['warn', 'well', TEXT],
  ['wood-ink', 'wood', TEXT],
  ['wood-ink', 'wood-hi', TEXT],
  ['seq-ink-0', 'seq-0', TEXT],
  ['seq-ink-1', 'seq-1', TEXT],
  ['seq-ink-2', 'seq-2', TEXT],
  ['seq-ink-3', 'seq-3', TEXT],
  ['seq-ink-4', 'seq-4', TEXT],
  // graphics and control boundaries
  ['brass', 'well', UI],
  ['lit-ink', 'well', UI],
  ['lit-ink', 'surface', UI],
  ['done-ink', 'well', UI],
  ['line-strong', 'surface', UI],
  ['tape-ink', 'tape', UI],
  ['scope-trace', 'scope-bg', UI],
  ['brass-hi', 'wood', UI],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme meets WCAG AA', (_, t) => {
  it.each(PAIRS)('%s on %s ≥ %f', (fg, bg, min) => {
    expect(t[fg], `token --mc-${fg}`).toBeDefined();
    expect(t[bg], `token --mc-${bg}`).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
