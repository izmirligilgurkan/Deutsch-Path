/**
 * The dated source snapshots the committed data is built from.
 *
 * Every entry records where a dump came from and under what licence, so any
 * record in data/ can be traced back to a file, a URL and a download date.
 */

export interface SourceSpec {
  /** Key in raw/MANIFEST.json and the local filename under raw/. */
  id: string;
  url: string;
  file: string;
  /** SPDX-ish id recorded on the records built from this dump. */
  license: string;
  licenseUrl: string;
  what: string;
}

export const SOURCES: SourceSpec[] = [
  {
    id: 'kaikki-de',
    url: 'https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl',
    file: 'kaikki-german.jsonl',
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
    what: 'German Wiktionary entries extracted by wiktextract (one JSON object per line).',
  },
  {
    id: 'tatoeba-deu',
    url: 'https://downloads.tatoeba.org/exports/per_language/deu/deu_sentences_detailed.tsv.bz2',
    file: 'deu_sentences_detailed.tsv.bz2',
    license: 'CC-BY-2.0-FR',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    what: 'German sentences with id, owner username and dates.',
  },
  {
    id: 'tatoeba-eng',
    url: 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2',
    file: 'eng_sentences_detailed.tsv.bz2',
    license: 'CC-BY-2.0-FR',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    what: 'English sentences, used only as translations of the German ones.',
  },
  {
    id: 'tatoeba-links',
    url: 'https://downloads.tatoeba.org/exports/per_language/deu/deu-eng_links.tsv.bz2',
    file: 'deu-eng_links.tsv.bz2',
    license: 'CC-BY-2.0-FR',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    what: 'German → English translation links.',
  },
  {
    id: 'tatoeba-cc0',
    url: 'https://downloads.tatoeba.org/exports/sentences_CC0.tar.bz2',
    file: 'sentences_CC0.tar.bz2',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    what: 'Ids of sentences their authors released under CC0, so each sentence records its own licence rather than a blanket one.',
  },
  {
    id: 'tatoeba-user-languages',
    url: 'https://downloads.tatoeba.org/exports/user_languages.tar.bz2',
    file: 'user_languages.tar.bz2',
    license: 'CC-BY-2.0-FR',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    what: 'Self-declared language levels per user, used to prefer native-speaker sentences.',
  },
];

export interface ManifestEntry {
  id: string;
  url: string;
  file: string;
  bytes: number;
  sha256: string;
  downloadedAt: string;
  lastModified: string | null;
  license: string;
  licenseUrl: string;
  what: string;
}

export type Manifest = Record<string, ManifestEntry>;
