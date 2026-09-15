# Data licences

Every dataset bundled in `data/` is recorded here with its licence, what this
project takes from it, and what was changed. `scripts/validate-data.ts`
enforces the rules below in CI: a record without a source, or with a licence
outside the allowlist, fails the build.

**Status:** the pipeline has been run. Each licence below was read from the
source itself on 2026-09-15; the quoted wording is what that page states.

## Allowlist

Only these licence identifiers may appear in `data/`:

| Identifier | Licence |
|---|---|
| `CC-BY-SA-4.0` | Creative Commons Attribution-ShareAlike 4.0 |
| `CC-BY-SA-3.0` | Creative Commons Attribution-ShareAlike 3.0 |
| `CC-BY-2.0-FR` | Creative Commons Attribution 2.0 France |
| `CC0-1.0` | Creative Commons Zero 1.0 |

Anything else is a build failure.

## What is bundled

| File | Records | Size |
|---|---|---|
| `data/lexicon.json` | 3,000 lemmas | ~5.3 MB |
| `data/sentences.json` | 8,286 sentences | ~3.5 MB |
| `data/grammar/*.md` | 69 topics (42 sourced, 27 stubs) | ~0.4 MB |
| `data/exercises/*.json` | 4,139 items across 35 units | ~1.4 MB |

## Source snapshots

The raw dumps live in `raw/` (gitignored) and are recorded in
`raw/MANIFEST.json` with a SHA-256 and a download date, so any committed record
can be traced to a dated snapshot.

