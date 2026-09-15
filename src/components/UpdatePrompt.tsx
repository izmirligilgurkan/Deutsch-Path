import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { t } from '~/i18n/strings.ts';

/**
 * Service worker registration + update prompt.
 *
 * registerType is 'prompt' so a new build never swaps out mid-drill; the
 * learner reloads when they choose to.
 */
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdate(() => () => updateSW(true));
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
  }, []);

  if (needRefresh) {
    return (
      <div class="toast row-between" role="status">
        <span class="small">{t.pwa.updateAvailable}</span>
        <button class="primary" onClick={() => { void update?.(); }}>{t.pwa.reload}</button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div class="toast row-between" role="status">
        <span class="small">{t.pwa.offlineReady}</span>
        <button onClick={() => { setOfflineReady(false); }}>{t.pwa.dismiss}</button>
      </div>
    );
  }

  return null;
}
