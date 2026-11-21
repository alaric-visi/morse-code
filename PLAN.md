# Morse Code — phased plan

Turn a single-file text↔Morse translator into a well-built, good-looking app that
takes someone from "never heard Morse" to "copying 20 WPM by ear and sending clean
code on a key" — and then all the way into operating on the air: contests,
pileups, nets, portable activations and high-speed CW.

The original is kept, untouched, at `legacy/index.html` so behaviour can be compared
during the port.

## Decisions

| Question | Decision |
|---|---|
| Name | **Morse Code**. No separate brand; the visual identity carries the character. |
| Hosting | **Local only** while it's being built (no git, no remote, no deploy). The scope here is **building the application only**. When it's done, the user creates the GitHub repo and integrates it into their **Astro site on Netlify** themselves. Every phase keeps that hand-off easy: relative asset paths, a configurable `base`, styles scoped so they don't leak, and no assumptions about owning the whole page. |
| Ham-radio depth | **As deep as it goes.** Phase 5 covers real-world copy, Phase 6 is operating practice on the air, and Phase 7 covers the wider radio knowledge (procedure, licensing, history). |
| Licensing focus | **UK first**: Ofcom licences and the RSGB exam syllabus. Other countries can be added later as content packs. |

---

## Where we're starting

**What the current file does well, and must keep:**
- Correct PARIS timing (`unit = 1.2 / WPM`) and the ARRL Farnsworth formula.
- Click-free tones (4 ms ramps) scheduled on the audio clock, not with timers.
- The lamp and highlighting follow `audioCtx.currentTime`, so they stay in sync with the sound.
- Two-way translation that carries across when you switch mode, tolerant input
  (`•`, `–`, `|`, three spaces as a word gap), and warnings for unknown characters.

**What holds it back:**

| Area | Issue |
|---|---|
| Structure | One 600-line file; encoding, timing, audio, DOM and state are tangled together and can't be tested. |
| Theming | `syncTheme()` reads `window.parent.document`, a workaround for one particular host iframe. There's no theme toggle of its own, and the dark palette is written out twice. |
| Audio | A new oscillator is built for every play; changing pitch or sound mid-play does nothing; only one sine voice; long messages put thousands of automation events on one `GainNode`. |
| Round-trip | Unknown characters become `#`, so switching mode twice loses data. Prosigns (`<AR>`, `<SK>`, `<BT>`) and non-English letters (É, Ä, Ñ, Ü, CH) aren't supported. |
| Rendering | Every keystroke throws away the whole output DOM and rebuilds it. The status line never clears "Complete". |
| A11y | Lamp-only flashing has no reduced-motion handling; the output region isn't announced as playback moves on; there's no way to keep the high-contrast lamp while turning the background flash off. |
| Learning | None. It's a translator. Nothing teaches, drills, measures or remembers. |

---

## Target stack

Matches the other projects in `~/work` (toki-pona, chess), so the tooling is familiar:

- **Vite + TypeScript** (strict)
- **Preact + @preact/signals** for UI state (small, fast, good with rAF-driven updates)
- **Vitest** for the pure core (codec, timing, scheduler, decoder, SRS)
- **Playwright** for end-to-end and visual-regression snapshots
- **idb-keyval** for local progress; **ts-fsrs** for spaced repetition
- An **AudioWorklet** for the keyer and the decoder; plain Web Audio nodes for playback
- Everything works offline, no backend. Builds to static files with a configurable
  `base` path and hash routing, so it can later be dropped into a sub-path of the Astro site on
  Netlify, or mounted as a Preact island (Phase 8)

## Directory structure

