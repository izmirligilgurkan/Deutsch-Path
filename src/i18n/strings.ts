/**
 * Every user-facing UI string lives here so a German UI can be added later by
 * dropping in a second dictionary with the same keys (spec §2).
 *
 * German *content* (words, sentences, grammar) never appears in this file —
 * that only ever comes from data/, with a source and licence attached.
 */

export const en = {
  appName: 'Deutsch bis B1',
  appTagline: 'Grammar and vocabulary, A0 to B1',

  nav: {
    home: 'Home',
    course: 'Course',
    review: 'Review',
    dictionary: 'Dictionary',
    progress: 'Progress',
    settings: 'Settings',
  },

  home: {
    continueUnit: 'Continue unit',
    reviewsDue: 'Reviews due',
    dailyTest: 'Daily test',
    notStarted: 'Not started yet',
    getStarted: 'Get started',
    streak: 'Streak',
    days: 'days',
    noContentTitle: 'No course data yet',
    noContentBody:
      'The lexicon, sentences and exercises are built locally from open sources and committed to data/. Run the data pipeline to populate them.',
  },

  onboarding: {
    title: 'How do you want to start?',
    fromZero: 'Start from zero',
    fromZeroHint: 'Begin at A1 unit 1.',
    placement: 'Placement test',
    placementHint: 'About 30 adaptive items. Unlocks units up to your level.',
    importList: 'Import level list',
    importListHint: 'Optional. Load a Goethe word list you generated yourself.',
  },

  common: {
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    check: 'Check',
    next: 'Next',
    done: 'Done',
    retry: 'Retry',
    loading: 'Loading…',
    comingSoon: 'Not built yet',
    source: 'Source',
    license: 'Licence',
    furtherReading: 'Further reading',
    of: 'of',
  },

  settings: {
    title: 'Settings',
    study: 'Study',
    newCardsPerDay: 'New cards per day',
    reviewsPerDay: 'Reviews per day',
    answers: 'Answer checking',
    caseSensitive: 'Case-sensitive answers',
    caseSensitiveHint: 'German capitalises nouns, so this is on by default.',
    allowTransliteration: 'Accept ae/oe/ue/ss in practice',
    allowTransliterationHint: 'Tests are always strict.',
    progression: 'Progression',
    requireUnitTest: 'Require 80% on a unit test to unlock the next unit',
    appearance: 'Appearance',
    theme: 'Theme',
    themeSystem: 'Follow system',
    themeLight: 'Light',
    themeDark: 'Dark',
    showAttribution: 'Show source attribution under content',
    data: 'Data',
    exportProgress: 'Export progress',
    importProgress: 'Import progress',
    importLevelList: 'Import level list',
    resetUnit: 'Reset a unit',
    resetAll: 'Reset everything',
    resetAllConfirm: 'Delete all progress? This cannot be undone.',
    exported: 'Progress exported.',
    imported: 'Progress imported.',
    importFailed: 'Import failed',
  },

  attributions: {
    title: 'Attributions',
    intro:
      'All German content in this app comes from the open sources below. Nothing here is machine-generated. Code is MIT; the bundled data keeps the licences of its sources.',
    dataLicense: 'Data licence',
    modifications: 'Modifications',
  },

  pwa: {
    updateAvailable: 'A new version is available.',
    reload: 'Reload',
    offlineReady: 'Ready to work offline.',
    dismiss: 'Dismiss',
  },

  errors: {
    notFound: 'Page not found',
    notFoundBody: 'That route does not exist.',
    goHome: 'Go to home',
    crashed: 'Something broke',
    crashedBody: 'The screen failed to render. Your saved progress is untouched.',
  },
} as const;

export type Strings = typeof en;

/** Swap this once a German UI dictionary exists. */
export const t: Strings = en;
