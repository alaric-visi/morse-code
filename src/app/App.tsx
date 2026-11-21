import { useEffect, useState } from 'preact/hooks';
import { NAV, route, type Route } from './router';
import { chooseTheme, themeChoice, type ThemeChoice } from './theme';
import { t, type MessageKey } from './i18n';
import { Onboarding, onboardingWanted } from './Onboarding';
import { Translate } from '../features/translate/Translate';
import { Alphabet } from '../features/alphabet/Alphabet';
import { Learn } from '../features/learn/Learn';
import { ProgressPage } from '../features/progress/ProgressPage';
import { Send } from '../features/send/Send';
import { IconAuto, IconMoon, IconSun } from '../ui/icons';
import { Wordmark } from '../ui/Wordmark';

const THEMES: { value: ThemeChoice; label: MessageKey; Icon: () => preact.JSX.Element }[] = [
  { value: 'system', label: 'theme.system', Icon: IconAuto },
  { value: 'light', label: 'theme.light', Icon: IconSun },
  { value: 'dark', label: 'theme.dark', Icon: IconMoon },
];

const label = (r: Route) => t(`nav.${r.slice(1)}` as MessageKey);

/** App shell: wordmark, section nav, theme toggle, and the current screen. */
export function App({ onboarding = true }: { onboarding?: boolean }) {
  const current = route.value;
  const [welcome, setWelcome] = useState(() => onboarding && onboardingWanted());
  return (
    <div class="mc-shell">
      <header class="mc-header">
        <a class="mc-brand" href="#/translate" aria-label={t('app.home')}>
          <Wordmark />
        </a>
        {/* Phones: the sections fold into one menu so the header stays on one row. */}
        <details class="mc-menu mc-nav-menu" key={current}>
          <summary class="mc-btn ghost" aria-label={t('nav.menu', { section: label(current) })}>
            {label(current)} <span aria-hidden="true">▾</span>
          </summary>
          <div class="mc-menu-items mc-nav-items">
            {NAV.map((r) => (
              <a key={r} href={`#${r}`} aria-current={current === r ? 'page' : undefined}>
                {label(r)}
              </a>
            ))}
          </div>
        </details>
        <nav class="mc-nav" aria-label={t('nav.sections')}>
          {NAV.map((r) => (
            <a key={r} href={`#${r}`} aria-current={current === r ? 'page' : undefined}>
              {label(r)}
            </a>
          ))}
        </nav>
        {/* Phones: one button that cycles the theme, to keep the header on one row. */}
        <ThemeCycle />
        <div class="mc-seg mc-theme" role="group" aria-label={t('theme.group')}>
          {THEMES.map(({ value, label, Icon }) => (
            <button key={value} type="button" aria-pressed={themeChoice.value === value} aria-label={t(label)} title={t(label)} onClick={() => chooseTheme(value)}>
              <Icon />
            </button>
          ))}
        </div>
      </header>
      <main class="mc-main">
        {current === '/alphabet' ? (
          <Alphabet />
        ) : current === '/learn' ? (
          <Learn />
        ) : current === '/progress' ? (
          <ProgressPage />
        ) : current === '/send' ? (
          <Send />
        ) : current === '/listen' ? (
          <Lazy key="listen" load={loadListen} />
        ) : current === '/qso' ? (
          <Lazy key="qso" load={loadQso} />
        ) : current === '/shack' ? (
          <Lazy key="shack" load={loadShack} />
        ) : current === '/radio' ? (
          <Lazy key="radio" load={loadRadio} />
        ) : (
          <Translate />
        )}
      </main>
      {welcome && <Onboarding onDone={() => setWelcome(false)} />}
    </div>
  );
}

function ThemeCycle() {
  const i = THEMES.findIndex((x) => x.value === themeChoice.value);
  const { label, Icon } = THEMES[i];
  const next = THEMES[(i + 1) % THEMES.length];
  return (
    <button
      type="button"
      class="mc-btn ghost mc-theme-cycle"
      aria-label={t('theme.cycle', { current: t(label), next: t(next.label).toLowerCase() })}
      title={t(label)}
      onClick={() => chooseTheme(next.value)}
    >
      <Icon />
    </button>
  );
}

type Screen = () => preact.JSX.Element;
/** Load a screen's module once; later visits reuse the same promise. */
const once = (f: () => Promise<Screen>) => {
  let p: Promise<Screen> | null = null;
  return () => (p ??= f().catch((e) => ((p = null), Promise.reject(e))));
};
// The ham-radio screens (Phases 5–7) are separate chunks, loaded on first visit.
const loadListen = once(() => import('../features/listen/Listen').then((m) => m.Listen));
const loadQso = once(() => import('../features/qso/Qso').then((m) => m.Qso));
const loadShack = once(() => import('../features/shack/Shack').then((m) => m.Shack));
const loadRadio = once(() => import('../features/radio/Radio').then((m) => m.Radio));

function Lazy({ load }: { load: () => Promise<Screen> }) {
  const [C, setC] = useState<Screen | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load().then(
      (c) => live && setC(() => c),
      () => live && setFailed(true),
    );
    return () => void (live = false);
  }, [load]);
  if (failed)
    return (
      <p class="mc-help" role="alert">
        {t('loadFailed')}
      </p>
    );
  return C ? (
    <C />
  ) : (
    <p class="mc-help mc-loading" role="status">
      {t('loading')}
    </p>
  );
}
