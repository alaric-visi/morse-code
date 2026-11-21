# Content guide

Everything the app teaches or simulates is data in `content/`, so most additions need no code. Each JSON file has an `about` line saying what it's for. After any change, run `npm run check`: the unit tests check the content's shape and coverage.

Write in UK English, in your own words. Don't paste text from books, the RSGB question bank or other sites.

## Lessons (teaching cards)

- One Markdown file per card in `content/courses/lessons/`, for example `sos.md`.
- The format is a small subset: `# Title`, `## Heading`, paragraphs, `- ` lists, `**bold**` and `*italic*`. Nothing else is rendered, and no HTML gets through.
- List the card in `content/courses/cards.json` with the lesson at which it unlocks: `{ "id": "sos", "lesson": 16 }`.
- Terms in the text (QSB, zero beat, the Koch method…) link to the glossary automatically. If you use a new abbreviation, add it to the glossary, or the glossary test will fail and name it.

## The Koch order

`content/courses/koch.json` holds `order`: the characters in teaching order. Lesson 1 teaches the first two; each lesson after that adds one.

## Word lists

`content/words/`:
- `common.json` and `top500.json`: `words`, for sending and copy drills.
- `phrases.json`: `phrases`, for head copy and copy behind.
- `abbreviations.json` and `qcodes.json`: `items` as `[term, meaning]` pairs. These feed both the drills and the glossary.

Use capitals and only characters Morse can send (letters, digits and `. , ? / = + -`).

## Glossary

`content/reference/glossary.json` → `entries`:

```json
{ "term": "zero beat", "cat": "Radio", "short": "One sentence.", "more": "Optional detail.", "aka": ["zero-beat"], "see": ["BFO"], "phrase": true, "link": true }
```

- `cat` is one of: Morse, Keys, Radio, Propagation, Operating, Licensing, Safety and EMC. Q-codes, prosigns and abbreviations come in from the word lists and `content/alphabets/prosigns.json`.
- Terms with capitals (QSB, ERP) link only with that exact case; all-lowercase terms (balun) also link when capitalised at the start of a sentence.
- Set `"link": false` for a word that's also ordinary English (net, split, primary), so it's listed but not linked everywhere.

## UK licence

`content/licence/s1.json` … `s9.json`, one file per syllabus section:

```json
{ "id": "4E2", "topic": "SWR meters", "levels": {
  "F": { "note": "Study note.", "q": [{ "text": "Question?", "choices": ["Right answer", "Wrong", "Wrong", "Wrong"], "why": "Explanation." }] },
  "I": { … }, "Full": { … } } }
```

- The **first choice is always the right answer**; the app shuffles them on screen. Four choices, all different.
- An item appears only at the levels where the RSGB syllabus has it. `tests/fixtures/syllabus-levels.json` records which those are (from the Combined Syllabus v1.6A); when the RSGB publishes a new syllabus, update that fixture first and the test will show what to change.
- Exam lengths, times, pass marks and questions per section are in `src/reference/licence.ts` (`LEVEL_INFO`, `ALLOCATION`).

## Band plans

`content/reference/bandplans.json` → `regions[].bands[]`:

```json
{ "band": "20m", "edges": [14000, 14350], "cw": [[14000, 14060, "CW, contest preferred"], [14060, 14070, "CW"]],
  "qrp": 14060, "qrs": 14055, "beacons": [14099, 14101], "noContests": false, "note": "Optional." }
```

All frequencies in kHz. Give each region's `source` (document and date) so readers know how current it is.

## Contests and activations

`content/contests/contests.json` → `contests[]`, each with `id`, `name`, `kind` (`contest`, `activation` or `pileup`), `exchange` (fields from `rst`, `serial`, `zone`, `state`, `class`, `section`, `prec`, `call`, `check`, `name`, `number`, `location`), `callers`, `mult` (`none`, `prefix`, `zone`, `state`, `section`, `call`), `points` (`one`, `two`, `three`, `continent`) and a `summary` in your own words. The engine is `src/learn/contest.ts`; a new exchange field needs code there.

## Callsigns

`content/callsigns/prefixes.json` → `countries[]`: `country`, `prefixes`, `suffix` (length range), `cities`, CQ `zone` and `continent`. `regions.json` has US states, Canadian provinces, ARRL sections and Field Day classes. Countries that span several CQ zones are refined by call area in `src/learn/zones.ts`.

## QSOs, nets and etiquette

- `content/qso/details.json`: the names, rigs, powers, antennas and weather the simulated stations use.
- `content/procedure/etiquette.json` → `scenarios[]`: `situation`, `choices`, `answer` (index of the right choice) and `why`.

## Other codes

`content/codes/variants.json` → `codes[]`: `chars` as `[character, code, latin?]`. Codes use `.` and `-`. For American Morse, a space inside a code is the long inner gap, `_` is the long dash (L) and `=` the extra-long dash (0), and `timing` gives the lengths in units.

## History and the UK scene

- `content/reference/history.json` → `events[]`: `year`, `title`, `text`, and `icon` (one of the drawings in `src/features/radio/History.tsx`). Keep them in date order; a test checks.
- `content/reference/uk-scene.json` → `groups[].items[]`: `name`, `when`, `text`, an optional `url`, and an optional `try` (a Shack tab such as `contest` or `activations`) to link to the simulator.

Dates and figures should come from the organisers' own pages, and anything that changes from year to year (contest dates and times) should say so.
