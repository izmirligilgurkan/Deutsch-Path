import { Screen, Stub } from '~/components/Screen.tsx';
import { navigate } from '~/router/hash-router.ts';
import { updateSettings } from '~/db/settings-store.ts';
import { t } from '~/i18n/strings.ts';

export function Onboarding() {
  async function startFromZero() {
    await updateSettings({ onboarded: true, startLevel: 'A1' });
    navigate('/');
  }

  return (
    <Screen title={t.onboarding.title}>
      <div class="stack">
        <div class="card">
          <h2>{t.onboarding.fromZero}</h2>
          <p class="muted small">{t.onboarding.fromZeroHint}</p>
          <button class="primary btn-block" onClick={() => { void startFromZero(); }}>
            {t.common.continue}
          </button>
        </div>

        <div class="card">
          <h2>{t.onboarding.placement}</h2>
          <p class="muted small">{t.onboarding.placementHint}</p>
          <Stub what="Placement test" phase="phase 5 (A2/B1 and tests)" />
        </div>

        <div class="card">
          <h2>{t.onboarding.importList}</h2>
          <p class="muted small">{t.onboarding.importListHint}</p>
          <a class="btn btn-block" href="#/import-level-list">{t.settings.importLevelList}</a>
        </div>
      </div>
    </Screen>
  );
}
