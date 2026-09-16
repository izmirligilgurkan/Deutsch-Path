# Deutsch bis B1

An offline-capable, mobile-first trainer that takes a complete beginner to
**CEFR B1 in German grammar and vocabulary**. Reading, writing, drilling and
testing only — no audio, no speaking, no accounts, no ads.

It is a static site. There is no backend, no API key, and **no AI at runtime**.

> **Status: phase 5 (course complete).** The whole course runs on a phone:
> placement, 35 units with sourced explanations, drills and unit tests, level
> tests, a daily quick test, an FSRS vocabulary trainer, a dictionary and a
> progress view. See [Build phases](#build-phases).

## Using it on your phone

Nothing to install and no account. Open:

**<https://izmirligilgurkan.github.io/Deutsch-Path/>**

Then:

1. Tap **Get started**, then **Start from zero** — or **Placement test** if you
   already know some German, which unlocks units up to the level you show.
2. Add it to your home screen so it opens full-screen and works offline —
   on iOS: **Share → Add to Home Screen**; on Android: **⋮ → Install app**.
   The app shows these steps for your device on the home screen.
3. Tap **Continue unit** to read the explanation and start drilling.

A few things worth knowing:

- **Everything stays on your phone.** Progress lives in the browser's own
  storage. There is no server and no sign-in, so clearing site data erases it —
  use **Settings → Export progress** for a backup.
- **It works offline** after the first visit, including on a plane.
- **The umlaut row** above the keyboard types ä ö ü ß. In practice you can also
  write `ae oe ue ss` and it is accepted; tests are strict.
- **Answers are case-sensitive** by default, because German capitalises nouns.
  Turn that off in Settings if you would rather not.
- **Levels come from the Goethe Wortlisten.** 2,798 of the 3,277 words are
  tagged A1 / A2 / B1 from the official exam lists; the rest are estimated from
  corpus frequency and labelled *approximate*. Nothing to import — it ships
  with the app.
- **Four ways to study:** a unit's drills, the spaced-repetition review queue,
  a 10-item daily test weighted toward your recent mistakes, and a 60-item
  level test at the end of each level. Anything you get wrong in a test is
  queued back into review.

## How it teaches

Practice runs as a ladder — recognise a word, then complete a sentence that
supports you, then produce it unaided — and answering a sentence opens a
word-by-word breakdown of it: every word's meaning and the form it is in.
The method, the research behind it and the gaps that remain are written up in
[TEACHING.md](TEACHING.md).

## The content rule

Every German word, gloss, example sentence and grammar explanation in this app
comes from a public, human-authored source and carries a `source`, a source
reference and a `license`. None of it is model-generated, and none of it is
written by hand here.

`scripts/validate-data.ts` enforces this in CI. The build fails if any record
lacks provenance, uses a licence outside the allowlist, or — for a cloze — has
an answer that does not appear verbatim in its source sentence.

See [DATA_LICENSES.md](DATA_LICENSES.md) for the full register.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173/Deutsch-Path/
```

Other commands:

```bash
npm run build      # typecheck + production build into dist/
npm run typecheck
npm test           # Vitest unit tests
npm run test:e2e   # Playwright smoke test at a phone viewport
npm run data:validate
```

The Vite `base` is `/Deutsch-Path/`, matching the GitHub Pages path, so the dev
server serves from that prefix too.

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`dist/` to GitHub Pages. Data validation runs before the build, so a licensing
or sourcing violation blocks the deploy.

**One-time repository setup:** *Settings → Pages → Build and deployment →
Source: **GitHub Actions***. Until that is switched on, the deploy job fails at
the `configure-pages` step.

The site then lives at
`https://izmirligilgurkan.github.io/Deutsch-Path/`.

Routing is hash-based (`#/settings`), because GitHub Pages has no rewrite rules
and a path-based deep link would 404 on a hard refresh.

## Offline

`vite-plugin-pwa` generates a service worker that precaches the app shell and
runtime-caches `data/`. After the first visit the app works in airplane mode.
Updates use a prompt rather than auto-reload, so a new build never swaps out
mid-drill.

## Data pipeline

The pipeline runs **locally, never in the browser**. Raw dumps land in `raw/`
(gitignored); only trimmed output is committed, under a 15 MB budget.

```
scripts/
  fetch-sources.ts     downloads raw dumps, records URL + SHA-256  ✅
  build-lexicon.ts     kaikki JSONL → data/lexicon.json            ✅
  build-sentences.ts   Tatoeba → data/sentences.json               ✅
  build-grammar.ts     Wikibooks → data/grammar/<topic>.md         ✅
  build-exercises.ts   templates × lexicon × sentences             ✅
  validate-data.ts     fails CI if any sourcing rule is broken     ✅
  make-icons.mjs       regenerates public/icons/*.png              ✅
  build-goethe.ts      Wortliste PDFs → data/goethe-levels.json    ✅
```

Run the whole thing (the kaikki dump is ~1 GB, so the fetch takes a while):

```bash
npm run data:fetch     # → raw/ (gitignored) + raw/MANIFEST.json
npm run data:build     # lexicon → sentences → grammar → exercises → validate
```

What it currently produces:

| Output | Contents |
|---|---|
| `data/lexicon/*.json` | 3,277 lemmas with gender, plural, forms, glosses, provenance |
| `data/sentences/*.json` | 8,434 sentences, 97.6% native-authored, 97.4% lemma coverage |
| `data/grammar/*.md` | 69 topics — 42 excerpted from Wikibooks, 27 honest stubs |
| `data/exercises/*.json` | 4,113 items across 35 units, 12 exercise types |
| `data/goethe-levels.json` | 3,277 words tagged A1 / A2 / B1 from the Goethe Wortlisten |

Total 10.8 MB, against the 15 MB budget.

Sources: [kaikki.org](https://kaikki.org/dictionary/German/) (Wiktionary,
CC BY-SA), [Tatoeba](https://tatoeba.org/en/downloads) (CC BY 2.0 FR / CC0),
[Wikibooks: German](https://en.wikibooks.org/wiki/German) (CC BY-SA).

Lemmatisation is a rule-based lookup against Wiktionary form tables. No ML
lemmatiser is used, because a model could introduce data that has no source. A
sentence that cannot be fully lemmatised is dropped rather than guessed at.

## Goethe level lists

Which words belong to A1, A2 and B1 comes from the **Goethe-Institut
Wortlisten** — the published vocabulary lists for the Goethe-Zertifikat exams.
`data/goethe-levels.json` maps 3,277 headwords to a level (A1 700, A2 691,
B1 1,886), extracted from the three official PDFs. It is committed, so the app
ships with real exam levels and there is nothing for you to import.

Only headwords and levels are taken — no glosses, example phrases or layout
from the lists. 2,798 of the course's lemmas match an entry and carry
`levelSource: "goethe-wortliste"`. The remaining 479 fall back to corpus
frequency over the Tatoeba German sentences and carry
`levelSource: "frequency-approx"`; the app labels those levels **approximate**.

The Wortlisten are copyrighted compilations and the Goethe-Institut grants no
redistribution licence. Bundling the extraction here was the repository owner's
decision, recorded in
[DATA_LICENSES.md](DATA_LICENSES.md#goethe-institut-wortlisten-a1--a2--b1). If
you fork this repository, that decision does not transfer: delete
`data/goethe-levels.json` and re-run `npm run data:build` to fall back to
frequency levels.

### Rebuilding the mapping

```bash
npm install                                    # once — the script runs via tsx
npm run data:goethe -- A1.pdf A2.pdf B1.pdf    # → data/goethe-levels.json
```

Pass all three lists. The B1 Wortliste repeats the A1 and A2 vocabulary, so
importing it alone marks every word B1; with all three, each word takes the
lowest level it appears at. The PDFs themselves stay gitignored.

The parser measures the page rather than assuming a layout: it finds the text
columns by x-position, keeps the ones whose lines are alphabetically ordered
(the headword columns, recovered with a longest-increasing-subsequence pass so
that continuation lines do not break the run), and reads the whole entry line
rather than its first token — `die Ansage, -n` is the word *Ansage*, not *die*.
Thematic groups that are not alphabetical are picked up separately by their
`der/die/das` entries. It reports per-level counts against the published list
sizes so a bad read is visible. `--preview` reports without writing, `--text`
dumps raw lines.

### Overriding on a device

**Settings → Import level list** still accepts a `goethe-levels.json` on the
device, which overrides the bundled mapping in IndexedDB. It is there if you
want to re-level the course yourself; the app is complete without it.

## Your data

Everything the app knows about you lives in IndexedDB on your device: review
history, unit progress, mistakes, settings. There is nowhere else for it to go.

**Settings → Export progress** writes a JSON backup; **Import progress**
restores it. The backup holds your progress only — not the word lists, which
ship with the app.

## Tech

Vite + TypeScript + Preact, plain CSS with custom properties, `ts-fsrs` for
scheduling, `idb` for storage, `vite-plugin-pwa` for offline. Vitest and
Playwright for tests. The app shell is ~39 kB gzipped.

Preact over React: same API, a fraction of the bytes, and this app runs on a
phone.

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold: app, PWA, routing, IndexedDB, Pages deploy | ✅ |
| 2 | Data pipeline, validation, licences | ✅ |
| 3 | Vocabulary SRS: card types, FSRS, answer checking | ✅ |
| 4 | Units: sourced explanations, drills, unit tests | ✅ |
| 5 | Level tests, daily test, placement test | ✅ |
| 6 | Dashboard, mistake log, weakness view, export/import, attributions | ✅ |
| 7 | Test coverage, mobile smoke test, Lighthouse PWA pass | partly |

See [SYLLABUS.md](SYLLABUS.md) for the 35 units and their grammar topic ids.

## Licensing

- **Code:** MIT — see [LICENSE](LICENSE).
- **`data/`:** CC BY-SA 4.0, as share-alike requires — see
  [data/LICENSE](data/LICENSE) and [DATA_LICENSES.md](DATA_LICENSES.md).
- **`data/goethe-levels.json` is the exception**: extracted from the
  copyrighted Goethe-Institut Wortlisten and carrying no redistribution
  licence. Delete it if you fork this and want a cleanly licensed `data/`.
