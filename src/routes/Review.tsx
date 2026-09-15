import { Screen, Stub } from '~/components/Screen.tsx';
import { t } from '~/i18n/strings.ts';

export function Review() {
  return (
    <Screen title={t.nav.review} subtitle="Spaced repetition (FSRS)">
      <Stub what="Vocabulary trainer" phase="phase 3 (vocab SRS)" />
    </Screen>
  );
}
