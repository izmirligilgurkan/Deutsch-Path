import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { t } from '~/i18n/strings.ts';
import { warmOfflineCache, type OfflineProgress } from '~/lib/offline.ts';

/**
 * Service worker registration, the update prompt, and filling the offline
 * cache.
 *
 * registerType is 'prompt' so a new build never swaps out mid-drill; the
 * learner reloads when they choose to.
 *
 * The course is downloaded deliberately once the worker is in control, rather
 * than relying on the learner to have visited every screen while online. The
 * toast reports what is actually true: downloading while it runs, ready when
 * the whole course is cached.
 */
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdate(() => () => updateSW(true));
        setNeedRefresh(true);
      },
    });

    // Only once the worker controls this page: before that its data route is
    // not intercepting anything, so a download would fill the browser cache
    // and leave the offline cache empty.
    const controller = new AbortController();
    void navigator.serviceWorker.ready
      .then(() => warmOfflineCache((p) => { setProgress(p); }, controller.signal))
      .catch(() => { /* offline already, or no Cache API; try again next start */ });
    return () => { controller.abort(); };
  }, []);

  const complete = progress !== null && progress.done >= progress.total;

  // "Ready to work offline" is a one-off confirmation, not something to
  // dismiss by hand — left up it covers the Continue button during a drill.
  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(() => { setHidden(true); }, 4000);
    return () => { clearTimeout(timer); };
  }, [complete]);

  if (needRefresh) {
    return (
      <div class="toast row-between" role="status">
        <span class="small">{t.pwa.updateAvailable}</span>
        <button class="primary" onClick={() => { void update?.(); }}>{t.pwa.reload}</button>
      </div>
    );
  }

  if (hidden || progress === null || progress.failed) return null;

  if (complete) {
    return (
      <div class="toast row-between" role="status">
        <span class="small">{t.pwa.offlineReady}</span>
        <button onClick={() => { setHidden(true); }}>{t.pwa.dismiss}</button>
      </div>
    );
  }

  const pct = Math.round((progress.bytes / Math.max(1, progress.totalBytes)) * 100);
  return (
    <div class="toast row-between" role="status">
      <span class="small">{t.pwa.downloading} {pct}%</span>
      <button onClick={() => { setHidden(true); }}>{t.pwa.dismiss}</button>
    </div>
  );
}
