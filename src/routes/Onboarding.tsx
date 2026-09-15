import { useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { navigate } from '~/router/hash-router.ts';
import { updateSettings } from '~/db/settings-store.ts';
import { ensureCardsForUnit } from '~/srs/session.ts';
import { t } from '~/i18n/strings.ts';

export function Onboarding() {
  const [starting, setStarting] = useState(false);

  async function startFromZero() {
    setStarting(true);
    await updateSettings({ onboarded: true, startLevel: 'A1' });
    // Build unit 1's cards now so the first review session is never empty.
    await ensureCardsForUnit(1);
    navigate('/');
  }

  return (
    <Screen title={t.onboarding.title} subtitle="Takes one tap. Nothing to sign up for.">
      <div class="stack">
        <button
          class="primary btn-block" disabled={starting}
          onClick={() => { void startFromZero(); }}
        >
          {starting ? 'Setting up…' : 'Start from zero'}
        </button>

        <p class="small muted" style="margin:0">
          A1 unit 1 onwards. 80% on a unit test unlocks the next one.
        </p>

        <a class="btn btn-block" href="#/placement">Placement test</a>
        <p class="small muted" style="margin:-4px 0 0">
          Already know some German? About 30 items, then start where you actually are.
        </p>

        <details class="card topic">
          <summary><span>What this is</span></summary>
          <div class="topic-body">
            <ul class="small" style="padding-left:18px;margin:0">
              <li>Reading, writing and drilling — no audio or speaking.</li>
              <li>Works offline. Everything stays on this device.</li>
              <li>Every word and sentence links to its source and licence.</li>
              <li>Back up with <em>Settings → Export progress</em>.</li>
            </ul>
          </div>
        </details>
      </div>
    </Screen>
  );
}
