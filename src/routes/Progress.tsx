import { Screen, Stub } from '~/components/Screen.tsx';
import { t } from '~/i18n/strings.ts';

export function Progress() {
  return (
    <Screen title={t.nav.progress} subtitle="Retention, mistakes and weak topics">
      <Stub what="Dashboard, mistake log and weakness view" phase="phase 6 (progress and polish)" />
    </Screen>
  );
}
