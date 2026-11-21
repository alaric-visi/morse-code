import { computed, effect, signal } from '@preact/signals';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'system' || v === 'light' || v === 'dark';

const STORAGE_KEY = 'mc:theme';
const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;

/** What the viewer (or host page) picked. */
export const themeChoice = signal<ThemeChoice>('system');
const systemDark = signal(!!mq?.matches);
/** The theme actually showing. */
export const theme = computed<Theme>(() =>
  themeChoice.value === 'dark' || (themeChoice.value === 'system' && systemDark.value) ? 'dark' : 'light',
);

function stored(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isThemeChoice(v) ? v : null;
  } catch {
    return null;
  }
}

/** Viewer's own choice from the toggle: shown and remembered. */
export function chooseTheme(next: ThemeChoice) {
  themeChoice.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage blocked */
  }
}

/**
 * Keeps `data-theme` on the app root in sync.
 *
 * Priority: `initial` from mount() (the host decides) → the viewer's saved choice →
 * the system setting. A host page can change it later via the returned `set()`, or —
 * when the app is in an iframe — by posting `{ type: 'mc:theme', theme: 'dark' }`
 * from the parent window. It never reads the parent's DOM.
 */
export function bindTheme(root: HTMLElement, initial?: ThemeChoice, mirrorOnDocument = false) {
  themeChoice.value = initial ?? stored() ?? 'system';
  const onSystem = () => (systemDark.value = !!mq?.matches);
  const onMessage = (e: MessageEvent) => {
    if (window.parent === window || e.source !== window.parent) return;
    const d = e.data as { type?: unknown; theme?: unknown } | null;
    if (d && d.type === 'mc:theme' && isThemeChoice(d.theme)) themeChoice.value = d.theme;
  };
  const stop = effect(() => {
    root.dataset.theme = theme.value;
    if (mirrorOnDocument) document.documentElement.dataset.mcTheme = theme.value;
  });
  mq?.addEventListener('change', onSystem);
  window.addEventListener('message', onMessage);
  return {
    set(next: ThemeChoice) {
      themeChoice.value = next;
    },
    dispose() {
      stop();
      mq?.removeEventListener('change', onSystem);
      window.removeEventListener('message', onMessage);
      if (mirrorOnDocument) delete document.documentElement.dataset.mcTheme;
    },
  };
}
