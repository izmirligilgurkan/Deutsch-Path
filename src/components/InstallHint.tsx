import { updateSettings, useSettings } from '~/db/settings-store.ts';

/**
 * Explains how to add the app to the home screen.
 *
 * Neither iOS nor Android fires a usable install prompt for this case — iOS has
 * no beforeinstallprompt at all — so the honest thing is to show the two taps
 * rather than a button that may do nothing.
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as a Mac, but with a touch screen.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallHint() {
  const { settings, ready } = useSettings();
  if (!ready || settings.installHintDismissed || isStandalone()) return null;

  return (
    <div class="card" style="padding:12px">
      <div class="row-between" style="gap:8px">
        <p class="small" style="margin:0">
          <strong>Add to home screen</strong> —{' '}
          {isIOS() ? (
            <>Share → Add to Home Screen.</>
          ) : (
            <>menu (⋮) → Install app.</>
          )}{' '}
          Opens full-screen and works offline.
        </p>
        <button
          class="small" style="min-height:32px;padding:4px 10px"
          onClick={() => { void updateSettings({ installHintDismissed: true }); }}
        >
          Hide
        </button>
      </div>
    </div>
  );
}
