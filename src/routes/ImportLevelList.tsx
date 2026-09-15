import { useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { getDB } from '~/db/index.ts';
import { updateSettings, useSettings } from '~/db/settings-store.ts';
import type { Level } from '~/lib/content-types.ts';
import type { LevelListEntry } from '~/db/types.ts';
import { t } from '~/i18n/strings.ts';

/**
 * On-device import of the learner's own Goethe word list (spec §3.1).
 *
 * The Goethe Wortlisten are copyrighted compilations. They are never committed
 * to the repo and never served from Pages: the learner runs
 * scripts/import-goethe.ts locally against PDFs they downloaded themselves,
 * then loads the resulting JSON here, into IndexedDB on their own device.
 */

const LEVELS = new Set<Level>(['A1', 'A2', 'B1']);

function parseLevelList(raw: string): LevelListEntry[] {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object mapping lemma → level.');
  }
  const entries: LevelListEntry[] = [];
  for (const [lemma, level] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof level !== 'string' || !LEVELS.has(level as Level)) {
      throw new Error(`Entry "${lemma}" has level "${String(level)}"; expected A1, A2 or B1.`);
    }
    entries.push({ lemma, level: level as Level });
  }
  if (entries.length === 0) throw new Error('The file contains no entries.');
  return entries;
}

export function ImportLevelList() {
  const { settings } = useSettings();
  const [status, setStatus] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const entries = parseLevelList(await file.text());
      const db = await getDB();
      const tx = db.transaction('levelList', 'readwrite');
      await tx.objectStore('levelList').clear();
      for (const entry of entries) await tx.objectStore('levelList').put(entry);
      await tx.done;
      await updateSettings({ levelListImportedAt: Date.now() });
      setStatus({ kind: 'ok', text: `Imported ${entries.length} entries.` });
    } catch (err) {
      setStatus({ kind: 'bad', text: `Import failed: ${String(err instanceof Error ? err.message : err)}` });
    }
  }

  async function clearList() {
    const db = await getDB();
    await db.clear('levelList');
    await updateSettings({ levelListImportedAt: null });
    setStatus({ kind: 'ok', text: 'Level list cleared from this device.' });
  }

  return (
    <Screen title={t.settings.importLevelList} subtitle="Stays on this device">
      <div class="card">
        <p class="small">
          The Goethe-Institut Wortlisten are the best public standard for which words belong to
          A1, A2 and B1 — but they are copyrighted compilations, so this app never ships them.
        </p>
        <ol class="small" style="padding-left:18px">
          <li>Download the Wortlisten PDFs yourself from goethe.de.</li>
          <li>
            Run <code class="mono">npm run data:goethe -- &lt;pdf…&gt;</code> on your own machine.
            It writes <code class="mono">goethe-levels.json</code>, which is gitignored.
          </li>
          <li>Load that file below. It is written to IndexedDB and never uploaded anywhere.</li>
        </ol>
        <p class="small muted">
          Without a list, vocabulary is ordered by corpus frequency and levels are labelled
          “approximate”.
        </p>
      </div>

      {status ? (
        <div
          class="notice" role="status"
          style={status.kind === 'bad' ? 'border-left-color:var(--bad)' : 'border-left-color:var(--ok)'}
        >
          <span class="small">{status.text}</span>
        </div>
      ) : null}

      <div class="card stack">
        <p class="small muted" style="margin:0">
          {settings.levelListImportedAt
            ? `Last imported ${new Date(settings.levelListImportedAt).toLocaleString()}.`
            : 'No list imported on this device.'}
        </p>
        <label class="btn btn-primary btn-block" style="cursor:pointer">
          Choose goethe-levels.json
          <input
            type="file" accept="application/json,.json" class="visually-hidden"
            onChange={(e) => { void onFile(e); }}
          />
        </label>
        {settings.levelListImportedAt ? (
          <button class="btn-block" onClick={() => { void clearList(); }}>Clear level list</button>
        ) : null}
      </div>

      <p class="small muted">
        Reference:{' '}
        <a href="https://www.goethe.de/de/spr/kup/prf/prf.html" target="_blank" rel="noopener noreferrer">
          Goethe-Institut exam materials
        </a>
      </p>
    </Screen>
  );
}