```
morse/
├── PLAN.md
├── README.md
├── legacy/
│   └── index.html              # original, frozen reference
├── index.html
├── package.json  vite.config.ts  tsconfig.json  playwright.config.ts
├── public/
│   ├── fonts/                  # self-hosted display + mono faces
│   ├── audio/                  # impulse responses, band-noise samples
│   └── icons/
├── content/                    # data, not code — easy to review and extend
│   ├── alphabets/
│   │   ├── itu.json            # A–Z, 0–9, punctuation
│   │   ├── prosigns.json       # AR SK BT KN SOS …
│   │   └── extended.json       # É Ä Ö Ü Ñ CH …
│   ├── courses/
│   │   ├── koch.json           # character order + lesson groupings
│   │   └── lessons/*.md        # short teaching cards per lesson
│   ├── words/                  # top-500 words, common CW abbreviations, Q-codes
│   ├── qso/                    # contact templates for the QSO simulator
│   ├── callsigns/              # prefix tables (ITU allocations, DXCC entities, CQ/ITU zones)
│   ├── contests/               # exchange formats + rules summaries per contest
│   ├── procedure/              # nets, traffic handling (radiogram format), etiquette
│   ├── bandplans/              # CW segments per IARU region
│   ├── codes/                  # American Morse, Continental, Wabun, Cyrillic, Greek, Arabic …
│   └── history/                # timeline entries and articles
├── src/
│   ├── main.tsx
│   ├── app/                    # routes, shell, layout, theme provider
│   ├── core/                   # pure TS, no DOM — 100% unit-tested
│   │   ├── codec.ts            # encode/decode, prosigns, tolerant parser
│   │   ├── timing.ts           # PARIS, Farnsworth, Wordsworth, unit maths
│   │   ├── schedule.ts         # text → timed element list
│   │   ├── tree.ts             # dichotomic tree for the visualiser
│   │   └── decoder/            # adaptive key-timing → characters
│   ├── audio/
│   │   ├── engine.ts           # one shared AudioContext, voices, master bus
│   │   ├── voices/             # sine, sounder (click-clack), buzzer, radio
│   │   ├── fx/                 # band noise, QSB fading, QRM, chirp, filter
│   │   └── worklets/           # keyer.worklet.ts, tone-detect.worklet.ts
│   ├── input/                  # straight key, bug, cootie, iambic A/B, ultimatic, touch, MIDI/serial
│   ├── radio/                  # simulated band: stations, propagation, callers, QSB/QRM models
│   ├── learn/
│   │   ├── srs.ts              # FSRS wrapper, per-character cards
│   │   ├── stats.ts            # accuracy, speed, confusion matrix
│   │   └── progress.ts         # IndexedDB persistence + export/import
│   ├── features/               # one folder per screen
│   │   ├── translate/
│   │   ├── learn/              # lesson + drills
│   │   ├── listen/             # copy practice
│   │   ├── send/               # keying practice + feedback
│   │   ├── qso/                # simulated contacts
│   │   ├── pileup/             # callsign + pileup trainer
│   │   ├── contest/            # contest simulator + scoring
│   │   ├── shack/              # logbook, band map, propagation
│   │   ├── reference/          # Q-codes, prosigns, band plans, procedure
│   │   ├── history/            # timeline + other codes
│   │   └── progress/
│   ├── ui/                     # design-system components
│   │   ├── Lamp.tsx  Tape.tsx  Waveform.tsx  TimingRuler.tsx
│   │   ├── MorseTree.tsx  KeyButton.tsx  Dial.tsx  Toggle.tsx
│   └── styles/
│       ├── tokens.css          # colour, type, space, motion — light + dark once
│       └── base.css
├── tests/                      # vitest
├── e2e/                        # playwright, incl. visual snapshots
└── scripts/                    # size budget check, content linter
```

---

## Phase 0 — Foundations (port, no visible change) ✅ done 2026-11-20

**Goal:** the same app, rebuilt on solid ground.

- Scaffold Vite + TS + Preact; add lint and format scripts. Set up the configurable `base`, hash routing and a `mount(el)` entry point now, so the hand-off needs no rework later.
- Move the Morse table into `content/alphabets/itu.json`.
- Pull `encodeText`, `decodeMorse`, `timing`, `buildSchedule` into `src/core/`, unchanged, then write tests that pin down today's behaviour: PARIS = 50 units, Farnsworth gaps at 5/10/15 WPM, the tolerant-input cases.
- `audio/engine.ts`: one shared `AudioContext`, unlocked on first gesture; a `play(schedule, voice)` that returns a handle with `stop()` and an `onProgress` signal.
- Rebuild the translator screen in Preact, keeping the same layout so it can be compared against `legacy/`.
- Playwright: type → output matches, play → lamp lights, Esc stops.

**Done when:** feature parity with `legacy/index.html`, `npm run check` is green, and the core has full test coverage.

## Phase 1 — Technical execution ✅ done 2026-11-20

**Goal:** fix what the audit found and make the core something the later phases can rely on.

- **Lossless round-trip.** Keep unknown input as an `{ raw }` token rather than `#`, so switching mode twice gets back exactly what you typed.
- **Prosigns and extended alphabets.** Parse `<AR>` / `[SK]` as one character with no letter gap; a toggle for the extended set.
- **Timing modes:** standard, Farnsworth, and Wordsworth (stretches only word gaps). Separate *character* WPM and *effective* WPM sliders, replacing the single slider with a hidden switch at 18.
- **Live parameters.** Pitch, volume and sound/flash changes apply during playback (`AudioParam.setTargetAtTime`).
- **Chunked scheduling.** Schedule about 2 s ahead in a look-ahead loop instead of putting the whole message on the gain node at once. This makes pause/resume and seeking possible.
- **Transport:** play / pause / resume / stop, a scrubber, and loop a selection.
- **Incremental rendering.** Diff the token list (a keyed Preact list) so typing doesn't rebuild the whole output.
- **Settings persistence** (`localStorage`, wrapped in try/catch) and shareable state in the URL hash (`#t=SOS&wpm=20`).
- **Export:** WAV render via `OfflineAudioContext`; copy as text, as `.-` code, or as a prosign-aware string.
- **A11y:** respect `prefers-reduced-motion` (lamp only, no background flash); a toggle for the screen-reader live region; every control usable from the keyboard; flash rate stays under 3 Hz unless the user opts in.

