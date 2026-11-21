import { useEffect, useRef } from 'preact/hooks';
import { theme } from '../app/theme';

/** Read a set of --mc-* tokens as resolved colours, from an element inside the app root. */
export function readTokens<K extends string>(el: Element, names: readonly K[]): Record<K, string> {
  const cs = getComputedStyle(el);
  return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--mc-${n}`).trim()])) as Record<K, string>;
}

export interface CanvasFrame<K extends string> {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  w: number;
  h: number;
  colors: Record<K, string>;
}

/**
 * A crisp, theme-aware canvas. `draw` runs every animation frame while `live()`
 * is true, and once after any resize, theme change, or `deps` change otherwise.
 */
export function useCanvas<K extends string>(
  tokens: readonly K[],
  draw: (f: CanvasFrame<K>) => void,
  live: () => boolean,
  deps: unknown[] = [],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const liveRef = useRef(live);
  liveRef.current = live;
  const dirty = useRef(true);
  const themeName = theme.value; // re-render on theme change → mark dirty below

  useEffect(() => {
    dirty.current = true;
  }, [themeName, ...deps]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let colors = readTokens(canvas, tokens);
    let colorsFor = '';
    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!w || !h) return;
      if (!liveRef.current() && !dirty.current) return;
      const t = canvas.closest('.mc-root')?.getAttribute('data-theme') ?? '';
      if (t !== colorsFor) {
        colors = readTokens(canvas, tokens);
        colorsFor = t;
      }
      dirty.current = false;
      ctx.clearRect(0, 0, w, h);
      drawRef.current({ ctx, w, h, colors });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return ref;
}
