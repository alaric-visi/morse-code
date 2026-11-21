# Hand-off

Everything needed to take Morse Code from this folder to a GitHub repo and onto the Astro site on Netlify.

## What you have

- A static web app: HTML, JS, CSS and fonts, with no server, no database and no API keys. Progress is saved in the visitor's browser (IndexedDB).
- Two build outputs:
  - `dist/`: the **standalone app**, a complete page that works from any folder (`/morse/`, `/tools/morse/`…).
  - `dist-lib/`: the **embeddable library**, `morse-code.js` + `morse-code.css`, for mounting the app inside one of your own pages.
- Tests: unit (Vitest), browser (Playwright: desktop, phone, and an "embed" project that checks the sub-path build, the library inside a host page, and offline use).

## Requirements

- Node 20 or later (built and tested on Node 20.18).
- `npm ci` installs everything. Playwright needs its browser once: `npx playwright install chromium`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, colour-token lint, build `dist/`, then check the size budget |
| `npm run build:lib` | Build the embeddable library into `dist-lib/` |
| `npm run size` | Re-run the size check on `dist/` (first load must stay under 150 KB gzipped) |
| `npm run check` | Typecheck + token lint + unit tests (fast) |
| `npm run test:e2e` | All browser tests (builds first) |
| `npm run test:all` | `check` + browser tests |
| `npm run test:long` | The 8-minute full-speed QSO test |
| `npm run test:visual -- --update-snapshots` | Refresh screenshot baselines after an intended visual change |
| `node scripts/serve-embed.mjs 4320` | Serve `dist/` at `/morse/`, `dist-lib/` at `/lib/`, and a sample host page at `/`, to try the hand-off locally (build both first) |

## Build options

- `MC_BASE=/morse/ npm run build`: use an absolute base path. You don't normally need this: the default (`./`) makes every asset path relative, so the same build works from any folder.
- Routing uses the URL hash (`#/learn`, `#/radio?tab=keys`), so no Netlify redirect rules are needed, and no special headers: nothing uses `SharedArrayBuffer` or cross-origin isolation.

## `mount()` options

```ts
import { mount } from './src/embed'; // or '/morse-lib/morse-code.js'

const app = mount(element, {
  theme: 'system',        // 'system' | 'light' | 'dark'. The host decides; the viewer's own choice is used if omitted
  fullPage: false,        // true only for a page that is nothing but the app
  onboarding: false,      // first-run "what would you like to do?" (default: on for fullPage, off when embedded)
  serviceWorker: false,   // offline support; leave off when embedded (see below)
  messages: {},           // replacement interface strings, keyed as in src/app/i18n.ts
});
app.setTheme('dark');     // follow your site's theme toggle
app.unmount();            // remove cleanly (Astro view transitions, for example)
```

All styles are scoped under `.mc-root` and every colour is a `--mc-*` custom property (`src/styles/tokens.css`), so the app and your site don't restyle each other.

## Putting it on the Astro site

Pick one. Option A is the least work; B fits the app inside your site's layout; C is the most integrated but makes the site build the app's source.

### A. Copy the standalone build into `public/`

```bash
npm run build
cp -R dist/ ../your-astro-site/public/morse/
```

Link to `/morse/` from your navigation. It's a full page of its own (with the first-run welcome and offline support), served exactly as built. To update, rebuild and copy again.

### B. Mount the library inside an Astro page

```bash
npm run build:lib
cp -R dist-lib/ ../your-astro-site/public/morse-lib/
```

`src/pages/morse.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="Morse Code">
  <link rel="stylesheet" href="/morse-lib/morse-code.css" />
  <div id="morse"></div>
  <script type="module" is:inline>
    import { mount } from '/morse-lib/morse-code.js';
    const root = document.documentElement;
    const app = mount(document.getElementById('morse'), {
      theme: root.dataset.theme === 'dark' ? 'dark' : 'light',
    });
    // Follow the site's theme toggle (adjust to however your site marks dark mode).
    new MutationObserver(() => app.setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light'))
      .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    // With Astro view transitions, unmount before the page is swapped out.
    document.addEventListener('astro:before-swap', () => app.unmount(), { once: true });
  </script>
</Layout>
```

