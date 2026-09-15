/**
 * Downloads raw source dumps into raw/ (gitignored).
 *
 * Phase 2 of the build plan. Not implemented yet — this stub exists so the
 * pipeline's shape is fixed and scripts/validate-data.ts has something to
 * validate against.
 *
 * Will fetch:
 *   - kaikki.org German Wiktionary extract (JSONL)
 *   - Tatoeba sentences.csv, links.csv, user_languages.csv
 * and record the URL and download date in raw/MANIFEST.json so the committed
 * data can always be traced to a dated snapshot.
 * */
console.error(
  'fetch-sources.ts is not implemented yet (phase 2: data pipeline).\n' +
    'See README.md "Data pipeline" for what it will do.',
);
process.exit(1);
