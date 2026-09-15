# Deutsch bis B1

An offline-capable, mobile-first trainer that takes a complete beginner to
**CEFR B1 in German grammar and vocabulary**. Reading, writing, drilling and
testing only — no audio, no speaking, no accounts, no ads.

It is a static site. There is no backend, no API key, and **no AI at runtime**.

> **Status: phase 1 of 7 (scaffold).** The app shell, routing, storage layer,
> PWA and deployment are in place. Course content, the SRS trainer and the
> grammar units come in later phases — see [Build phases](#build-phases).
> Screens that are not built yet say so rather than showing placeholder German.

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
  fetch-sources.ts     downloads raw dumps, records URL + date     [phase 2]
  build-lexicon.ts     kaikki JSONL → data/lexicon.json            [phase 2]
  build-sentences.ts   Tatoeba CSV → data/sentences.json           [phase 2]
  build-grammar.ts     Wikibooks → data/grammar/<topic>.md         [phase 2]
  build-exercises.ts   templates × lexicon × sentences             [phase 2]
  import-goethe.ts     learner-only, local; → goethe-levels.json   [phase 6]
  validate-data.ts     fails CI if any sourcing rule is broken     ✅ done
  make-icons.mjs       regenerates public/icons/*.png              ✅ done
```

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
2. You run the importer on your own machine:
   ```bash
   npm run data:goethe -- ~/Downloads/Goethe-Zertifikat_A1_Wortliste.pdf
   ```
   It writes `goethe-levels.json`, which is gitignored.
3. In the app, open **Settings → Import level list** and load that file. It
   goes into IndexedDB on that device and is never uploaded anywhere.

Nothing Goethe-derived is committed to this repository or served from Pages.
`.gitignore` blocks the filenames and `validate-data.ts` fails the build if a
committed lemma carries `levelSource: "goethe-import"`.

**Without a list**, vocabulary is ordered by corpus frequency and the app
labels levels **approximate**. The licence of the frequency list is still an
open question — see the note at the end of DATA_LICENSES.md.

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
| 2 | Data pipeline, validation, licences | next |
| 3 | Vocabulary SRS: card types, FSRS, answer checking | |
| 4 | A1 units: sourced explanations, drills, unit tests | |
| 5 | A2 and B1 units, level tests, placement test | |
| 6 | Dashboard, mistake log, weakness view, export/import, attributions | partly |
| 7 | Test coverage, mobile smoke test, Lighthouse PWA pass | partly |

See [SYLLABUS.md](SYLLABUS.md) for the 35 units and their grammar topic ids.

## Licensing

- **Code:** MIT — see [LICENSE](LICENSE).
- **`data/`:** CC BY-SA 4.0, as share-alike requires — see
  [data/LICENSE](data/LICENSE) and [DATA_LICENSES.md](DATA_LICENSES.md).