| Local file | Source | Size | SHA-256 | Downloaded |
|---|---|---|---|---|
| `kaikki-german.jsonl` | [kaikki.org German](https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl) | 1026.8 MB | `e1f300c9ac9498e6…` | 2026-09-15 |
| `deu_sentences_detailed.tsv.bz2` | [Tatoeba German](https://downloads.tatoeba.org/exports/per_language/deu/deu_sentences_detailed.tsv.bz2) | 16.8 MB | `a75fa866ba30d773…` | 2026-09-15 |
| `eng_sentences_detailed.tsv.bz2` | [Tatoeba English](https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2) | 33.3 MB | `40283f993461d457…` | 2026-09-15 |
| `deu-eng_links.tsv.bz2` | [Tatoeba links](https://downloads.tatoeba.org/exports/per_language/deu/deu-eng_links.tsv.bz2) | 3.4 MB | `907fa5cdf67f1c19…` | 2026-09-15 |
| `user_languages.tar.bz2` | [Tatoeba user languages](https://downloads.tatoeba.org/exports/user_languages.tar.bz2) | 0.8 MB | `864d9e2c26e6b5c8…` | 2026-09-15 |
| `sentences_CC0.tar.bz2` | [Tatoeba CC0 list](https://downloads.tatoeba.org/exports/sentences_CC0.tar.bz2) | 7.6 MB | `440545f75058a427…` | 2026-09-15 |

## Bundled sources

### Wiktionary via kaikki.org (wiktextract)

- **URL:** <https://kaikki.org/dictionary/German/>
- **Upstream:** English Wiktionary, <https://en.wiktionary.org/wiki/Wiktionary:Copyrights>
- **Licence:** ✅ **verified 2026-09-15.** kaikki.org states: *"This data is made
  available under the same licenses as Wiktionary — both CC-BY-SA and GFDL."*
  Recorded on each record as `CC-BY-SA-4.0`.
- **Used for:** lemmas, part of speech, gender, plural, inflection tables,
  English glosses, verb principal parts.
- **Modifications:** filtered from 371,261 entries to the 3,000 the course
  teaches; form tables trimmed to the forms the drills use (see below); no text
  rewritten. Each lemma's `sourceUrl` points at its Wiktionary page.
- **Share-alike:** satisfied by `data/LICENSE` (CC BY-SA 4.0).

What was dropped from the form tables, and why:

| Dropped | Reason |
|---|---|
| `multiword-construction` | Perfekt, Plusquamperfekt and Futur are built from the principal parts and the auxiliary, both of which are stored. |
| `includes-article` | Repeats the adjective with its article attached; the app composes that itself. |
| `subjunctive-i` | Konjunktiv I is outside the A1–B1 syllabus. |
| obsolete / archaic / rare / poetic / dialectal / regional | Not current standard German. |
| `..es`, `..en` | wiktextract's table abbreviations for long headwords, not real forms. |

### Tatoeba

- **URL:** <https://tatoeba.org/en/downloads>
- **Licence:** ✅ **verified 2026-09-15.** Tatoeba states: *"These files are
  released under CC BY 2.0 FR"* and *"A part of our sentences are also
  available under CC0 1.0."* Each sentence therefore records its **own**
  licence: `CC0-1.0` when its id appears in the CC0 export, otherwise
  `CC-BY-2.0-FR`. The German and English halves are licensed independently.
- **Used for:** German example sentences with English translations, used
  verbatim in cloze, word-order, article-case and error-spotting drills.
- **Modifications:** **none to the sentence text.** Sentences are only
  *selected*. Every record keeps `tatoebaId`, `author` and `sourceUrl` so the
  app can attribute it, as CC BY requires.
- **Selection rules:** the sentence has an English translation; every one of
  its tokens resolves to a lemma by Wiktionary form-table lookup (233,563 of
  780,494 German sentences did); its length is close to a per-level target;
  sentences by contributors who declare German as a native language are
  preferred (8,268 of the 8,286 kept are native-authored).

### Wikibooks: German

- **URL:** <https://en.wikibooks.org/wiki/German>
- **Licence:** ✅ **verified 2026-09-15.** Every page footer states: *"Text is
  available under the Creative Commons Attribution-ShareAlike License."*
  Recorded as `CC-BY-SA-4.0`.
- **Used for:** the grammar explanation on each topic — 42 of 69 topics.
- **Modifications:** excerpted (capped at ~6,000 characters), converted from
  HTML to Markdown, headings shifted down one level, navigation and edit links
  removed. No text rewritten. Every file carries front matter with `source`,
  `sourcePage`, `sourceUrl`, `sourceRevision`, `license` and `modified`, and
  links back to the page.
- **Topics with no source:** 27 of 69. Wikibooks has no page covering them at
  the depth this course needs — the passive voice, Konjunktiv II,
  Plusquamperfekt, relative clauses, the n-Deklination and others. Those files
  are **stubs**: they say plainly that no openly licensed explanation was
  available and link out for further reading. Nothing was written to fill the
  gap.

## Linked, never copied

Referenced from grammar topics as "further reading". No text, table or exercise
from them is copied into this repository.

- Lingolia — <https://deutsch.lingolia.com/de/grammatik>
- mein-deutschbuch.de — <https://mein-deutschbuch.de/grammatik.html>
- Schubert Verlag online exercises — <https://www.schubert-verlag.de/>
- DWDS — <https://www.dwds.de/>
- Duden — <https://www.duden.de/>

## Excluded on purpose

### Goethe-Institut Wortlisten (A1 / A2 / B1)

- **URL:** <https://www.goethe.de/de/spr/kup/prf/prf.html>
- **Licence:** copyrighted compilations. **Not redistributable.**
- **Therefore:** no Goethe-derived file is committed to this repository or
  served from GitHub Pages, in any form — not the PDFs, not an extracted word
  list, not a lemma→level mapping.
- **How levels work instead:** see below. The learner may download the PDFs
  themselves and run `npm run data:goethe` locally; the output
  `goethe-levels.json` is gitignored and is loaded into IndexedDB on that
  device through the *Import level list* screen.
- **Enforcement:** `.gitignore` blocks the filenames, and
  `validate-data.ts` fails the build if a committed lemma carries
  `levelSource: "goethe-import"` or if a `goethe-levels.json` appears in
  `data/`.

### CEFR descriptors and Goethe exam specifications

Used as a *reference* while writing `SYLLABUS.md` to check the scope of each
level. No text is copied.

## How levels were decided, and how good they are

No German frequency list was found whose licence clearly permits
redistribution, so — as agreed — ordering falls back to **corpus frequency over
the Tatoeba German sentences**, which are CC BY data already bundled here.
Every lemma carries `levelSource: "frequency-approx"` and `freqRank`, and the
app labels these levels **approximate**.

Bands are sized to match the scale of the Goethe Wortlisten so that importing a
real list later moves words between levels rather than changing the course
size: **A1** ranks 1–650, **A2** 651–1650, **B1** 1651–3000.

Scoring is a deterministic count, not a model:

1. Each lemma's single-word forms are indexed from its Wiktionary form table.
2. Tokens are counted across all 780,494 German sentences, **case-sensitively**,
   skipping each sentence's first token (German capitalises it whatever its
   word class, so it cannot distinguish the noun `Ich` from the pronoun `ich`)
   and skipping Tatoeba's placeholder names (Tom, Maria), which say more about
   the corpus than about German.
3. A form matching exactly one lemma credits it in full.
4. A form matching several is split **in proportion to each lemma's unambiguous
   evidence**, so a rare homograph cannot inherit a common word's frequency.

### Known limitation

Step 4 cannot fully separate two lemmas that share their *whole* paradigm.
Resolving those needs a part-of-speech-tagged corpus, and the project rules out
model-generated data, so the ambiguity is left in rather than guessed at.

The clearest surviving artefact: **`einen` ("to unite") ranks far higher than
its real frequency**, because every form it has is also a form of the article
`ein`. It is a real German verb with a real Wiktionary entry — just much rarer
than its rank suggests. Importing a Goethe list corrects orderings like this,
which is what that feature is for.
