import { useState } from 'preact/hooks';

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
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || isStandalone()) return null;

  return (
    <div class="card">
      <div class="row-between">
        <h2 style="margin:0">Add it to your home screen</h2>
        <button
          class="small" style="min-height:32px;padding:4px 10px"
          onClick={() => { setDismissed(true); }}
        >
          Hide
        </button>
      </div>
      <p class="small muted" style="margin:8px 0 0">
        {isIOS() ? (
          <>Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.</>
        ) : (
          <>Open the browser menu (⋮), then <strong>Add to Home screen</strong> or <strong>Install app</strong>.</>
        )}{' '}
        It then opens full-screen and works without a connection.
      </p>
    </div>
  );
}