**Done when:** all the issues in the table above are fixed and covered by tests, and a 2,000-character message plays smoothly with pause and seek.

**How it turned out:**
- `{…}` is the escape for literals in both modes, so unknown characters and undecodable codes survive any number of mode switches.
- AR, BT, KN and AS are the same signal as `+ = ( &`, so they decode as those characters. Prosigns that aren't also characters (SK, HH, SOS …) decode as `<SK>` etc.
- Large-area flashing is now **off by default**, so the default 3 Hz flash-rate rule is met by the small lamp alone. It's disabled entirely under reduced motion.
- 2,000 characters render in well under 500 ms, and playback holds frame gaps under 100 ms while seeking and pausing (checked in Playwright).

## Phase 2 — Visual identity and graphics ✅ done 2026-11-21

**Goal:** give it a look of its own instead of default-form styling.

**Direction: "signal room".** Warm, tactile telegraph-era hardware in a modern, clean layout. Brass and lacquered wood in light mode; a dark bench lit by an amber lamp in dark mode. It should feel like an instrument, not a form.

- **Design tokens** in `tokens.css`: one palette with light and dark written once (using a `data-theme` attribute, with `prefers-color-scheme` as the default), a type scale, spacing, radii, and motion durations. Remove `syncTheme()` and add a proper three-way theme toggle (system / light / dark). Keep a small **host-theme hook** (a `data-theme` set from outside, or a `postMessage` from a parent page) so the website can drive the theme in Phase 8 without reaching into the parent's DOM. All tokens are namespaced (`--mc-*`) and all styles scoped under the app root so they won't clash with the website's CSS.
- **Type:** a characterful display serif for headings, a highly legible UI face (Atkinson Hyperlegible, as in toki-pona), and a mono face for code. Draw dots and dashes as real **SVG pills**, sized by their actual 1:3 length ratio, instead of `.` and `-` characters.
- **Signature components:**
  - **Lamp:** a layered radial-gradient bulb with bloom, warm-up and cool-down curves (an incandescent lag of about 30 ms), and an optional Aldis-lamp shutter style.
  - **Paper tape:** a scrolling strip that marks the code as it plays, like an inker or undulator, with letters printed underneath.
  - **Timing ruler:** a unit grid under the current letter showing dot, dash and every gap. This turns Farnsworth from an abstract idea into something you can see.
  - **Waveform / scope:** a live oscilloscope trace of the envelope on canvas (`AnalyserNode`).
  - **Morse tree:** the dichotomic tree drawn as SVG, with the path lighting up as each element plays (left for dit, right for dah). It's both decoration and a lesson.
  - **Key:** an illustrated straight key or paddle that moves down when you press it.
- **Sound design (part of the identity):** voices for sine, sounder click-clack, buzzer, and "radio" (filtered, with a little noise). Soft UI ticks, off by default.
- **Motion:** spring-based state changes and short page transitions; everything degrades cleanly under reduced motion.
- **Layout:** an app shell with a top-level nav (Translate · Learn · Listen · Send · QSO · Progress); single column on phones, with the tape fixed at the bottom; an instrument-panel layout on desktop.
- **Visual regression:** Playwright screenshots of every screen, in both themes, at 375 / 768 / 1440 widths.

**Done when:** every screen uses tokens only (no raw hex values outside `tokens.css`), both themes pass WCAG AA contrast, and the visual snapshots are approved.

**How it turned out:**
- Fonts: Fraunces (display), Atkinson Hyperlegible (UI), JetBrains Mono (code), all self-hosted with fontsource.
- `npm run lint:tokens` fails on any raw colour outside `tokens.css`. `tests/contrast.test.ts` checks 28 text and UI pairings per theme against WCAG AA.
- A second screen, **Alphabet**, shows the tree large, with every character, number, punctuation mark and prosign to tap and hear. The nav has Translate and Alphabet; later phases add Learn, Listen, Send and the rest.
- The Aldis-lamp shutter style was dropped; the bulb carries the look on its own.
- Visual baselines: 12 snapshots in `e2e/visual.spec.ts-snapshots/` (2 screens × 2 themes × 375/768/1440).

## Phase 3 — Learning pathway I: hearing and recognising ✅ done 2026-11-21

**Goal:** a structured course from zero to the full alphabet by ear.

- **Method: Koch + Farnsworth.** Characters are taught at full speed (20 WPM by default) so they're learned as *sounds*, not counted dots. Start with two characters (K, M) and add one each time accuracy reaches 90%. Spacing is stretched with Farnsworth so beginners have time to think.
- **Lesson flow** (each one 5–10 minutes):
  1. **Meet:** the new character's sound, plus a mnemonic rhythm (not a visual one: no dot-counting cards). The tree shows where it sits.
  2. **Recognise:** hear one character, pick it from 4 buttons. Instant audio feedback.
  3. **Copy:** a 1-minute random group of known characters; type what you hear.
  4. **Review:** the characters FSRS says are due.
