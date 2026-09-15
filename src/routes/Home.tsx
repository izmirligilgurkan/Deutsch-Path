import { Screen, Stub } from '~/components/Screen.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { t } from '~/i18n/strings.ts';

export function Home() {
  const { settings, ready } = useSettings();

  if (!ready) return <p class="muted">{t.common.loading}</p>;

  if (!settings.onboarded) {
    return (
      <Screen title={t.appName} subtitle={t.appTagline}>
        <div class="card">
          <h2>{t.onboarding.title}</h2>
          <p class="muted small">
            Nothing is set up yet. Onboarding and the placement test arrive in a later phase.
          </p>
          <a class="btn btn-primary btn-block" href="#/onboarding">{t.home.getStarted}</a>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={t.appName} subtitle={t.appTagline}>
      <div class="card">
        <div class="row-between">
          <strong>{t.home.streak}</strong>
          <span class="badge">{settings.streakCount} {t.home.days}</span>
        </div>
      </div>
      <Stub what="Home dashboard" phase="phase 6 (progress and polish)" />
    </Screen>
  );
}
