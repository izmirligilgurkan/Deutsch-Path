import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { CardView } from '~/components/CardView.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { getDB } from '~/db/index.ts';
import { loadExercises, loadLexicon, loadSentences } from '~/lib/content.ts';
import { attributionFor, exerciseToQuestion } from '~/lib/exercise-question.ts';
import { UNITS } from '~/lib/syllabus.ts';
import { mulberry32, seedFrom, shuffled } from '~/lib/rng.ts';
import { PASS_MARK, touchStreak } from '~/srs/session.ts';
import type { Exercise, Lemma, Sentence } from '~/lib/content-types.ts';
import type { Mistake, TestResult } from '~/db/types.ts';
import { navigate } from '~/router/hash-router.ts';
import { t } from '~/i18n/strings.ts';

/** Spec §4.5: a unit test is 20 mixed items, scored at the end. */
const TEST_LENGTH = 20;

type Mode = 'drill' | 'test';

export function ExerciseSession({ unit, mode }: { unit: number; mode: Mode }) {
  const { settings, ready } = useSettings();
  const plan = UNITS.find((u) => u.unit === unit);

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
    if (!ready || !plan) return;
    let cancelled = false;

    void (async () => {
      try {
        const [all, lexicon, levelSentences] = await Promise.all([
          loadExercises(unit),
          loadLexicon(),
          loadSentences(plan.level),
        ]);
        if (cancelled) return;

        // A test is a fixed-length sample; a drill runs the whole unit.
        // Seeding by unit keeps a test stable across a reload mid-session.
        const rng = mulberry32(seedFrom(`${mode}:${unit}`));
        const chosen = mode === 'test' ? shuffled(all, rng).slice(0, TEST_LENGTH) : shuffled(all, rng);

        setItems(chosen);
        setSentences(new Map(levelSentences.map((s) => [s.id, s])));
        setLemmas(new Map(lexicon.map((l) => [l.id, l])));
        setPhase(chosen.length === 0 ? 'done' : 'running');
        setStartedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [ready, unit, mode]);

  const exercise = items[index];
  const question = useMemo(() => (exercise ? exerciseToQuestion(exercise) : null), [exercise]);

  const onAnswered = useCallback(
    (correct: boolean, given: string) => {
      if (!exercise) return;
      if (correct) setCorrectCount((c) => c + 1);
      else setWrong((w) => [...w, { exercise, given }]);

      if (!correct) {
        void (async () => {
          const db = await getDB();
          const mistake: Mistake = {
            ts: Date.now(),
            topic: exercise.topic,
            unit,
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
    [exercise, unit, mode],
  );

  const finish = useCallback(async () => {
    const total = items.length;
    const score = total > 0 ? correctCount / total : 0;
    const db = await getDB();

    if (mode === 'test') {
      const result: TestResult = {
        ts: Date.now(),
        kind: 'unit',
        unit,
        score: correctCount,
        total,
        durationMs: Date.now() - sessionStart,
        wrongExerciseIds: wrong.map((w) => w.exercise.id),
      };
      await db.add('testResults', result);

      const previous = await db.get('unitProgress', unit);
      const best = Math.max(previous?.bestScore ?? 0, score);
      await db.put('unitProgress', {
        unit,
        unlocked: true,
        bestScore: best,
        lastOpenedAt: Date.now(),
        ...(best >= PASS_MARK ? { completedAt: Date.now() } : {}),
      });
    }

    await touchStreak(settings);
    setPhase('done');
  }, [items.length, correctCount, mode, unit, wrong, settings, sessionStart]);

  const onContinue = useCallback(() => {
    setStartedAt(Date.now());
    if (index + 1 >= items.length) void finish();
    else setIndex(index + 1);
  }, [index, items.length, finish]);

  if (!plan) {
    return (
      <Screen title="Unknown unit">
        <a class="btn btn-primary btn-block" href="#/course">Back to the course</a>
      </Screen>
    );
  }

  if (phase === 'loading' || !ready) {
    return <Screen title={plan.title}><p class="muted">{t.common.loading}</p></Screen>;
  }

  if (phase === 'error') {
    return (
      <Screen title={plan.title}>
        <div class="notice" style="border-left-color:var(--bad)">
          <p class="small" style="margin:0">Could not load this unit's exercises.</p>
          <p class="small mono muted" style="margin:6px 0 0">{error}</p>
        </div>
      </Screen>
    );
  }

  if (phase === 'done') {
    const total = items.length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = total > 0 && correctCount / total >= PASS_MARK;

    return (
      <Screen title={mode === 'test' ? 'Test complete' : 'Practice complete'}>
        <div class="card" style="text-align:center">
          <div class="stat-value" style="font-size:2.4rem">{pct}%</div>
          <p class="muted small" style="margin:4px 0 0">{correctCount} of {total} correct</p>
          {mode === 'test' ? (
            <p class="small" style={`margin:10px 0 0;color:var(--${passed ? 'ok' : 'bad'})`}>
              {passed
                ? 'Passed — the next unit is unlocked.'
                : `${Math.round(PASS_MARK * 100)}% is needed to unlock the next unit.`}
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
                <a class="small" href={`#/unit/${unit}`}>Explanation →</a>
              </div>
            ))}
          </section>
        ) : null}

        <div class="stack">
          <a class="btn btn-primary btn-block" href="#/course">Back to the course</a>
          <a class="btn btn-block" href={`#/unit/${unit}`}>Unit overview</a>
        </div>
      </Screen>
    );
  }

  if (!exercise || !question) {
    return (
      <Screen title={plan.title}>
        <div class="notice">
          <p class="small" style="margin:0">This item could not be rendered.</p>
          <button class="btn-block" style="margin-top:10px" onClick={onContinue}>Skip</button>
        </div>
      </Screen>
    );
  }

  const attribution = attributionFor(exercise, sentences, lemmas);

  return (
    <>
      <div class="session-bar">
        <button
          class="small" style="min-height:36px;padding:6px 10px"
          onClick={() => { navigate(`/unit/${unit}`); }}
        >
          Close
        </button>
        <div class="progressbar" aria-label="Session progress">
          <span style={`width:${((index / items.length) * 100).toFixed(1)}%`} />
        </div>
        <span class="small muted">{index + 1}/{items.length}</span>
      </div>

      {mode === 'test' ? (
        <p class="small muted" style="margin:-4px 0 12px">
          Test mode — strict checking, scored at the end.
        </p>
      ) : null}

      <CardView
        key={exercise.id}
        question={question}
        options={{
          caseSensitive: settings.caseSensitive,
          allowTransliteration: settings.allowTransliteration,
          mode: mode === 'test' ? 'test' : 'practice',
        }}
        onAnswered={onAnswered}
        onContinue={onContinue}
      />

      {settings.showSourceAttribution && attribution ? (
        <p class="attribution">
          <a href={attribution.url} target="_blank" rel="noopener noreferrer">{attribution.text}</a>
          {' · '}{attribution.license}
        </p>
      ) : null}
      <p class="attribution">Generated by: <span class="mono">{exercise.generator}</span></p>
    </>
  );
}