The library bundles its own copy of Preact, so the site needs no extra packages. The app takes over the page's URL hash for its routing (`/morse#/learn`).

### C. An Astro island from source

Put this project inside the site (for example `packages/morse/`, or as a git submodule), then:

```bash
npx astro add preact
npm install @preact/signals idb-keyval ts-fsrs @fontsource-variable/fraunces @fontsource/atkinson-hyperlegible @fontsource-variable/jetbrains-mono
```

```astro
---
import { MorseCode } from '../../packages/morse/src/embed';
---
<MorseCode client:only="preact" theme="light" />
```

`client:only` matters: the app uses the browser's audio and storage, so it must not render on the server. The island shares the site's Preact.

## Offline support (service worker)

The standalone page (`dist/index.html`) registers `sw.js`, which precaches the build so the app works offline after one visit. Its scope is the app's own folder (`/morse/`), so it can never take over the rest of your site. When you embed the app (options B and C) the service worker stays off unless you pass `serviceWorker: true`, and you shouldn't: its scope would be the page's folder. To remove offline support from option A, delete `sw.js` from the copied folder; the app works without it.

## Progress and moving between sites

Progress lives in IndexedDB, which browsers keep separately for every origin: what you practised on `localhost` doesn't appear on the live site. The **Progress** screen has **Export progress** and **Import progress** (a JSON file) for moving it across. Clearing site data, or a private window, starts afresh.

## Content Security Policy

If your site sends a CSP header, the app needs:

- `script-src 'self' blob:`: the keyer and tone-detector AudioWorklets load from `blob:` URLs.
- `media-src 'self' blob:` and `connect-src 'self'` are enough for everything else (WAV export creates a blob; the service worker fetches `precache.json`).
- `worker-src 'self'` if you keep the service worker.

## Browser support

- Current Chrome, Edge, Firefox and Safari (desktop and mobile), built for ES2022.
- **Audio** starts on the first tap or key press (browsers don't allow sound before that). On iOS, the ring/silent switch doesn't mute Web Audio in Safari, but Low Power Mode can make timing less steady.
- **Paddle keyer** needs AudioWorklet (all current browsers). If it's missing, the straight key still works.
- **MIDI and serial keys** need Web MIDI / Web Serial: Chrome and Edge on desktop only. Keyboard keying works everywhere.
- **Off-air decoder** needs microphone permission; audio is processed on the device and never sent anywhere.

## Checks still to do by hand

These need a person and real devices, and haven't been done:

- [ ] A screen-reader pass with VoiceOver (macOS and iOS): the automated checks (`e2e/a11y.spec.ts`) cover names, labels, headings and ids, not how it sounds.
- [ ] A touch-device check on a real phone and tablet: the paddles, the key, and the dial in the Shack.
- [ ] Audio latency on iOS Safari: the timing check on the Send page (press Start and tap along with the clicks) reports the measured delay.
- [ ] Lighthouse. I couldn't run it here. Against a build served by `npx vite preview --port 4319`:
  `npx lighthouse http://localhost:4319/ --preset=desktop --view` (and again without `--preset` for mobile). The target is 95 or more in every category.

## First push checklist

1. `git init`, then check `.gitignore` covers `node_modules`, `dist`, `dist-lib`, `test-results*` and `playwright-report` (it does).
2. `npm ci && npx playwright install chromium`
3. `npm run test:all`. Everything should pass. The visual baselines (`e2e/visual.spec.ts-snapshots/`) were made on macOS; on another OS, regenerate them once with `npm run test:visual -- --update-snapshots`.
4. Commit and push. `legacy/` holds the original single-file page, which the parity tests use; keep it unless you drop those tests.
5. On the site: follow option A, B or C above, then check `/morse/` (or your page) in light and dark, on a phone, and offline (option A).
