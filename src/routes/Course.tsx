import { Screen, Stub } from '~/components/Screen.tsx';
import { t } from '~/i18n/strings.ts';

export function Course() {
  return (
    <Screen title={t.nav.course} subtitle="A1 → A2 → B1, 35 units">
      <Stub
        what="Unit list, explanations and drills"
        phase="phases 4–5 (grammar content)"
        links={[{ label: 'Syllabus (SYLLABUS.md in the repo)', url: 'https://github.com/izmirligilgurkan/Deutsch-Path/blob/main/SYLLABUS.md' }]}
      />
    </Screen>
  );
}
