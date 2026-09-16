import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { SourceNote } from '~/components/SourceNote.tsx';
import { CardView } from '~/components/CardView.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { getDB } from '~/db/index.ts';
import { loadExercises, loadSentences } from '~/lib/content.ts';
import { loadCourseLexicon } from '~/db/level-list.ts';
import { attributionFor, exerciseToQuestion } from '~/lib/exercise-question.ts';
import { UNITS } from '~/lib/syllabus.ts';
import { mulberry32, seedFrom, shuffled } from '~/lib/rng.ts';
import { PASS_MARK, touchStreak } from '~/srs/session.ts';
import { requeueFailedItems } from '~/srs/requeue.ts';
import { clearSessionState, loadSessionState, resumeFrom, saveSessionState } from '~/db/session-state.ts';
import type { Exercise, Lemma, Level, Sentence } from '~/lib/content-types.ts';
import type { Mistake, TestResult } from '~/db/types.ts';
import { navigate } from '~/router/hash-router.ts';
import { t } from '~/i18n/strings.ts';

export type SessionKind = 'drill' | 'unit' | 'level' | 'daily';

export interface SessionSpec {
  kind: SessionKind;
  title: string;
  /** Builds the item set. Seeded inside, so a reload keeps the same test. */
  load: () => Promise<{ items: Exercise[]; level: Level }>;
  /** Where Close and the finish screen return to. */
  closeHref: string;
  /** Set for a unit test, which records a best score against that unit. */
  unit?: number;
  /** Set for a level test. */
  level?: Level;
  /**
   * Set for a session that can be picked up where it stopped. Practice only:
   * a test is meant to be one sitting, and resuming one would turn a closed
   * tab into extra thinking time.
   */
  resumeKey?: string;
}

