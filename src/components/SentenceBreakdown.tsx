import { useEffect, useState } from 'preact/hooks';
import type { Lemma, Sentence } from '~/lib/content-types.ts';
import { breakDownSentence, type BrokenWord } from '~/lib/sentence-breakdown.ts';
import { loadForms } from '~/lib/content.ts';
import { loadCourseLexicon } from '~/db/level-list.ts';
import { shortGloss } from '~/lib/gloss.ts';

/**
 * What the sentence actually said, shown after it has been answered.
 *
 * Getting a gap right is not understanding the sentence. This gives the
 * translation, then every word with its meaning and the form it is in, so the
 * answer becomes a thing you can read rather than a pattern you matched.
 *
 * The form tables are a megabyte or so, so they load only when this opens; the
 * meanings come from the lexicon the session already has and appear at once.
 */

type Rows = { words: BrokenWord[]; loading: boolean };

export function SentenceBreakdown({ sentence }: { sentence: Sentence }) {
  const [open, setOpen] = useState(false);
  // The words themselves need no data at all, so they are on screen before
  // anything is fetched and fill in with meanings as they resolve.
  const [rows, setRows] = useState<Rows>({ words: [], loading: true });

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows({ words: breakDownSentence(sentence.de, []), loading: true });

    void (async () => {
      const lexicon = await loadCourseLexicon();
      const byId = new Map(lexicon.map((l) => [l.id, l]));
      const own = sentence.lemmas
        .map((id) => byId.get(id))
        .filter((l): l is Lemma => Boolean(l));

      // Meanings first, so the panel is useful immediately.
      if (live) setRows({ words: breakDownSentence(sentence.de, own, {}, lexicon), loading: true });

      // A sentence's words can sit at any level, so every shard is needed for
      // the grammatical roles. Each is fetched once and cached from then on.
      const shards = await Promise.all((['A1', 'A2', 'B1'] as const).map((l) => loadForms(l)));
      const forms = Object.assign({}, ...shards) as Parameters<typeof breakDownSentence>[2];
      if (live) {
        setRows({ words: breakDownSentence(sentence.de, own, forms, lexicon), loading: false });
      }
    })().catch(() => {
      // Offline before the shards were cached: the meanings still stand.
      if (live) setRows((r) => ({ ...r, loading: false }));
    });

    return () => {
      live = false;
    };
  }, [open, sentence.de, sentence.lemmas]);

  if (!open) {
    return (
      <button class="btn-block" onClick={() => { setOpen(true); }}>
        Break it down
      </button>
    );
  }

  return (
    <div class="card breakdown">
      <p class="breakdown-en" lang="en">{sentence.en}</p>
      <ul class="breakdown-list">
        {rows.words.map((w, i) => (
          <li key={i}>
            <span class="breakdown-word" lang="de">{w.surface}</span>
            <span class="breakdown-meaning">
              {w.lemma ? (
                <>
                  <span lang="en">{shortGloss(w.lemma.glosses[0] ?? '')}</span>
                  {w.lemma.lemma.toLocaleLowerCase('de-DE') !==
                  w.surface.toLocaleLowerCase('de-DE') ? (
                    <span class="breakdown-lemma" lang="de">{w.lemma.lemma}</span>
                  ) : null}
                </>
              ) : (
                // Names and words outside the course have no entry to show.
                <span class="muted">—</span>
              )}
            </span>
            {w.role ? <span class="breakdown-role">{w.role}</span> : null}
          </li>
        ))}
      </ul>
      {rows.loading ? <p class="small muted">Loading forms…</p> : null}
      <button class="btn-block" onClick={() => { setOpen(false); }}>Hide</button>
    </div>
  );
}
