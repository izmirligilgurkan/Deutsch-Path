import { useState } from 'preact/hooks';
import { Screen, Stub } from '~/components/Screen.tsx';
import { InstallHint } from '~/components/InstallHint.tsx';
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
        <div class="card">
          <h2>{t.onboarding.fromZero}</h2>
          <p class="muted small">
            Begin at A1 unit 1 and work forward. Each unit has a sourced explanation, drills
            and a test; 80% unlocks the next one.
          </p>
          <button
            class="primary btn-block" disabled={starting}
            onClick={() => { void startFromZero(); }}
          >
            {starting ? 'Setting up…' : 'Start from zero'}
          </button>
        </div>

        <div class="card">
          <h2>Already know some German?</h2>
          <p class="muted small">
            You can unlock units without the test: turn off the 80% gate in Settings, then jump
            to whichever unit matches you. An adaptive placement test is still to come.
          </p>
          <Stub what="Placement test" phase="a later phase" />
        </div>

        <InstallHint />

        <div class="card">
          <h2>What this is</h2>
          <ul class="small" style="padding-left:18px;margin:0">
            <li>Reading, writing and drilling — no audio or speaking.</li>
            <li>Works offline once loaded. Everything stays on this device.</li>
            <li>Every German word and sentence links to its source and licence.</li>
            <li>Back up any time with <em>Settings → Export progress</em>.</li>
          </ul>
        </div>
      </div>
    </Screen>
  );
}
