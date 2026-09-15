import { Screen } from '~/components/Screen.tsx';
import { t } from '~/i18n/strings.ts';

export function NotFound({ path }: { path: string }) {
  return (
    <Screen title={t.errors.notFound}>
      <div class="card">
        <p class="muted small">{t.errors.notFoundBody}</p>
        <p class="mono small">{path}</p>
        <a class="btn btn-primary btn-block" href="#/">{t.errors.goHome}</a>
      </div>
    </Screen>
  );
}