- **Spaced repetition:** each character, prosign and common word is an FSRS card, graded from response time as well as correctness (a slow right answer counts as "hard").
- **Confusion tracking:** a matrix of which characters get mixed up (e.g. `U/V`, `D/B`), fed back into targeted drills that pair the two.
- **Teaching cards** (`content/courses/lessons/*.md`): short bits on why you shouldn't count dots, what Farnsworth is, the history (Vail and Morse, the 1844 Washington–Baltimore line, the end of maritime CW in 1999).
- **Progress screen:** the alphabet as a grid coloured by mastery, a streak, a WPM-over-time chart, and the confusion heat map.

**Done when:** a new learner can go from lesson 1 to all 26 letters plus 10 digits, with progress saved in IndexedDB and export/import available as a JSON file.

**How it turned out:**
- **Koch order (LCWO):** 41 characters (all letters, all digits and `. , = / ?`) across 40 lessons. Default speed is 20 WPM characters at 10 WPM overall.
- **Passing a copy drill** needs ≥90% over ≥20 characters. Extra typed characters count against you, so guessing can't pad the score. "Finish early" grades only what had actually been sent.
- **Mnemonics are spoken rhythms** ("dah-di-dah"), generated from the code. There are no dot charts anywhere in the course.
- **11 teaching cards** in `content/courses/lessons/*.md`, rendered by a small safe Markdown subset (never raw HTML).
- **Progress page:** mastery ladder, streak and practice time, a copy-accuracy chart (hover/keyboard tooltip plus a table view), and a confusion heat map on a one-hue sequential ramp. All of it is contrast-tested in both themes.
- **Nav:** the four sections fold into a menu below 860 px so the header stays on one row.

## Phase 4 — Learning pathway II: sending ✅ done 2026-11-21

**Goal:** learn to *send*, not just receive, with honest feedback.

- **Input devices:**
  - Straight key on Space or a large touch button (with `pointerdown` / `pointerup` and pointer capture).
  - Iambic paddles on two keys (`[` `]` or Ctrl), modes A and B, with dit/dah memory, run in an **AudioWorklet** so timing doesn't depend on the main thread.
  - Optional Web MIDI / Web Serial for real keys through a USB adapter.
- **Adaptive decoder** (`core/decoder/`): a k-means-style dit/dah threshold that follows the sender's own speed, splitting gaps into element, letter and word. Unit-tested against recorded timing fixtures.
- **Feedback:**
  - A timing ruler comparing *your* key-down/up against an ideal reference, with the error for each element.
  - A "fist" score: dah:dit ratio (target 3.0), gap consistency, speed drift.
  - Drills: send the character on screen; send a word; send what you just heard (echo).
- **Sidetone** with zero added latency (the worklet generates it), plus a latency calibration screen.

**Done when:** a typed reference sent at 15 WPM decodes with at least 98% accuracy in tests, and the fist metrics match hand-checked fixtures.

**How it turned out:**
- **Keyer:** `core/keyer.ts` is a pure iambic keyer stepped once per sample. It runs in an AudioWorklet, loaded from a Blob URL built from the class source, which works the same in dev and production with no extra file to deploy. The same worklet makes the sidetone for the straight key.
- **Keyer timing:** the decoder uses the worklet's exact key-down/up times, plus a heartbeat with the worklet's own time. Silence is only judged up to the last time the worklet reported, so a key-down still in flight can't be mistaken for a gap.
- **Decoder:** dit/dah threshold at 2 units, with a fast update plus a two-means correction over the last 24 marks. Letter gap 2.2 units, word gap 5 units. Tested at ≥98% on a 200-character human-timed reference (5 seeds, ±15% jitter, heavy dahs, loose gaps). It also adapts from a 25 WPM guess to a 15 WPM sender, and follows a 12→22 WPM speed-up.
- **Fist analysis:** fitted unit (least squares), dah ratio, gap ratios, evenness (coefficient of variation) and drift (first third against last third), scored 0–100. Hand-checked fixtures include heavy dahs, scored 72 from the worked arithmetic.
- **Inputs:** Space (straight), `[` `]` or Left/Right Ctrl (paddles; matches common USB paddle adapters), on-screen key and paddles (multi-touch), Web MIDI (first note = dit), Web Serial (CTS/DSR).
- **Drills:** free, character, word and echo. They draw from your course's characters (or all of them), and words fall back to random groups early in the course.
- **Latency:** shows the device's reported key-to-sound delay, with a Bluetooth warning and an 8-click tap-along timing check.

## Phase 5 — Learning pathway III: real-world copy ✅ done 2026-11-21

