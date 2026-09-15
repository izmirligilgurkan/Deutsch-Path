import { useEffect, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { Markdown } from '~/components/Markdown.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { getDB } from '~/db/index.ts';
import { loadExercises, loadGrammar, type GrammarDoc } from '~/lib/content.ts';
import { UNITS } from '~/lib/syllabus.ts';
import { TOPIC_TITLES } from '~/lib/topic-titles.ts';
import { ensureCardsForUnit } from '~/srs/session.ts';
import type { Exercise } from '~/lib/content-types.ts';
import { t } from '~/i18n/strings.ts';

/** A unit: its sourced explanation, its drills, and its test. */
export function Unit({ unit }: { unit: number }) {
  const { ready } = useSettings();
  const plan = UNITS.find((u) => u.unit === unit);
  const [docs, setDocs] = useState<GrammarDoc[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [best, setBest] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !plan) return;
    let cancelled = false;

    void (async () => {
      try {
        const [loadedDocs, loadedExercises] = await Promise.all([
          Promise.all(plan.topics.map((topic) => loadGrammar(topic))),
          loadExercises(unit),
        ]);
        const db = await getDB();
        const progress = await db.get('unitProgress', unit);
        // Opening a unit is what creates its vocabulary cards.
        await ensureCardsForUnit(unit);
        await db.put('unitProgress', {
          unit,
          unlocked: true,
          lastOpenedAt: Date.now(),
          ...(progress?.bestScore === undefined ? {} : { bestScore: progress.bestScore }),
          ...(progress?.completedAt === undefined ? {} : { completedAt: progress.completedAt }),
        });

        if (cancelled) return;
        setDocs(loadedDocs);
        setExercises(loadedExercises);
        setBest(progress?.bestScore);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, unit]);

  if (!plan) {
    return (
      <Screen title="Unknown unit">
        <a class="btn btn-primary btn-block" href="#/course">Back to the course</a>
      </Screen>
    );
  }

  if (loading) return <Screen title={plan.title}><p class="muted">{t.common.loading}</p></Screen>;

  if (error) {
    return (
      <Screen title={plan.title}>
        <div class="notice" style="border-left-color:var(--bad)">
          <p class="small" style="margin:0">Could not load this unit.</p>
          <p class="small mono muted" style="margin:6px 0 0">{error}</p>
        </div>
      </Screen>
    );
  }

  const drillCount = exercises.length;

  return (
    <Screen title={plan.title} subtitle={`Unit ${plan.unit} · ${plan.level}`}>
      <div class="stack" style="margin-bottom:20px">
        <a class="btn btn-primary btn-block" href={`#/unit/${unit}/drill`}>
          Practise ({drillCount} items)
        </a>
        <a class="btn btn-block" href={`#/unit/${unit}/test`}>
          Unit test (20 items{best !== undefined ? ` · best ${Math.round(best * 100)}%` : ''})
        </a>
      </div>

      {docs.map((doc, i) => {
        const topic = plan.topics[i]!;
        return (
          <section class="card" key={topic}>
            <h2>{doc.meta['title'] ?? TOPIC_TITLES[topic] ?? topic}</h2>
            {doc.stub ? (
              <div class="notice">
                <p class="small" style="margin:0">
                  No openly licensed explanation of this topic was available to bundle, so none is
                  shown rather than an invented one. The drills still use real sentences and
                  Wiktionary forms.
                </p>
              </div>
            ) : null}
            <Markdown source={stripTitle(doc.body)} />
            <p class="attribution">
              {doc.stub ? 'No source text.' : (
                <>
                  Adapted from{' '}
                  <a href={doc.meta['sourceUrl'] ?? '#'} target="_blank" rel="noopener noreferrer">
                    {doc.meta['source']}
                  </a>
                  {doc.meta['sourceRevision'] ? ` (rev ${doc.meta['sourceRevision']})` : ''}
                  {' · '}{doc.meta['license']}
                  {doc.meta['modified'] ? ` · ${doc.meta['modified']}` : ''}
                </>
              )}
            </p>
          </section>
        );
      })}
    </Screen>
  );
}

/** The file repeats its title as an h1; the screen header already shows it. */
function stripTitle(body: string): string {
  return body.replace(/^#\s+.*\n+/, '');
}
