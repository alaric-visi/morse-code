import { signal } from '@preact/signals';

/**
 * Hash routing (`#/translate`, `#/learn`, `#/alphabet`, `#/progress` …) so the app works from
 * any sub-path on a static host without server rewrite rules.
 */
export const ROUTES = ['/translate', '/learn', '/listen', '/send', '/qso', '/shack', '/radio', '/alphabet', '/progress'] as const;
export type Route = (typeof ROUTES)[number];
export const DEFAULT_ROUTE: Route = '/translate';

/** The sections in menu order. Labels come from i18n (`nav.<name>`). */
export const NAV: readonly Route[] = ['/translate', '/learn', '/listen', '/send', '/qso', '/shack', '/radio', '/alphabet', '/progress'];

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0];
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : DEFAULT_ROUTE;
}

export const route = signal<Route>(DEFAULT_ROUTE);

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Start listening to `hashchange`. Route changes cross-fade where View Transitions exist. */
export function startRouter(): () => void {
  route.value = parseHash(location.hash);
  const sync = () => {
    const next = parseHash(location.hash);
    if (next === route.value) return;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !reduceMotion()) doc.startViewTransition(() => (route.value = next));
    else route.value = next;
  };
  window.addEventListener('hashchange', sync);
  return () => window.removeEventListener('hashchange', sync);
}

export function navigate(to: Route) {
  location.hash = to;
}

/** The query part of the hash (`#/translate?t=SOS` → `t=SOS`). */
export function hashQuery(hash: string = location.hash): string {
  const i = hash.indexOf('?');
  return i === -1 ? '' : hash.slice(i + 1);
}

/** A full link to `route` with `query`, based on the current page address. */
export function linkTo(route: Route, query: string): string {
  const base = location.href.split('#')[0];
  return `${base}#${route}${query ? `?${query}` : ''}`;
}