**Goal:** bridge from clean practice tones to the sound of a real band, and push speed well past 20 WPM.

- **Vocabulary:** the top 500 English words, the full set of CW abbreviations (`TNX`, `FB`, `OM`, `YL`, `HR`, `WX`, `ES`, `73`, `88` …), all the Q-codes in common use (`QTH`, `QRS`, `QRL?`, `QSB`, `QRZ?` …), RST reports, and callsigns built from real prefix tables.
- **Head copy:** play a word, then reveal it; no typing. Trains reading whole words by ear. Then whole phrases, then sentences.
- **Copy behind:** text shows up a set number of characters after it was sent, training you to hold a buffer in your head the way experienced operators do.
- **Human senders.** Every simulated station has its own "fist", generated from parameters: dah:dit ratio, timing jitter, swing, speed drift, a bug-style operator with machine-even dits and hand-sent dahs, sloppy letter spacing that runs characters together. Learning to read a bad fist is a separate skill and gets its own drills.
- **Band conditions** (the `audio/fx/` chain):
  - white or pink noise at an adjustable SNR, static crashes (QRN)
  - QSB fading, from slow to fast
  - QRM: one or more nearby stations at other pitches
  - chirp, key clicks, hum, drift, auroral flutter, multipath echo
- **Receiver skills:** a bandpass filter you can narrow, RIT, AGC on or off, and a **zero-beat trainer** (match your pitch to the incoming signal, which matters when replying).
- **QSO types:** a scripted but varied contact — CQ → reply → RST/name/QTH exchange → 73 — in three styles: a short DX exchange, a standard "rubber stamp" QSO (rig, antenna, weather), and an open-ended rag-chew. The other station adjusts its speed to yours and sends `QRS` when you struggle. Can be done receive-only, or with you sending your side on the key.
- **QRQ track** (high speed): instant character recognition drills, word-shape recognition at 30–50 WPM, and a speed ladder where the effective WPM rises with every success and falls back after mistakes.
- **Milestones:** 5 / 10 / 15 / 20 / 25 / 30 / 40 WPM copy certificates, generated as SVG.

**Done when:** a learner can copy a full rag-chew at 20 WPM through moderate noise and a poor fist, and the QRQ track runs cleanly at 50 WPM.

**How it turned out:**
- **Vocabulary:** 500 common words compiled for the app, 63 CW abbreviations, 25 Q-codes, phrases and sentences, and callsigns from a 28-country prefix table (UK regional prefixes included). Everything is checked as sendable.
- **Human senders:** `core/fist-model.ts`, with presets for steady, heavy dahs, rushed spacing, swing, bug, speeding up and beginner. A bug's dits are pendulum-exact. Farnsworth stretches each fist's own gaps.
- **Band:** `audio/band.ts` provides noise (white/pink), static crashes, two-rate fading, a neighbouring station, chirp, key clicks, hum, drift, flutter and echo. The receiver has a two-stage band-pass filter (2.4 k → 100 Hz, so narrowing really does lift the signal and cut the neighbour), RIT (which also moves the neighbour) and AGC.
- **Listen drills:** words, head copy, copy behind (a printer lagging N characters), fists (with a surprise sender), zero-beat, QRQ, and speed tests with SVG certificates.
- **QSO:** DX, standard and rag-chew styles. QRS on request slows the station for the rest of the contact. Your side is either sent for you or keyed by you, and checked for the essentials (callsigns, report, name).
- **Shared keying:** keying moved into `useKeying`, used by both Send and QSO.
- **The bar:** a full 20 WPM rag-chew with moderate noise and heavy dahs runs end to end in `npm run test:long`, and the QRQ test runs 20 instant characters at 50 WPM.

## Phase 6 — On the air: operating simulation ✅ done 2026-11-22

**Goal:** practise everything an operator actually does on the bands, against a believable simulated band.

- **The simulated band** (`src/radio/`):
  - A tuning dial and band map across 160–10 m, with stations at different offsets, each with its own callsign, pitch, speed, strength and fist.
  - A propagation model: time of day (UTC), the grey line, solar flux and K-index, different behaviour per band. Stations appear, fade and leave.
  - Activity that fits the situation: casual QSOs mid-week, crowded bands during a contest weekend, a DX station with a pileup on it.
- **Callsign trainer:** realistic callsign structure for every country, with portable/mobile/maritime suffixes (`/P`, `/M`, `/MM`, `/QRP`), special-event calls, and drills on calls that are easy to confuse.
- **Pileup trainer** (an original design): several callers at once at different pitches, speeds and strengths. Pick out one call, work partial calls (`K1?`, `AGN`), and run split ("UP 2"). Scored on rate and accuracy.
- **Contest simulator:**
  - Exchange formats for the main contest styles: RST + serial number; RST + CQ or ITU zone; RST + state/province; class + section (Field Day style); the long Sweepstakes-style exchange; the short weekly sprint (name + number).
  - Run mode (you call CQ) and search-and-pounce mode (you tune for stations).
  - Cut numbers (`5NN`, `T` = 0, `N` = 9, `A` = 1), dupe checking, function-key memories (F1 CQ, F2 exchange, F3 TU), multipliers, scoring and a live rate meter.
  - Short summaries of each real contest's rules, written in our own words.
