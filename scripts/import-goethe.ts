/**
 * Learner-only, run locally: Goethe Wortlisten PDFs -> goethe-levels.json.
 *
 * The Goethe-Institut word lists are copyrighted compilations. This script
 * never runs in CI, its output is gitignored, and the JSON is loaded straight
 * into IndexedDB on the learner's own device via the "Import level list"
 * screen. Nothing it produces may be committed or served.
 *
 * Phase 2/6 of the build plan. Not implemented yet.
 *
 * Usage (once implemented):
 *   npm run data:goethe -- ~/Downloads/Goethe-Zertifikat_A1_Wortliste.pdf …
 */
console.error(
  'import-goethe.ts is not implemented yet (phase 6: Goethe import screen).\n' +
    'Its output goethe-levels.json is gitignored and must never be committed.',
);
process.exit(1);
