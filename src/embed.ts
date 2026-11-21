import { h, render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { App } from './app/App';
import { startRouter } from './app/router';
import { bindTheme, type ThemeChoice } from './app/theme';
import { messages, type Messages } from './app/i18n';
import '@fontsource-variable/fraunces';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/instruments.css';
import './styles/translate.css';
import './styles/alphabet.css';
import './styles/learn.css';
import './styles/send.css';
import './styles/listen.css';
import './styles/shack.css';
import './styles/radio.css';

export type { ThemeChoice, Messages };

export interface MountOptions {
  /** Initial theme. Defaults to following the system setting. */
  theme?: ThemeChoice;
  /** Fill the viewport (standalone page). Leave off when embedding in a page. */
  fullPage?: boolean;
  /** Offer the first-run welcome (pick a goal). Defaults to on for a full page, off when embedded. */
  onboarding?: boolean;
  /** Replacement interface strings, keyed as in src/app/i18n.ts (EN_GB). */
  messages?: Messages;
  /**
   * Register the offline service worker (sw.js, next to index.html). Off unless asked for, so an
   * embedded copy never claims a service-worker scope over the rest of the host site.
   */
  serviceWorker?: boolean;
}

export interface MountedApp {
  setTheme(theme: ThemeChoice): void;
  unmount(): void;
}

/**
 * Mount Morse Code into `el`. This is the one entry point for every way of using
 * the app: the standalone page (main.ts), a plain <script> on another site, or an
 * Astro island.
 */
export function mount(el: HTMLElement, options: MountOptions = {}): MountedApp {
  el.classList.add('mc-root');
  if (options.fullPage) el.classList.add('mc-page');
  const theme = bindTheme(el, options.theme, !!options.fullPage);
  if (options.messages) messages.value = options.messages;
  const stopRouter = startRouter();
  render(h(App, { onboarding: options.onboarding ?? !!options.fullPage }), el);
  if (options.serviceWorker) registerServiceWorker();
  return {
    setTheme: theme.set,
    unmount() {
      render(null, el);
      stopRouter();
      theme.dispose();
      el.classList.remove('mc-root', 'mc-page');
      delete el.dataset.theme;
    },
  };
}

/** Cache the app for offline use. Production builds only; failures are harmless. */
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const url = new URL('sw.js', document.baseURI);
  navigator.serviceWorker.register(url, { scope: './' }).catch(() => {
    /* offline support is optional */
  });
}

/**
 * The app as a Preact component, for an Astro island:
 * `<MorseCode client:only="preact" theme="dark" />`. It mounts once and unmounts
 * cleanly; later prop changes other than `theme` are ignored.
 */
export function MorseCode(props: MountOptions & { class?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const app = useRef<MountedApp | null>(null);
  useEffect(() => {
    app.current = mount(ref.current!, props);
    return () => app.current?.unmount();
  }, []);
  useEffect(() => {
    if (props.theme) app.current?.setTheme(props.theme);
  }, [props.theme]);
  return h('div', { ref, class: props.class });
}
