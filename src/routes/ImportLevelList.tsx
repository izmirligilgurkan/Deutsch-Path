import { useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { getDB } from '~/db/index.ts';
import { invalidateCourseLexicon } from '~/db/level-list.ts';
import { updateSettings, useSettings } from '~/db/settings-store.ts';
import type { Level } from '~/lib/content-types.ts';
import type { LevelListEntry } from '~/db/types.ts';
import { t } from '~/i18n/strings.ts';

/**
 * On-device override of the bundled Goethe levels.
 *
 * The app ships data/goethe-levels.json, so nothing needs importing. This
 * screen stays for the learner who wants to re-level the course from their own
 * extraction: the JSON they load goes into IndexedDB on this device only and
 * takes precedence over the bundled mapping.
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
      // Levels feed unit assignment and the words-known counts, so the cached
      // lexicon has to be rebuilt before any screen reads it again.
      invalidateCourseLexicon();
      setStatus({
        kind: 'ok',
        text: `Imported ${entries.length} words. Your levels now come from this list.`,
      });
    } catch (err) {
      setStatus({ kind: 'bad', text: `Import failed: ${String(err instanceof Error ? err.message : err)}` });
    }
  }

  async function clearList() {
    const db = await getDB();
    await db.clear('levelList');
    await updateSettings({ levelListImportedAt: null });
    invalidateCourseLexicon();
    setStatus({ kind: 'ok', text: 'Level list cleared. Back to the bundled Goethe levels.' });
  }

  return (
    <Screen title={t.settings.importLevelList} subtitle="Stays on this device">
      <div class="notice">
        <p class="small" style="margin:0">
          <strong>You do not need this.</strong> The app already ships the Goethe-Institut
          A1 / A2 / B1 word lists — 3,277 words. This screen is only for replacing them with a
          list of your own.
        </p>
      </div>

      <div class="card">
        <p class="small">
          Words outside the Goethe lists are ordered by corpus frequency and their level is
          labelled “approximate”. Loading your own list re-levels the whole course.
        </p>
        <ol class="small" style="padding-left:18px">
          <li>
            The file is a JSON object mapping word → level, e.g.{' '}
            <code class="mono">{'{"Haus":"A1","Vertrag":"B1"}'}</code>.
          </li>
          <li>
            To rebuild it from the Wortliste PDFs, run{' '}
            <code class="mono">npm run data:goethe -- A1.pdf A2.pdf B1.pdf</code> in a clone of
            the repo.
          </li>
          <li>Load it below. It goes into IndexedDB on this device and is never uploaded.</li>
        </ol>
        <p class="small muted">
          Clearing the list brings back the bundled levels.
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
            : 'Using the bundled Goethe levels.'}
        </p>
        <label class="btn btn-primary btn-block" style="cursor:pointer">
          Choose a level list
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
