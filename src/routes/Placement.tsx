import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { CardView } from '~/components/CardView.tsx';
import { SourceNote } from '~/components/SourceNote.tsx';
import { useSettings, updateSettings } from '~/db/settings-store.ts';
import { getDB } from '~/db/index.ts';
import { loadExercises, loadLexicon, loadSentences } from '~/lib/content.ts';
import { attributionFor, exerciseToQuestion } from '~/lib/exercise-question.ts';
import {
  buildPlacementRound,
  placementResult,
  unitsForLevel,
  unitsUpToLevel,
  PLACEMENT_LEVELS,
  PLACEMENT_PASS,
  PLACEMENT_ROUND_SIZE,
} from '~/lib/test-builder.ts';
import { ensureCardsForUnit } from '~/srs/session.ts';
import { navigate } from '~/router/hash-router.ts';
import type { Exercise, Lemma, Level, Sentence } from '~/lib/content-types.ts';
import type { TestResult } from '~/db/types.ts';
import { t } from '~/i18n/strings.ts';

/**
 * Adaptive placement (spec §4.1).
 *
 * Runs one round per level, starting at A1. Passing a round moves up; failing
 * ends the test. The learner is placed at the highest level they passed, and
 * every unit up to it is unlocked — so someone who already speaks some German
 * does not have to start at "the alphabet" or guess which unit fits.
 *
 * Rounds are short, so the whole thing is about 30 items at most.
 */

type Phase = 'loading' | 'running' | 'between' | 'done' | 'error';

