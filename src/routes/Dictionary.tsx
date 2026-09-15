import { Screen, Stub } from '~/components/Screen.tsx';
import { t } from '~/i18n/strings.ts';

export function Dictionary() {
  return (
    <Screen title={t.nav.dictionary} subtitle="Every word you have seen">
      <Stub
        what="Searchable dictionary"
        phase="phase 6 (progress and polish)"
        links={[
          { label: 'German Wiktionary entries (source of all word data)', url: 'https://en.wiktionary.org/wiki/Category:German_lemmas' },
          { label: 'DWDS — German dictionary and corpus', url: 'https://www.dwds.de/' },
        ]}
      />
    </Screen>
  );
}
