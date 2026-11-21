import { signal } from '@preact/signals';

/**
 * Interface strings, UK English first. The app shell and onboarding read their
 * words from here through `t()`; a host page can pass its own messages to
 * `mount(el, { messages })` to translate or reword them. Teaching content lives
 * in `content/` and is translated by swapping those files.
 *
 * To translate a screen, move its strings here (keyed by screen and purpose) and
 * read them with `t('screen.key')`.
 */
export const EN_GB = {
  'app.name': 'Morse Code',
  'app.home': 'Morse Code home',
  'nav.sections': 'Sections',
  'nav.menu': 'Section: {section}. Open menu',
  'nav.translate': 'Translate',
  'nav.learn': 'Learn',
  'nav.listen': 'Listen',
  'nav.send': 'Send',
  'nav.qso': 'QSO',
  'nav.shack': 'Shack',
  'nav.radio': 'Radio',
  'nav.alphabet': 'Alphabet',
  'nav.progress': 'Progress',
  'theme.group': 'Theme',
  'theme.system': 'System theme',
  'theme.light': 'Light theme',
  'theme.dark': 'Dark theme',
  'theme.cycle': '{current}. Switch to {next}',
  'loading': 'Loading…',
  'loadFailed': 'This part of the app couldn’t load. Check your connection and reload the page.',
  'onboard.title': 'What would you like to do?',
  'onboard.intro': 'Pick one to get started. You can do all of them later from the menu.',
  'onboard.translate': 'Translate',
  'onboard.translate.about': 'Turn text into Morse and back, and hear it.',
  'onboard.learn': 'Learn Morse',
  'onboard.learn.about': 'Learn to copy by ear, a few letters at a time.',
  'onboard.air': 'Get on the air',
  'onboard.air.about': 'Operating practice, and the UK licence.',
  'onboard.speed': 'How fast should the letters be?',
  'onboard.speed.about': 'Letters are always sent at full speed so you learn their sound, with extra space between them while you learn. You can change this any time in Learn.',
  'onboard.speed.gentle': 'Gentle: letters at 15 WPM, spaced out to 5',
  'onboard.speed.standard': 'Standard: letters at 20 WPM, spaced out to 10 (recommended)',
  'onboard.speed.brisk': 'Brisk: letters at 25 WPM, spaced out to 15',
  'onboard.call': 'Your callsign (if you have one)',
  'onboard.name': 'Your first name, for contacts',
  'onboard.licensed': 'I have a licence',
  'onboard.unlicensed': 'Not yet: show me the licence course',
  'onboard.start': 'Start',
  'onboard.back': 'Back',
  'onboard.skip': 'Skip',
} as const;

export type MessageKey = keyof typeof EN_GB;
export type Messages = Partial<Record<MessageKey, string>>;

export const messages = signal<Messages>({});

/** The string for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars: Record<string, string> = {}): string {
  const s = messages.value[key] ?? EN_GB[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