- **Portable activations:** Parks- and Summits-on-the-Air–style operating, as activator or chaser: short low-power (QRP) exchanges with park or summit references, and the pileup that builds once you're spotted.
- **DX etiquette:** working split, listening up, `QRZ?`, `QSL via`, not calling over other stations, when to call and when to wait.
- **Nets and traffic handling:** checking into a CW net (QNI), net control procedure, and the full radiogram format (preamble, check, address, text, signature), sent and received.
- **Logbook:** every simulated QSO is logged. ADIF export and import, so you can bring in a real logbook and track real progress too. Award tracking (DXCC, WAS, WAZ-style) both in the simulation and for imported logs.
- **Real-world inputs:**
  - A real key or paddle through a USB adapter (Web Serial / Web MIDI).
  - An **off-air decoder**: microphone input fed to a tone-detect worklet (a Goertzel filter plus the Phase 4 adaptive decoder), so you can point it at a real receiver and check your own copy.

**Done when:** a learner can run a 30-minute simulated contest, work a pileup split, check into a net and pass a radiogram, with the results in an exportable log.

**How it turned out (the Shack, `#/shack`):**
- **Band:** all nine HF bands' CW segments (IARU Region 1). A propagation model covers daylight, solar flux, K-index, grey line, low-band absorption, and high bands skipping nearby stations. Three kinds of activity: quiet weekday, contest weekend, DX expedition. You can tune, spot callsigns onto the band map and call stations, with an S-meter, and the stations' pitch follows the dial.
- **Callsign trainer:** worldwide, UK regional prefixes, portable/special-event suffixes, and easily-confused calls (one character away, swapping letters that sound alike).
- **Pileup:** you're the DX. Partial calls (K1?) bring back only matching callers. In split, callers spread 1–3 kHz up and you tune your receiver to find them.
- **Contests:** seven styles (UK club sprint, serial+prefix, CQ zones, North America states, field day, sweepstakes, weekly sprint). Run or search-and-pounce, F1–F6, Enter steps through each contact, cut numbers, dupes, multipliers, points by continent, a rate meter and a timer. The engine is pure, and a whole 30-minute contest is simulated in a unit test.
- **Activations:** parks (10 to activate) and summits (4); activate with hunters piling in, or hunt the activators.
- **Nets and radiograms:** QST → QNI → QTC → traffic directed → radiogram passed and receipted (QSL) → net closed, either way round. Receiving a radiogram means copying it onto the message form, which is checked field by field and against the word count.
- **Etiquette:** 8 situations with explanations.
- **Logbook:** every simulated contact, ADIF 3 export and import (works with other programs' files), and DXCC/WAZ/WAS/WAC-style tallies, with CQ zones refined by call area for the USA, Canada and Australia.
- **Off-air decoder:** microphone → Goertzel tone detector worklet → an adaptive-threshold keyer (it learns the average noise floor while silent) → the adaptive decoder, with auto-tune to the strongest tone. Unit tests decode synthesised audio at 20 and 30 WPM through noise and stay silent on noise alone. Headless Chromium can't capture audio, so the browser test feeds it CW through a Web Audio stream standing in for the microphone.
- **Contest reports:** contests are 5NN all round; pileups and activations give real reports, which you copy.

## Phase 7 — Radio knowledge: reference, licensing, equipment and history ✅ done 2026-11-21

**Goal:** the background a serious CW operator knows, inside the same app and linked from the lessons.

- **Reference:** every Q-code, prosign and abbreviation; the RST system; IARU band plans for all three regions, with Region 1 / RSGB first (CW segments, QRP and QRS calling frequencies); UTC and time zones; station-ID rules. All searchable, and linked from wherever a term comes up.
- **Licensing (UK first):** Morse stopped being an exam requirement after WRC-03 (the UK dropped it in 2003), but the theory is still examined. The exam-prep track follows the UK system:
  - **Foundation → Intermediate → Full**, with the privileges, power limits and callsign series for each level. Check these against the current Ofcom licence and the RSGB syllabus while building, because both were revised in 2024.
  - The parts of the RSGB syllabus that matter most for CW: CW bandwidth, key clicks and chirp, filters, propagation, licence conditions, identification rules, operating practice.
  - UK callsign structure, including the regional secondary locators (G/M/2E for England, GM for Scotland, GW for Wales, GI for Northern Ireland, GD for the Isle of Man, GJ for Jersey and GU for Guernsey) and the `/P` and `/M` suffixes.
  - The RSGB band plan for IARU Region 1, highlighted first in the band-plan reference.
  - The RSGB's question bank is copyrighted, so every question is written for this app and checked against the published syllabus. Other countries (US, Canada, Australia …) come later as separate content packs; the US question pool is public domain and could be imported.
- **The UK operating scene:** UK CW contests (for example the RSGB 80 m Club Championship CW sessions), clubs and awards (FISTS, the G-QRP Club, CWops), and UK parks and summits schemes. These feed straight into the Phase 6 simulators: the simulated band defaults to a UK location and UK propagation, and the contest simulator includes UK exchange formats.
- **Keys and how they work:** interactive simulations of each type, so you can try them on the keyboard or a touch screen:
  - straight key
  - bug (semi-automatic, with the pendulum making the dits)
  - cootie / sideswiper
  - single- and dual-lever paddles, iambic A and B, ultimatic
- **The rig, explained:** a simplified interactive transceiver: VFO, BFO and sidetone pitch, filters, AGC, full QSK versus semi break-in, and power and QRP.
- **Other codes:**
  - American (railroad) Morse, with its internal spaces, long L and long zero, as heard on a landline sounder
  - Continental Morse, plus the alphabets for Wabun (Japanese), Cyrillic, Greek, Hebrew, Arabic and Korean
- **Other uses of Morse:**
  - Navigation beacon IDs (NDB/VOR): a decode trainer.
  - Light signalling: Aldis lamp and flashing light, with a visual-only copy mode.
  - Morse as an accessibility input method.
- **History:** an illustrated timeline: Morse and Vail, the 1844 line, railway and telegraph offices, maritime wireless, CQD and SOS, *Titanic*, the world wars, the end of commercial and maritime CW, and amateur radio today.

**Done when:** every term used anywhere in the app links to a reference entry, the UK Foundation, Intermediate and Full tracks cover the whole published syllabus, and every key simulator is finished.

**How it turned out (Radio, `#/radio`, loaded on first visit):**
- **Licence:** every item of the RSGB Combined Syllabus v1.6A (July 2024) at every level it appears: 371 item-level blocks across 213 items (Foundation 114, Intermediate 142, Full 115). Each has an original study note and at least one original question (about 400 in all), checked against Ofcom’s 2024 changes (25 W / 100 W / 1 kW, optional RSLs, any suffix, M8/M9, 500 mW airborne, supervision, internet remote control, Foundation 2.4/5 GHz at 2 W). There is study by section, adaptive practice (unseen and wrongly answered questions first), and timed mock exams with the real length, time, pass mark and questions per section (F 26 / 60 min / 19; I 46 / 90 / 28; Full 58 / 120 / 35). Results are saved in progress. A test checks coverage against a fixture of the syllabus’s item levels.
- **Glossary:** 127 hand-written radio, operating, licensing, propagation, safety and key terms, merged with the Q-code, prosign and abbreviation lists (about 220 entries). Searchable, filterable, and deep-linkable (`#/radio?tab=glossary&term=qsb`). Terms link automatically (once per block, case-aware) in lesson cards, licence notes and questions, etiquette scenarios, the rig, keys and history. A test checks that every acronym, Q-code and prosign in the content has an entry.
- **Keys:** straight key, bug (pendulum dits, hand dahs), cootie, single-lever, iambic A and B, and ultimatic. All run in the same sample-accurate worklet keyer. Each has a drawing whose levers move, a history and a live try-out with the decoder; all seven are also on the Send page. Unit tests cover the new keyer modes.
- **The rig:** a clickable block diagram of a CW superhet transceiver (a list of buttons on phones), a beat-note and filter demo, and a timeline of QSK against semi break-in.
- **Other codes:** American Morse (sounder voice; L, the long zero and internal gaps timed), Wabun with the DO/SN switch, Russian, Greek, Hebrew, Arabic and Korean (SKATS), with every character playable and text encoding. The tables come from Wikipedia.
- **Beacons and light:** VOR (1020 Hz) and NDB (400 Hz) ident trainer at 7 WPM; a sound-free signal lamp for copying by eye (capped at 7 WPM to keep the flashing gentle); Morse as an accessibility input method.
- **History:** 21 dated events, 1832–2024.

- **Band plans:** the CW parts of the HF band plans for the UK (RSGB, January 2026), IARU Region 1 (October 2020), Region 2 (September 2020) and Region 3 (R3-004, September 2019), read from the published documents. Each band shows a bar of its CW segments with QRP, QRS and beacon markers, the contest-free bands, and UK specifics (160 m edges, the 60 m channels).
- **UK scene:** RSGB contests with CW (80 m Club Championship, Autumn Series, AFS, 1.8 MHz, Commonwealth, UK/EI DX, National Field Day, IOTA), the clubs (FISTS, G-QRP, CWops) and portable schemes (SOTA, POTA, WWFF), each linked to its simulator in the Shack (`#/shack?tab=contest` and so on; the Shack's sub-pages are now linkable).
- **History** now has 24 events, each with a line drawing, including 1870 (the Post Office takes over the telegraphs) and both world wars (Room 40; the Voluntary Interceptors and Bletchley Park).
- **Term links everywhere:** every help paragraph on every screen links its terms, and a test checks that every acronym in the screens' own text, as well as the content, has a glossary entry (awards, net terms and VVV were added).

## Phase 8 — Polish and hand-off ✅ done 2026-11-21

**Goal:** finish the app and hand over a clean, self-contained project. The user creates the GitHub repo and integrates it into their Astro site on Netlify themselves; this plan doesn't cover that work.

- **Polish:**
  - Performance budget: under 150 KB of JS gzipped on first load; the ham-radio phases (5–7) load lazily; Lighthouse ≥ 95; a size check in `scripts/`.
  - i18n-ready strings (UK English first).
  - Onboarding: a 30-second first run (pick a goal: *translate* / *learn* / *get on the air*) that sets up the course.
  - A manual screen-reader pass (VoiceOver), a touch-device check, and an audio latency check on iOS Safari.
  - Docs: a README, ARCHITECTURE.md, and a content guide for adding lessons, word lists, contests and callsign data.
- **Ready for Astro and Netlify** (built in from Phase 0, checked here):
  - **Hash-based routing** (`#/learn`, `#/qso`), so the app works on any static host at any sub-path with no Netlify redirect rules.
  - A **configurable `base`** (`MC_BASE=/morse/ npm run build`), and every asset path relative to it.
  - **Preact**, which Astro supports directly (`@astrojs/preact`). That leaves two clean options for the user: copy `dist/` into the site's `public/morse/` folder, or mount the root component as an island with `client:only="preact"`.
  - A **library entry point** (`src/embed.ts`) exporting `mount(el, options)`, used by either option.
  - Scoped `--mc-*` tokens and the host-theme hook from Phase 2, so the site's light/dark toggle can drive the app.
  - No `SharedArrayBuffer` or cross-origin-isolation headers needed, so Netlify works without custom headers.
  - The service worker is optional and off by default when embedded, so it can't claim scope over the rest of the site.
  - Progress export/import (JSON), because IndexedDB is stored per origin and progress from `localhost` doesn't carry across to the live site by itself.
- **HANDOFF.md:** build commands, environment options, both Astro integration recipes with code snippets, browser-support notes, and a checklist for the first push.

**Done when:** `npm run build` produces a static bundle that works from a sub-path and through `mount()`, every test passes, and HANDOFF.md is written.

**How it turned out:**
- **Performance:** Listen, QSO, Shack and Radio load on first visit, each as its own chunk. First load is about 72 KB gzipped (was 113), and `scripts/check-size.mjs` fails the build above 150 KB. Lighthouse couldn't be run in this environment; HANDOFF.md has the command.
- **Onboarding:** a first-run welcome on the standalone page's home: translate, learn (pick a starting speed, which sets up the course) or get on the air (callsign and name saved; licensed goes to the Shack, not yet to the licence course). Shown once, never over a shared link, and off when embedded unless asked for.
- **i18n-ready:** the shell and onboarding read their strings through `t()` from a UK English catalogue (`src/app/i18n.ts`), replaceable with `mount(el, { messages })`. Screen text is still inline; ARCHITECTURE.md says how to move a screen over.
- **Accessibility:** automated checks on all 17 screens and tabs (every control named, form fields labelled, no duplicate ids, one main heading, `lang="en-GB"`). The manual VoiceOver, touch-device and iOS latency checks are listed in HANDOFF.md for doing on real devices.
- **Hand-off:** an embeddable library build (`npm run build:lib`), a `MorseCode` component for Astro islands, an optional offline service worker scoped to the app's folder (on for the standalone page only), and HANDOFF.md with three ways onto the Astro site, plus ARCHITECTURE.md and CONTENT.md. An `embed` test project serves the build under `/morse/`, mounts the library in a host page (theme, lazy screens, clean unmount) and checks offline use.

---

## Order of work and why

1. **Phase 0 → 1 first.** Everything later (paddles, decoder, noise, simulated band) relies on a tested core and a look-ahead audio scheduler. Doing the visuals first would mean building them twice.
2. **Phase 2 before the learning screens** so every later screen is built from the design system from the start rather than restyled afterwards.
3. **Phases 3 → 6** follow the order a learner needs: recognise, then send, then copy in real conditions, then operate.
4. **Phase 7** can partly run alongside 5 and 6: its reference content is data in `content/` and can be written while the simulators are built.
5. **Phase 8 last.** Most of the Astro/Netlify readiness is built in from Phase 0, so Phase 8 only checks it and writes the hand-off notes.
6. Each phase ends in a working app that runs locally. None of them leaves things half-built.

## Open questions

None at the moment. All the decisions are recorded at the top of this file.
