import { useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { applyTheme, updateSettings, useSettings } from '~/db/settings-store.ts';
import { resetAll } from '~/db/index.ts';
import {
  backupFilename,
  exportProgress,
  importProgress,
  parseBackup,
  BackupError,
} from '~/db/backup.ts';
import { t } from '~/i18n/strings.ts';
import type { Settings as SettingsType } from '~/db/types.ts';

export function Settings() {
  const { settings, ready } = useSettings();
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  if (!ready) return <p class="muted">{t.common.loading}</p>;

  const set = (patch: Partial<SettingsType>) => { void updateSettings(patch); };

  async function doExport() {
    const file = await exportProgress();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: t.settings.exported });
  }

  async function doImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await importProgress(parseBackup(await file.text()));
      setMessage({ kind: 'ok', text: t.settings.imported });
      // Re-read everything from the imported database.
      window.location.reload();
    } catch (err) {
      const detail = err instanceof BackupError ? err.message : String(err);
      setMessage({ kind: 'bad', text: `${t.settings.importFailed}: ${detail}` });
    }
  }

  async function doResetAll() {
    if (!confirm(t.settings.resetAllConfirm)) return;
    await resetAll(true);
    window.location.reload();
  }

  return (
    <Screen title={t.settings.title}>
      {message ? (
        <div class="notice" role="status" style={message.kind === 'bad' ? 'border-left-color:var(--bad)' : 'border-left-color:var(--ok)'}>
          <span class="small">{message.text}</span>
        </div>
      ) : null}

      <section class="card">
        <h2>{t.settings.study}</h2>
        <label class="setting">
          <span>{t.settings.newCardsPerDay}</span>
          <input
            type="number" min="0" max="200" style="max-width:96px"
            value={settings.newCardsPerDay}
            onChange={(e) => { set({ newCardsPerDay: Number((e.target as HTMLInputElement).value) }); }}
          />
        </label>
        <label class="setting">
          <span>{t.settings.reviewsPerDay}</span>
          <input
            type="number" min="0" max="2000" style="max-width:96px"
            value={settings.reviewsPerDay}
            onChange={(e) => { set({ reviewsPerDay: Number((e.target as HTMLInputElement).value) }); }}
          />
        </label>
      </section>

      <section class="card">
        <h2>{t.settings.answers}</h2>
        <label class="setting">
          <span>
            {t.settings.caseSensitive}
            <br /><span class="muted small">{t.settings.caseSensitiveHint}</span>
          </span>
          <input
            type="checkbox" checked={settings.caseSensitive}
            onChange={(e) => { set({ caseSensitive: (e.target as HTMLInputElement).checked }); }}
          />
        </label>
        <label class="setting">
          <span>
            {t.settings.allowTransliteration}
            <br /><span class="muted small">{t.settings.allowTransliterationHint}</span>
          </span>
          <input
            type="checkbox" checked={settings.allowTransliteration}
            onChange={(e) => { set({ allowTransliteration: (e.target as HTMLInputElement).checked }); }}
          />
        </label>
      </section>

      <section class="card">
        <h2>{t.settings.progression}</h2>
        <label class="setting">
          <span>{t.settings.requireUnitTest}</span>
          <input
            type="checkbox" checked={settings.requireUnitTestToUnlock}
            onChange={(e) => { set({ requireUnitTestToUnlock: (e.target as HTMLInputElement).checked }); }}
          />
        </label>
      </section>

      <section class="card">
        <h2>{t.settings.appearance}</h2>
        <label class="setting">
          <span>{t.settings.theme}</span>
          <select
            style="max-width:160px"
            value={settings.theme}
            onChange={(e) => {
              const theme = (e.target as HTMLSelectElement).value as SettingsType['theme'];
              applyTheme(theme);
              set({ theme });
            }}
          >
            <option value="system">{t.settings.themeSystem}</option>
            <option value="light">{t.settings.themeLight}</option>
            <option value="dark">{t.settings.themeDark}</option>
          </select>
        </label>
        <label class="setting">
          <span>{t.settings.showAttribution}</span>
          <input
            type="checkbox" checked={settings.showSourceAttribution}
            onChange={(e) => { set({ showSourceAttribution: (e.target as HTMLInputElement).checked }); }}
          />
        </label>
      </section>

      <section class="card">
        <h2>{t.settings.data}</h2>
        <div class="stack">
          <button class="btn-block" onClick={() => { void doExport(); }}>{t.settings.exportProgress}</button>

          <label class="btn btn-block" style="cursor:pointer">
            {t.settings.importProgress}
            <input
              type="file" accept="application/json,.json" class="visually-hidden"
              onChange={(e) => { void doImport(e); }}
            />
          </label>

          <a class="btn btn-block" href="#/import-level-list">{t.settings.importLevelList}</a>
          <a class="btn btn-block" href="#/attributions">{t.attributions.title}</a>

          <button
            class="btn-block" style="color:var(--bad);border-color:var(--bad)"
            onClick={() => { void doResetAll(); }}
          >
            {t.settings.resetAll}
          </button>
        </div>
      </section>
    </Screen>
  );
}
