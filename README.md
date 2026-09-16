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
- **Importing a Goethe word list is optional and needs a computer.** Skip it —
  the app works fully without one.
- **Four ways to study:** a unit's drills, the spaced-repetition review queue,
  a 10-item daily test weighted toward your recent mistakes, and a 60-item
  level test at the end of each level. Anything you get wrong in a test is
  queued back into review.

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
  import-goethe.ts     learner-only, local; → goethe-levels.json   [phase 6]
```

Run the whole thing (the kaikki dump is ~1 GB, so the fetch takes a while):

```bash
npm run data:fetch     # → raw/ (gitignored) + raw/MANIFEST.json
npm run data:build     # lexicon → sentences → grammar → exercises → validate
```

What it currently produces:

| Output | Contents |
|---|---|
| `data/lexicon.json` | 3,000 lemmas with gender, plural, forms, glosses, provenance |
| `data/sentences.json` | 8,286 sentences, 99.8% native-authored, 100% lemma coverage |
| `data/grammar/*.md` | 69 topics — 42 excerpted from Wikibooks, 27 honest stubs |
| `data/exercises/*.json` | 4,139 items across 35 units, 12 exercise types |

Total 10.6 MB, against the 15 MB budget.

Sources: [kaikki.org](https://kaikki.org/dictionary/German/) (Wiktionary,
CC BY-SA), [Tatoeba](https://tatoeba.org/en/downloads) (CC BY 2.0 FR / CC0),
[Wikibooks: German](https://en.wikibooks.org/wiki/German) (CC BY-SA).

Lemmatisation is a rule-based lookup against Wiktionary form tables. No ML
lemmatiser is used, because a model could introduce data that has no source. A
sentence that cannot be fully lemmatised is dropped rather than guessed at.

## Goethe level lists

The Goethe-Institut Wortlisten are the best public standard for which words
belong to A1, A2 and B1 — and they are **copyrighted compilations**. So:

1. You download the Wortlisten PDFs yourself from
   [goethe.de](https://www.goethe.de/de/spr/kup/prf/prf.html).
2. In a clone of this repo, install the dependencies **once** — the importer
   runs through `tsx`, which lives in `node_modules`:
   ```bash
   npm install
   ```
3. Run the importer on your own machine:
   ```bash
   npm run data:goethe -- A1.pdf A2.pdf B1.pdf
   ```
   Pass all three lists if you have them. The B1 Wortliste repeats the A1 and
   A2 vocabulary, so importing it alone marks every word B1; with all three,
   each word takes the lowest level it appears at.

   It writes `goethe-levels.json`, which is gitignored. Useful flags:

   | Flag | What it does |
   |---|---|
   | `--preview` | Report what it found, write nothing |
   | `--level B1` | Set the level when the filename doesn't say |
   | `--out <path>` | Write somewhere other than the repo root |
   | `--text` | Dump the raw PDF lines, to debug a layout it misreads |

4. In the app, open **Settings → Import level list** and load that file. It
   goes into IndexedDB on that device and is never uploaded anywhere. Levels
   across the app — unit vocabulary, the words-known counts, the dictionary —
   switch from approximate to the imported ones immediately.

The parser does not assume a fixed page layout, since the PDFs cannot be
checked in as fixtures. It measures the document, scores each column by how
often the word at that position is a lemma the course already knows, and picks
the columns that actually look like a word list — then reports the match rate
and a sample so you can check it before trusting the result. If it gets a
layout wrong, `--text` shows the raw lines.

Nothing Goethe-derived is committed to this repository or served from Pages.
`.gitignore` blocks the filenames and `validate-data.ts` fails the build if a
committed lemma carries `levelSource: "goethe-import"`.

**Without a list**, vocabulary is ordered by frequency over the Tatoeba German
corpus — CC BY data already bundled here — and the app labels levels
**approximate**. No openly licensed German frequency list was found whose
terms clearly permit redistribution, so none is bundled. The scoring method
and its one known artefact are written up in
[DATA_LICENSES.md](DATA_LICENSES.md#how-levels-were-decided-and-how-good-they-are).

## Your data

Everything the app knows about you lives in IndexedDB on your device: review
history, unit progress, mistakes, settings. There is nowhere else for it to go.

**Settings → Export progress** writes a JSON backup; **Import progress**
restores it. The backup deliberately excludes the Goethe level list, so it can
move between devices without carrying copyrighted material along.

## Tech

Vite + TypeScript + Preact, plain CSS with custom properties, `ts-fsrs` for
scheduling, `idb` for storage, `vite-plugin-pwa` for offline. Vitest and
Playwright for tests. The production bundle is ~16 kB gzipped.

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
