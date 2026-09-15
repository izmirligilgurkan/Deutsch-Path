# Data licences

Every dataset bundled in `data/` is recorded here with its licence, what this
project takes from it, and what was changed. `scripts/validate-data.ts` enforces
the rules below in CI: a record without a source or with a licence outside the
allowlist fails the build.

**Status:** the pipeline runs in phase 2. The licences below were chosen up
front so nothing gets bundled before its terms are checked. Each entry is
marked with whether its licence text has been verified against the source yet.

## Allowlist

Only these licence identifiers may appear in `data/`:

| Identifier | Licence |
|---|---|
| `CC-BY-SA-4.0` | Creative Commons Attribution-ShareAlike 4.0 |
| `CC-BY-SA-3.0` | Creative Commons Attribution-ShareAlike 3.0 |
| `CC-BY-2.0-FR` | Creative Commons Attribution 2.0 France |
| `CC0-1.0` | Creative Commons Zero 1.0 |

Anything else is a build failure.

## Bundled sources

### Wiktionary via kaikki.org (wiktextract)

- **URL:** <https://kaikki.org/dictionary/German/>
- **Upstream:** English Wiktionary, <https://en.wiktionary.org/wiki/Wiktionary:Copyrights>
- **Licence:** CC BY-SA (dual-licensed GFDL). Recorded as `CC-BY-SA-4.0`.
- **Used for:** lemmas, part of speech, gender, plural, inflection tables,
  English glosses, verb principal parts.
- **Modifications:** filtered to the course vocabulary; fields trimmed to those
  the app uses; no text rewritten. The `sourceUrl` of each lemma points at its
  Wiktionary page.
- **Share-alike:** satisfied by `data/LICENSE` (CC BY-SA 4.0).
- **Licence verified:** ☐ pending (phase 2, before the first import).

### Tatoeba

- **URL:** <https://tatoeba.org/en/downloads>
- **Licence:** CC BY 2.0 FR for most sentences; some are CC0 1.0. Recorded
  per sentence as `CC-BY-2.0-FR` or `CC0-1.0`.
- **Used for:** German example sentences with English translations, used
  verbatim in cloze, word-order and article/case drills.
- **Modifications:** none to the sentence text. Sentences are *selected* by
  vocabulary range and by whether the owner self-declares German as a native
  language (`user_languages` export). The Tatoeba sentence id and the author's
  username are kept on every record so attribution can be shown in the UI.
- **Licence verified:** ☐ pending (phase 2, before the first import).

### Wikibooks: German

- **URL:** <https://en.wikibooks.org/wiki/German>
- **Licence:** CC BY-SA 4.0.
- **Used for:** the grammar explanation on each unit.
- **Modifications:** excerpted and shortened to fit a phone screen. Every
  topic file carries a front-matter header with `source`, `sourceUrl`,
  `license` and a `modified` note, and links back to the original page.
- **Licence verified:** ☐ pending (phase 2, before the first import).

## Linked, never copied

These are referenced from grammar topics as "further reading". No text, table
or exercise from them is copied into this repository.

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
- **How levels work instead:** the learner downloads the PDFs themselves and
  runs `npm run data:goethe` locally. The output `goethe-levels.json` is
  gitignored and is loaded into IndexedDB on that device via the
  *Import level list* screen.
- **Enforcement:** `.gitignore` blocks the filenames, and
  `scripts/validate-data.ts` fails the build if a committed lemma carries
  `levelSource: "goethe-import"` or if a `goethe-levels.json` appears in
  `data/`.

### CEFR descriptors and Goethe exam specifications

Used as a *reference* while writing `SYLLABUS.md` to check that the scope of
each level is right. No text is copied.

## Open question for the maintainer

The spec's fallback for level ordering (§3.1) is "corpus frequency from an
openly licensed source you verify". Candidate lists still need their licence
checked before anything is bundled, and none will be committed until then. If
no clearly redistributable frequency list is found, the fallback is ordering by
Tatoeba sentence frequency — derived from the CC-BY data already bundled — with
levels labelled **approximate** in the UI. This decision is flagged for review
at the phase 2 checkpoint.