export function ExerciseSession({ spec }: { spec: SessionSpec }) {
  const { settings, ready } = useSettings();
  // Practice is forgiving; anything called a test is strict (spec §4.6).
  const mode: 'drill' | 'test' = spec.kind === 'drill' ? 'drill' : 'test';

  const [items, setItems] = useState<Exercise[]>([]);
  const [sentences, setSentences] = useState<Map<number, Sentence>>(new Map());
  const [lemmas, setLemmas] = useState<Map<string, Lemma>>(new Map());
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<{ exercise: Exercise; given: string }[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'running' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [sessionStart] = useState(Date.now());

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      try {
        const [{ items: chosen, level }, lexicon] = await Promise.all([
          spec.load(),
          loadCourseLexicon(),
        ]);
        // Sentences are only needed to attribute sentence-based items.
        const levelSentences = await loadSentences(level);
        if (cancelled) return;

        // A practice session left half-finished resumes exactly where it
        // stopped, as long as the items are still the same ones.
        const resumed = spec.resumeKey
          ? resumeFrom(await loadSessionState(spec.resumeKey), chosen)
          : null;
        if (cancelled) return;

        setItems(chosen);
        setSentences(new Map(levelSentences.map((s) => [s.id, s])));
        setLemmas(new Map(lexicon.map((l) => [l.id, l])));
        if (resumed) {
          const byId = new Map(chosen.map((e) => [e.id, e]));
          setIndex(resumed.index);
          setCorrectCount(resumed.correct);
          setWrong(
            resumed.wrong.flatMap(({ id, given }) => {
              const exercise = byId.get(id);
              return exercise ? [{ exercise, given }] : [];
            }),
          );
        }
        setPhase(chosen.length === 0 ? 'done' : 'running');
        setStartedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [ready, spec.kind, spec.unit, spec.level, spec.title, spec.resumeKey]);

  const exercise = items[index];
  /** Presentation cards have no answer, so they are not part of the score. */
  const scoredTotal = useMemo(() => items.filter((e) => e.type !== 'meet').length, [items]);
  const question = useMemo(() => (exercise ? exerciseToQuestion(exercise) : null), [exercise]);

  const onAnswered = useCallback(
    (correct: boolean, given: string) => {
      if (!exercise) return;
      // A presentation card is not a question; counting it as a right answer
      // would let a drill be passed by pressing Got it.
      if (exercise.type === 'meet') return;
      if (correct) setCorrectCount((c) => c + 1);
      else setWrong((w) => [...w, { exercise, given }]);

      if (!correct) {
        void (async () => {
          const db = await getDB();
          const mistake: Mistake = {
            ts: Date.now(),
            topic: exercise.topic,
            unit: exercise.unit,
            exerciseId: exercise.id,
            exerciseType: exercise.type,
            given,
            expected: Array.isArray(exercise.answer) ? exercise.answer.join(' · ') : exercise.answer,
            mode: mode === 'test' ? 'test' : 'practice',
          };
          await db.add('mistakes', mistake);
        })();
      }
    },
    [exercise, mode],
  );

  const finish = useCallback(async () => {
    const total = scoredTotal;
    const score = total > 0 ? correctCount / total : 0;
    const db = await getDB();

    if (mode === 'test') {
      const result: TestResult = {
        ts: Date.now(),
        kind: spec.kind === 'unit' ? 'unit' : spec.kind === 'level' ? 'level' : 'daily',
        ...(spec.unit === undefined ? {} : { unit: spec.unit }),
        ...(spec.level === undefined ? {} : { level: spec.level }),
        score: correctCount,
        total,
        durationMs: Date.now() - sessionStart,
        wrongExerciseIds: wrong.map((w) => w.exercise.id),
      };
      await db.add('testResults', result);

      // A unit test is what unlocks the next unit.
      if (spec.unit !== undefined) {
        const previous = await db.get('unitProgress', spec.unit);
        const best = Math.max(previous?.bestScore ?? 0, score);
        await db.put('unitProgress', {
          unit: spec.unit,
          unlocked: true,
          bestScore: best,
          lastOpenedAt: Date.now(),
          ...(best >= PASS_MARK ? { completedAt: Date.now() } : {}),
        });
      }

      // Failed items come back through the review queue (spec §4.5).
      await requeueFailedItems(wrong.map((w) => w.exercise));
    }

    // Finished: there is nothing left to come back to.
    if (spec.resumeKey) await clearSessionState(spec.resumeKey);

    await touchStreak(settings);
    setPhase('done');
  }, [scoredTotal, correctCount, mode, spec.kind, spec.unit, spec.level, spec.resumeKey, wrong, settings, sessionStart]);

  const onContinue = useCallback(() => {
    setStartedAt(Date.now());
    const next = index + 1;
    if (next >= items.length) {
      void finish();
      return;
    }
    setIndex(next);
    // Saved on the way forward, so the stored index is always the next
    // unanswered item. An answer given but not confirmed is not counted twice
    // on a resume; that one card comes round again.
    if (spec.resumeKey) {
      void saveSessionState(spec.resumeKey, items, {
        index: next,
        correct: correctCount,
        wrong: wrong.map((w) => ({ id: w.exercise.id, given: w.given })),
      });
    }
  }, [index, items, finish, spec.resumeKey, correctCount, wrong]);

  if (phase === 'loading' || !ready) {
    return <Screen title={spec.title}><p class="muted">{t.common.loading}</p></Screen>;
  }

  if (phase === 'error') {
    return (
      <Screen title={spec.title}>
        <div class="notice" style="border-left-color:var(--bad)">
          <p class="small" style="margin:0">Could not load these exercises.</p>
          <p class="small mono muted" style="margin:6px 0 0">{error}</p>
        </div>
      </Screen>
    );
  }

  if (phase === 'done') {
    const total = scoredTotal;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = total > 0 && correctCount / total >= PASS_MARK;

    return (
      <Screen title={mode === 'test' ? 'Test complete' : 'Practice complete'}>
        <div class="card" style="text-align:center">
          <div class="stat-value" style="font-size:2.4rem">{pct}%</div>
          <p class="muted small" style="margin:4px 0 0">{correctCount} of {total} correct</p>
          {spec.unit !== undefined ? (
            <p class="small" style={`margin:10px 0 0;color:var(--${passed ? 'ok' : 'bad'})`}>
              {passed
                ? 'Passed — the next unit is unlocked.'
                : `${Math.round(PASS_MARK * 100)}% is needed to unlock the next unit.`}
            </p>
          ) : null}
          {mode === 'test' && wrong.length > 0 ? (
            <p class="small muted" style="margin:8px 0 0">
              The words you missed are queued for review.
            </p>
          ) : null}
        </div>

        {wrong.length > 0 ? (
          <section class="card">
            <h2>Review your mistakes</h2>
            {wrong.map(({ exercise: ex, given }) => (
              <div key={ex.id} style="padding:10px 0;border-bottom:1px solid var(--border)">
                <div class="small muted">{ex.prompt}</div>
                <div class="small">
                  <span style="color:var(--bad)">{given || '(blank)'}</span>
                  {' → '}
                  <span class="mono" style="color:var(--ok)">
                    {Array.isArray(ex.answer) ? ex.answer.join(' · ') : ex.answer}
                  </span>
                </div>
                <a class="small" href={`#/unit/${ex.unit}`}>Explanation →</a>
              </div>
            ))}
          </section>
        ) : null}

        <div class="stack">
          <a class="btn btn-primary btn-block" href={spec.closeHref}>Done</a>
          <a class="btn btn-block" href="#/course">Course</a>
        </div>
      </Screen>
    );
  }

  if (!exercise || !question) {
    return (
      <Screen title={spec.title}>
        <div class="notice">
          <p class="small" style="margin:0">This item could not be rendered.</p>
          <button class="btn-block" style="margin-top:10px" onClick={onContinue}>Skip</button>
        </div>
      </Screen>
    );
  }

  const attribution = attributionFor(exercise, sentences, lemmas);
  const lemma = exercise.refs.lemmaIds?.[0] ? lemmas.get(exercise.refs.lemmaIds[0]) : undefined;
  // Sentence exercises can be broken down word by word once answered.
  const sentence =
    exercise.refs.sentenceId === undefined ? undefined : sentences.get(exercise.refs.sentenceId);

  return (
    <>
      <div class="session-bar">
        <button class="icon-btn" onClick={() => { navigate(spec.closeHref.replace(/^#/, '')); }}>Close</button>
        <div class="progressbar" aria-label="Session progress">
          <span style={`width:${((index / items.length) * 100).toFixed(1)}%`} />
        </div>
        <span class="small muted">
          {mode === 'test' ? 'Test ' : ''}{index + 1}/{items.length}
        </span>
      </div>

      <CardView
        key={exercise.id}
        question={question}
        options={{
          caseSensitive: settings.caseSensitive,
          allowTransliteration: settings.allowTransliteration,
          mode: mode === 'test' ? 'test' : 'practice',
        }}
        {...(sentence ? { sentence } : {})}
        {...(lemma ? { lemma } : {})}
        onAnswered={onAnswered}
        onContinue={onContinue}
      />

      {settings.showSourceAttribution && attribution ? (
        <SourceNote
          source={attribution.text}
          license={attribution.license}
          url={attribution.url}
          generator={exercise.generator}
        />
      ) : null}
    </>
  );
}
