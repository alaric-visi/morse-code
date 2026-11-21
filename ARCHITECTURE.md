# Architecture

A static single-page app: Preact for the interface, signals for state, Web Audio for every sound, IndexedDB for progress. No server. This page explains how the parts fit; [README.md](README.md) has the folder map and [CONTENT.md](CONTENT.md) explains the data files.

## Entry and shell

- `src/embed.ts` is the only entry point. `mount(el, options)` adds the `.mc-root` class, binds the theme, starts the router and renders `<App>`. `src/main.ts` (the standalone page) is one call to it. `MorseCode` wraps it as a component for Astro islands.
- `src/app/router.ts`: hash routes (`#/translate`, `#/radio?tab=keys`). The path picks the screen; screens read their own query (`tab`, `term`, `t`) with `hashQuery()`.
- `src/app/App.tsx`: header, nav and the current screen. Translate, Learn, Send, Alphabet and Progress are in the main bundle; Listen, QSO, Shack and Radio (the ham-radio phases) are loaded on first visit, each as its own chunk. `scripts/check-size.mjs` keeps the first load under 150 KB gzipped (it's about 72 KB).
- `src/app/i18n.ts`: interface strings for the shell and onboarding, read through `t()`; a host can replace them with `mount(el, { messages })`. Screen text is still inline, so translating a screen means moving its strings here first.
- `src/app/theme.ts`: light, dark or system. The host can set it (`setTheme`, or `postMessage({ type: 'mc:theme' })` into an iframe); the viewer's own choice is remembered otherwise.
- `src/app/Onboarding.tsx`: the first-run welcome (translate / learn / get on the air), shown once, only on a first visit to the home page of the standalone app.

## Logic (no DOM)

- `src/core/`: the codec (text ⇄ Morse, prosigns, `{}` literals), timing (PARIS units, Farnsworth), schedules (timed tone events, the timeline everything else reads), the keyer (iambic A/B, ultimatic, bug and cootie, stepped one sample at a time), and the decoders (adaptive dit/dah threshold, fist analysis, Goertzel tone detection).
- `src/learn/`: the course (Koch order, drills, FSRS reviews, statistics, the progress store) and operating (callsigns and zones, QSO scripts, contests, nets, radiograms, the band and propagation model, the logbook with ADIF).
- `src/reference/`: the licence syllabus (study items, mock papers with the real section mix, practice order), the glossary with automatic term linking, and timing for the other codes (American Morse's long dashes).

Pure modules are unit-tested directly (`tests/`), including a 30-minute contest, full QSOs, and decoding synthesised audio through noise.

## Audio

- One shared `AudioContext` (`src/audio/engine.ts`), resumed on the first user gesture.
- `Player`: a look-ahead scheduler that puts tones on the audio clock a few hundred milliseconds ahead, so pause, seek, loop and live speed changes are cheap. Voices (sine, buzzer, radio, sounder) shape each tone.
- `BandRig` and `Chorus`: the simulated band, with noise, static crashes, fading, interference, hum, flutter, echo, a two-stage receiver filter, RIT and AGC, and several stations at once.
- AudioWorklets (`src/audio/worklets/`) are built from source text at runtime and loaded from `blob:` URLs, which works identically in dev and production and needs no extra files: the keyer + sidetone (sample-accurate, reports key-down/up times for the decoder) and the tone detector for the off-air decoder.

## State

- Preact signals. Screen-level state stays in components; shared state (progress, theme, route, messages) lives in module signals.
- Progress (`src/learn/progress.ts`) is one object in IndexedDB, written after every change and cleaned by `sanitizeProgress()` whenever it's read or imported, so old saves and hand-edited exports can't break the app.
- Small per-viewer preferences (sound, speeds, radio settings, the onboarding flag) are in `localStorage`, each read inside try/catch so a blocked storage just means defaults.

## Styling

- Plain CSS per area under `src/styles/`, all scoped to `.mc-root`.
- Every colour is a token in `tokens.css`, defined for light and dark. `npm run lint:tokens` fails on a raw colour anywhere else; `tests/contrast.test.ts` checks the text/background pairs meet WCAG AA.

## Offline

`public/sw.js` precaches the files listed in `precache.json` (written at build time by a small Vite plugin), serves the page network-first and hashed assets cache-first. Only the standalone page registers it, with its scope limited to the app's folder.

## Tests

- `tests/`: Vitest unit tests for the pure modules and the content (syllabus coverage, glossary coverage, code tables).
- `e2e/`: Playwright against the production build, on a desktop and a phone viewport: every screen and flow, layout at 320 and 375 px, accessibility basics, visual snapshots (9+ screens, both themes, three widths), parity with the original page in `legacy/`, onboarding, and an `embed` project that serves the build under `/morse/`, mounts the library in a host page, and checks offline use. Timing-sensitive keying is driven from scripts inside the page, so it doesn't depend on test round trips.
