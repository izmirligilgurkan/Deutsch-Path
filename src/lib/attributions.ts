/**
 * Source and licence register shown on the Attributions screen.
 *
 * This is metadata *about* sources, not learning content. It must stay in sync
 * with DATA_LICENSES.md; scripts/validate-data.ts checks that every licence id
 * appearing in data/ is on the allowlist below.
 */

export interface SourceEntry {
  id: string;
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  /** What this app takes from the source. */
  used: string;
  /** Required by CC BY-SA: state what was changed. */
  modifications: string;
  /** false = linked only, never copied into the repo. */
  bundled: boolean;
}

export const SOURCES: SourceEntry[] = [
  {
    id: 'kaikki-wiktionary',
    name: 'Wiktionary (English), via kaikki.org / wiktextract',
    url: 'https://kaikki.org/dictionary/German/',
    license: 'CC BY-SA 4.0 and GFDL',
    licenseUrl: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
    used: 'Lemmas, part of speech, gender, plural, inflection tables, English glosses.',
    modifications:
      'Filtered from 371,261 entries to the 3,277 this course teaches; form tables trimmed to the forms the drills use. No text rewritten.',
    bundled: true,
  },
  {
    id: 'tatoeba',
    name: 'Tatoeba Project',
    url: 'https://tatoeba.org/en/downloads',
    license: 'CC BY 2.0 FR (some sentences CC0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    used: 'German example sentences with English translations, used verbatim in cloze and word-order drills.',
    modifications:
      'Selected by vocabulary range and length; sentence text is never edited. Each sentence keeps its own licence, id and author for attribution.',
    bundled: true,
  },
  {
    id: 'wikibooks-german',
    name: 'Wikibooks: German',
    url: 'https://en.wikibooks.org/wiki/German',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    used: 'Grammar explanations — 37 of the 69 topics.',
    modifications:
      'Excerpted and converted to Markdown; headings shifted, and narrowed to the section that covers the topic. The 32 topics Wikibooks does not cover are shown as stubs with reference links, never filled in.',
    bundled: true,
  },
  {
    id: 'goethe-wortlisten',
    name: 'Goethe-Institut Wortlisten (A1 / A2 / B1)',
    url: 'https://www.goethe.de/de/spr/kup/prf/prf.html',
    license: 'Copyrighted — no redistribution licence',
    licenseUrl: 'https://www.goethe.de/de/spr/kup/prf/prf.html',
    used: 'CEFR level for 3,277 words (A1, A2, B1) — the level shown for most of the course.',
    modifications:
      'Headwords and their level extracted from the published Wortliste PDFs; glosses, example phrases and layout not copied. Bundled by the repository owner’s decision, not under a licence from the Goethe-Institut — see DATA_LICENSES.md.',
    bundled: true,
  },
  {
    id: 'cefr',
    name: 'Council of Europe CEFR descriptors',
    url: 'https://www.coe.int/en/web/common-european-framework-reference-languages',
    license: 'Reference only — no text copied',
    licenseUrl: 'https://www.coe.int/en/web/common-european-framework-reference-languages',
    used: 'Validating that the syllabus scope matches A1, A2 and B1.',
    modifications: 'None — used as a reference while writing SYLLABUS.md.',
    bundled: false,
  },
];

/** Proprietary sites linked from grammar topics. Never copied from. */
export const FURTHER_READING: { name: string; url: string }[] = [
  { name: 'Lingolia — German grammar', url: 'https://deutsch.lingolia.com/de/grammatik' },
  { name: 'mein-deutschbuch.de', url: 'https://mein-deutschbuch.de/grammatik.html' },
  { name: 'Schubert Verlag — online exercises', url: 'https://www.schubert-verlag.de/aufgaben/uebungen_a1/a1_uebungen_index.htm' },
  { name: 'DWDS — dictionary and corpora', url: 'https://www.dwds.de/' },
  { name: 'Duden', url: 'https://www.duden.de/' },
];

/** Licences permitted in data/. validate-data.ts rejects anything else. */
export const LICENSE_ALLOWLIST = [
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-2.0-FR',
  'CC0-1.0',
] as const;
