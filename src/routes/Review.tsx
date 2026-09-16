import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { SourceNote } from '~/components/SourceNote.tsx';
import { CardView } from '~/components/CardView.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { loadCourseLexicon } from '~/db/level-list.ts';
import type { Lemma } from '~/lib/content-types.ts';
import type { Card } from '~/db/types.ts';
import { buildQuestion, type Question } from '~/srs/cards.ts';
import {
  buildSession,
  ensureCardsForUnit,
  getLeechQueue,
  recordAnswer,
  touchStreak,
  unlockedUnits,
} from '~/srs/session.ts';
import { navigate } from '~/router/hash-router.ts';
import { t } from '~/i18n/strings.ts';

type Phase = 'loading' | 'ready' | 'empty' | 'done' | 'error';

export function Review({ leechMode = false }: { leechMode?: boolean }) {
  const { settings, ready } = useSettings();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [lexicon, setLexicon] = useState<Map<string, Lemma>>(new Map());
  const [pool, setPool] = useState<Lemma[]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [startedAt, setStartedAt] = useState(Date.now());

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      try {
        const all = await loadCourseLexicon();
        if (cancelled) return;
        setLexicon(new Map(all.map((l) => [l.id, l])));
        setPool(all);

        // Make sure every unlocked unit has its cards before queueing.
        const unlocked = await unlockedUnits(settings);
        for (const unit of unlocked) await ensureCardsForUnit(unit);

        const cards = leechMode ? await getLeechQueue() : (await buildSession(settings)).queue;
        if (cancelled) return;

        setQueue(cards);
        setIndex(0);
        setScore({ correct: 0, total: 0 });
        setStartedAt(Date.now());
        setPhase(cards.length === 0 ? 'empty' : 'ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [ready, settings.newCardsPerDay, settings.reviewsPerDay, leechMode]);

  const card = queue[index];
  const lemma = card ? lexicon.get(card.lemmaId) : undefined;
  const question: Question | null = useMemo(
    () => (card && lemma ? buildQuestion(lemma, card.cardType, pool) : null),
    [card, lemma, pool],
  );

  const onAnswered = useCallback(
    (correct: boolean, given: string) => {
      if (!card || !question) return;
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      void recordAnswer({
        card,
        correct,
        given,
        expected: question.answers[0] ?? '',
        mode: 'practice',
        topic: question.cardType,
        exerciseId: card.id,
        durationMs: Date.now() - startedAt,
      });
    },
    [card, question, startedAt],
  );

  const onContinue = useCallback(() => {
    setStartedAt(Date.now());
    if (index + 1 >= queue.length) {
      void touchStreak(settings);
      setPhase('done');
    } else {
      setIndex(index + 1);
    }
  }, [index, queue.length, settings]);

  if (!ready || phase === 'loading') {
    return <Screen title={t.nav.review}><p class="muted">{t.common.loading}</p></Screen>;
  }

  if (phase === 'error') {
    return (
      <Screen title={t.nav.review}>
        <div class="notice" style="border-left-color:var(--bad)">
          <p class="small" style="margin:0">Could not load the course data.</p>
          <p class="small mono muted" style="margin:6px 0 0">{error}</p>
        </div>
      </Screen>
    );
  }

  if (phase === 'empty') {
    return (
      <Screen title={t.nav.review}>
        <div class="card">
          <h2>{leechMode ? 'No difficult cards' : 'Nothing due'}</h2>
          <p class="muted small">
            {leechMode
              ? 'Cards you have failed four or more times collect here.'
              : "You are up to date. New cards unlock as you work through the units, and reviews come back when they're due."}
          </p>
          <a class="btn btn-primary btn-block" href="#/course">Go to the course</a>
        </div>
      </Screen>
    );
  }

  if (phase === 'done') {
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    return (
      <Screen title="Session complete">
        <div class="card" style="text-align:center">
          <div class="stat-value" style="font-size:2.4rem">{pct}%</div>
          <p class="muted small">{score.correct} of {score.total} correct</p>
        </div>
        <div class="stack">
          <button class="primary btn-block" onClick={() => { window.location.reload(); }}>
            Review more
          </button>
          <a class="btn btn-block" href="#/">Back to home</a>
        </div>
      </Screen>
    );
  }

  if (!card || !question) {
    // The lemma behind this card is missing from the lexicon — skip rather
    // than stall the session.
    return (
      <Screen title={t.nav.review}>
        <div class="notice">
          <p class="small" style="margin:0">This card could not be built from the current data.</p>
          <button class="btn-block" style="margin-top:10px" onClick={onContinue}>Skip</button>
        </div>
      </Screen>
    );
  }

  return (
    <>
      <div class="session-bar">
        <button class="icon-btn" onClick={() => { navigate('/'); }}>Close</button>
        <div class="progressbar" aria-label="Session progress">
          <span style={`width:${((index / queue.length) * 100).toFixed(1)}%`} />
        </div>
        <span class="small muted">{index + 1}/{queue.length}</span>
      </div>

      <CardView
        key={card.id}
        question={question}
        options={{
          caseSensitive: settings.caseSensitive,
          allowTransliteration: settings.allowTransliteration,
          mode: 'practice',
        }}
        onAnswered={onAnswered}
        onContinue={onContinue}
      />

      {settings.showSourceAttribution && lemma ? (
        <SourceNote source={lemma.source} license={lemma.license} url={lemma.sourceUrl} />
      ) : null}
    </>
  );
}