export function Placement() {
  const { settings, ready } = useSettings();

  const [levelIndex, setLevelIndex] = useState(0);
  const [items, setItems] = useState<Exercise[]>([]);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [rounds, setRounds] = useState<{ level: Level; score: number }[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [sentences, setSentences] = useState<Map<number, Sentence>>(new Map());
  const [lemmas, setLemmas] = useState<Map<string, Lemma>>(new Map());
  const [placing, setPlacing] = useState(false);

  const level = PLACEMENT_LEVELS[levelIndex] ?? 'A1';

  // Load the round for the current level.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      try {
        setPhase('loading');
        const units = unitsForLevel(level);
        const [pools, lexicon, levelSentences] = await Promise.all([
          Promise.all(units.map((u) => loadExercises(u).catch(() => [] as Exercise[]))),
          loadLexicon(),
          loadSentences(level),
        ]);
        if (cancelled) return;

        const byUnit = new Map(units.map((u, i) => [u, pools[i] ?? []]));
        const round = buildPlacementRound(byUnit, level, 'placement');

        setItems(round);
        setIndex(0);
        setCorrect(0);
        setSentences(new Map(levelSentences.map((s) => [s.id, s])));
        setLemmas(new Map(lexicon.map((l) => [l.id, l])));
        setPhase(round.length === 0 ? 'done' : 'running');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [ready, level]);

  const exercise = items[index];
  const question = useMemo(() => (exercise ? exerciseToQuestion(exercise) : null), [exercise]);

  const onAnswered = useCallback((isCorrect: boolean) => {
    if (isCorrect) setCorrect((c) => c + 1);
  }, []);

  const onContinue = useCallback(() => {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }

    const score = items.length > 0 ? correct / items.length : 0;
    const next = [...rounds, { level, score }];
    setRounds(next);

    // Passing moves up a level; failing, or running out of levels, ends it.
    const passed = score >= PLACEMENT_PASS;
    if (passed && levelIndex + 1 < PLACEMENT_LEVELS.length) {
      setPhase('between');
    } else {
      setPhase('done');
    }
  }, [index, items.length, correct, rounds, level, levelIndex]);

  /** Applies the result: unlock everything up to the level demonstrated. */
  const applyPlacement = useCallback(async () => {
    setPlacing(true);
    const placed = placementResult(rounds);
    const db = await getDB();

    await db.add('testResults', {
      ts: Date.now(),
      kind: 'placement',
      score: rounds.reduce((n, r) => n + Math.round(r.score * PLACEMENT_ROUND_SIZE), 0),
      total: rounds.length * PLACEMENT_ROUND_SIZE,
      durationMs: 0,
      wrongExerciseIds: [],
      ...(placed ? { level: placed } : {}),
    } satisfies TestResult);

    // Placing at A1 means starting at unit 1 like anyone else.
    const units = placed ? unitsUpToLevel(placed) : [1];
    for (const unit of units) {
      const previous = await db.get('unitProgress', unit);
      await db.put('unitProgress', {
        unit,
        unlocked: true,
        lastOpenedAt: Date.now(),
        ...(previous?.bestScore === undefined ? {} : { bestScore: previous.bestScore }),
      });
    }
    // Only build cards for the unit they will actually start on.
    await ensureCardsForUnit(units[units.length - 1] ?? 1);

    await updateSettings({ onboarded: true, startLevel: placed ?? 'A1' });
    navigate('/');
  }, [rounds]);

  if (!ready || phase === 'loading') {
    return <Screen title="Placement test"><p class="muted">{t.common.loading}</p></Screen>;
  }

  if (phase === 'error') {
    return (
      <Screen title="Placement test">
        <div class="notice" style="border-left-color:var(--bad)">
          <p class="small" style="margin:0">Could not load the placement test.</p>
          <p class="small mono muted" style="margin:6px 0 0">{error}</p>
        </div>
        <a class="btn btn-block" href="#/onboarding">Back</a>
      </Screen>
    );
  }

  if (phase === 'between') {
    const last = rounds[rounds.length - 1];
    return (
      <Screen title={`${last?.level} passed`}>
        <div class="card" style="text-align:center">
          <div class="stat-value">{Math.round((last?.score ?? 0) * 100)}%</div>
          <p class="muted small" style="margin:4px 0 0">
            Moving up to {PLACEMENT_LEVELS[levelIndex + 1]}.
          </p>
        </div>
        <div class="stack">
          <button class="primary btn-block" onClick={() => { setLevelIndex(levelIndex + 1); }}>
            Continue
          </button>
          <button class="btn-block" onClick={() => { void applyPlacement(); }} disabled={placing}>
            Stop here and start at {last?.level}
          </button>
        </div>
      </Screen>
    );
  }

  if (phase === 'done') {
    const placed = placementResult(rounds);
    return (
      <Screen title="Placement complete">
        <div class="card" style="text-align:center">
          <div class="stat-value" style="font-size:2.2rem">{placed ?? 'A1'}</div>
          <p class="muted small" style="margin:4px 0 0">
            {placed
              ? `Units up to the end of ${placed} will be unlocked.`
              : 'Starting from the beginning of A1.'}
          </p>
        </div>

        <section class="card" style="padding:12px">
          {rounds.map((r) => (
            <div class="level-row" key={r.level}>
              <span class="level-name">{r.level}</span>
              <div class="progressbar"><span style={`width:${(r.score * 100).toFixed(0)}%`} /></div>
              <span class="level-count">{Math.round(r.score * 100)}%</span>
            </div>
          ))}
        </section>

        <button class="primary btn-block" onClick={() => { void applyPlacement(); }} disabled={placing}>
          {placing ? 'Setting up…' : 'Start here'}
        </button>
      </Screen>
    );
  }

  if (!exercise || !question) {
    return (
      <Screen title="Placement test">
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
        <button class="icon-btn" onClick={() => { navigate('/onboarding'); }}>Close</button>
        <div class="progressbar" aria-label="Placement progress">
          <span style={`width:${((index / items.length) * 100).toFixed(1)}%`} />
        </div>
        <span class="small muted">{level} {index + 1}/{items.length}</span>
      </div>

      <CardView
        key={exercise.id}
        question={question}
        options={{ caseSensitive: settings.caseSensitive, allowTransliteration: false, mode: 'test' }}
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
