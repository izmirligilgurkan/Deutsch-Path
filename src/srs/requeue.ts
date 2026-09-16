import { getDB } from '~/db/index.ts';
import type { Exercise } from '~/lib/content-types.ts';
import { newCard } from './scheduler.ts';
import { cardTypesFor } from './cards.ts';
import { loadCourseLexicon } from '~/db/level-list.ts';

/**
 * Feeds failed test items back into the SRS queue (spec §4.5).
 *
 * A test does not grade cards directly — it is scored at the end, and its
 * items are not all vocabulary — so instead the lemmas behind the wrong
 * answers are made due now. They surface in the next review session, which is
 * where the scheduler can actually act on them.
 */
export async function requeueFailedItems(
  wrong: Exercise[],
  now = Date.now(),
): Promise<number> {
  const lemmaIds = new Set(wrong.flatMap((e) => e.refs.lemmaIds ?? []));
  if (lemmaIds.size === 0) return 0;

  const lexicon = await loadCourseLexicon();
  const byId = new Map(lexicon.map((l) => [l.id, l]));
  const db = await getDB();
  const tx = db.transaction('cards', 'readwrite');
  const store = tx.objectStore('cards');

  let touched = 0;
  for (const lemmaId of lemmaIds) {
    const lemma = byId.get(lemmaId);
    if (!lemma) continue;

    for (const cardType of cardTypesFor(lemma)) {
      const id = `${lemmaId}:${cardType}`;
      const existing = await store.get(id);
      if (existing) {
        // Already scheduled later than now: pull it forward, but leave its
        // memory state alone — the test is evidence to review, not a lapse.
        if (existing.due > now) {
          await store.put({ ...existing, due: now });
          touched += 1;
        }
      } else {
        // The item came from a unit whose cards were never created — a level
        // test reaches units the learner has not opened yet.
        const unit = wrong.find((e) => e.refs.lemmaIds?.includes(lemmaId))?.unit ?? 1;
        await store.put(newCard(lemmaId, cardType, unit, now));
        touched += 1;
      }
    }
  }

  await tx.done;
  return touched;
}
