import { useEffect, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { InstallHint } from '~/components/InstallHint.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { getDB } from '~/db/index.ts';
import { loadLexicon } from '~/lib/content.ts';
import { UNITS } from '~/lib/syllabus.ts';
import { buildSession, ensureCardsForUnit, unlockedUnits } from '~/srs/session.ts';
import { retentionRate } from '~/srs/scheduler.ts';
import { t } from '~/i18n/strings.ts';

interface Dashboard {
  due: number;
  newAvailable: number;
  leeches: number;
  currentUnit: number;
  retention: number | null;
  knownByLevel: { level: string; known: number; total: number }[];
}

export function Home() {
  const { settings, ready } = useSettings();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !settings.onboarded) return;
    let cancelled = false;

    void (async () => {
      try {
        const lexicon = await loadLexicon();
        const unlocked = await unlockedUnits(settings);
        for (const unit of unlocked) await ensureCardsForUnit(unit);

        const session = await buildSession(settings);
        const db = await getDB();
        const [logs, seen, progress] = await Promise.all([
          db.getAll('reviewLogs'),
          db.getAll('seenLemmas'),
          db.getAll('unitProgress'),
        ]);
        if (cancelled) return;

        // "Known" is a word answered right more often than wrong.
        const knownIds = new Set(
          seen.filter((s) => s.timesCorrect > s.timesWrong).map((s) => s.lemmaId),
        );
        const byLevel = (['A1', 'A2', 'B1'] as const).map((level) => {
          const all = lexicon.filter((l) => l.level === level);
          return {
            level,
            known: all.filter((l) => knownIds.has(l.id)).length,
            total: all.length,
          };
        });

        // The furthest unlocked unit that has not been passed yet.
        const passed = new Set(
          progress.filter((p) => (p.bestScore ?? 0) >= 0.8).map((p) => p.unit),
        );
        const current = UNITS.find((u) => unlocked.has(u.unit) && !passed.has(u.unit))?.unit ?? 1;

        setData({
          due: session.queue.length,
          newAvailable: session.newCount,
          leeches: session.leeches,
          currentUnit: current,
          retention: retentionRate(logs),
          knownByLevel: byLevel,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => { cancelled = true; };
  }, [ready, settings.onboarded, settings.newCardsPerDay, settings.reviewsPerDay]);

  if (!ready) return <p class="muted">{t.common.loading}</p>;

  if (!settings.onboarded) {
    return (
      <Screen title={t.appName} subtitle={t.appTagline}>
        <div class="card">
          <h2>{t.onboarding.title}</h2>
          <p class="muted small">
            Everything runs on this device. No account, no sign-in, nothing leaves your phone.
          </p>
          <a class="btn btn-primary btn-block" href="#/onboarding">{t.home.getStarted}</a>
        </div>
      </Screen>
    );
  }

  const unitPlan = UNITS.find((u) => u.unit === (data?.currentUnit ?? 1));

  return (
    <Screen title={t.appName} subtitle={t.appTagline}>
      {error ? (
        <div class="notice" style="border-left-color:var(--bad)">
          <p class="small" style="margin:0">Could not load the course data.</p>
          <p class="small mono muted" style="margin:6px 0 0">{error}</p>
        </div>
      ) : null}

      <div class="stack" style="margin-bottom:20px">
        <a class="btn btn-primary btn-block" href={`#/unit/${data?.currentUnit ?? 1}`}>
          Unit {unitPlan?.unit ?? 1} · {unitPlan?.title ?? ''}
        </a>
        <a class="btn btn-block" href="#/review">
          Review · {data ? data.due : '…'}
        </a>
        {data && data.leeches > 0 ? (
          <a class="btn btn-block" href="#/review/leeches">Difficult · {data.leeches}</a>
        ) : null}
      </div>

      {/* Compact level rows: three bars, no explanatory paragraph. The detail
          lives on the Progress screen, which is where you go to read numbers. */}
      <section class="card" style="padding:12px">
        {(data?.knownByLevel ?? []).map((row) => (
          <div class="level-row" key={row.level}>
            <span class="level-name">{row.level}</span>
            <div class="progressbar">
              <span style={`width:${row.total ? ((row.known / row.total) * 100).toFixed(1) : 0}%`} />
            </div>
            <span class="level-count">{row.known}/{row.total}</span>
          </div>
        ))}
        <div class="level-row" style="margin-top:4px">
          <span class="level-count">{settings.streakCount}d streak</span>
          <span class="level-count" style="margin-left:auto">
            {data?.retention === null || data?.retention === undefined
              ? ''
              : `${Math.round(data.retention * 100)}% retention`}
          </span>
          <a class="small" href="#/progress">Details</a>
        </div>
      </section>

      <InstallHint />
    </Screen>
  );
}
