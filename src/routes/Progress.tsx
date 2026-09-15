import { useEffect, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { getDB } from '~/db/index.ts';
import { retentionRate } from '~/srs/scheduler.ts';
import { TOPIC_TITLES } from '~/lib/topic-titles.ts';
import { UNITS } from '~/lib/syllabus.ts';
import type { Mistake } from '~/db/types.ts';
import { t } from '~/i18n/strings.ts';

interface TopicStat {
  topic: string;
  wrong: number;
  total: number;
  accuracy: number;
  unit: number;
}

/** Dashboard, mistake log and weakness view (spec §4.7). */
export function Progress() {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [retention, setRetention] = useState<number | null>(null);
  const [totals, setTotals] = useState({ reviews: 0, cards: 0 });
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const db = await getDB();
      const [allMistakes, logs, cards] = await Promise.all([
        db.getAll('mistakes'),
        db.getAll('reviewLogs'),
        db.getAll('cards'),
      ]);

      // Accuracy per topic: every answer counted, wrong ones from the log.
      const wrongByTopic = new Map<string, number>();
      for (const m of allMistakes) {
        wrongByTopic.set(m.topic, (wrongByTopic.get(m.topic) ?? 0) + 1);
      }
      const answersByTopic = new Map<string, number>();
      for (const log of logs) {
        const card = cards.find((c) => c.id === log.cardId);
        const topic = card?.cardType ?? 'unknown';
        answersByTopic.set(topic, (answersByTopic.get(topic) ?? 0) + 1);
      }
      for (const [topic, count] of wrongByTopic) {
        if (!answersByTopic.has(topic)) answersByTopic.set(topic, count);
      }

      const stats: TopicStat[] = [...answersByTopic].map(([topic, total]) => {
        const wrong = wrongByTopic.get(topic) ?? 0;
        return {
          topic,
          wrong,
          total,
          accuracy: total > 0 ? (total - wrong) / total : 1,
          unit: UNITS.find((u) => u.topics.includes(topic))?.unit ?? 1,
        };
      });
      // Weakest first, so the thing worth drilling is at the top.
      stats.sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);

      setMistakes(allMistakes.sort((a, b) => b.ts - a.ts).slice(0, 100));
      setTopics(stats.filter((s) => s.total > 0));
      setRetention(retentionRate(logs));
      setTotals({ reviews: logs.length, cards: cards.length });
      setLoading(false);
    })();
  }, []);

  if (loading) return <Screen title={t.nav.progress}><p class="muted">{t.common.loading}</p></Screen>;

  const shown = filter ? mistakes.filter((m) => m.topic === filter) : mistakes;

  return (
    <Screen title={t.nav.progress}>
      <div class="stat-grid" style="margin-bottom:20px">
        <div class="stat">
          <div class="stat-value">{totals.reviews}</div>
          <div class="stat-label">answers so far</div>
        </div>
        <div class="stat">
          <div class="stat-value">{retention === null ? '—' : `${Math.round(retention * 100)}%`}</div>
          <div class="stat-label">retention</div>
        </div>
      </div>

      <section class="card">
        <h2>Weakest first</h2>
        {topics.length === 0 ? (
          <p class="muted small" style="margin:0">Answer a few questions and this fills in.</p>
        ) : (
          topics.slice(0, 10).map((s) => (
            <div key={s.topic} style="margin-bottom:14px">
              <div class="row-between small">
                <span>{TOPIC_TITLES[s.topic] ?? s.topic}</span>
                <span class="muted">{Math.round(s.accuracy * 100)}% of {s.total}</span>
              </div>
              <div class="progressbar" style="margin:4px 0 6px">
                <span
                  style={`width:${(s.accuracy * 100).toFixed(1)}%;background:var(--${
                    s.accuracy < 0.6 ? 'bad' : s.accuracy < 0.85 ? 'warn' : 'ok'
                  })`}
                />
              </div>
              <a class="small" href={`#/unit/${s.unit}/drill`}>Drill this →</a>
            </div>
          ))
        )}
      </section>

      <section class="card">
        <div class="row-between">
          <h2 style="margin:0">Mistakes</h2>
          {filter ? (
            <button class="small" style="min-height:32px;padding:4px 10px" onClick={() => { setFilter(''); }}>
              Clear filter
            </button>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <p class="muted small" style="margin:8px 0 0">No mistakes logged yet.</p>
        ) : (
          shown.slice(0, 40).map((m) => (
            <div key={m.id} style="padding:10px 0;border-bottom:1px solid var(--border)">
              <button
                class="small"
                style="all:unset;cursor:pointer;color:var(--accent)"
                onClick={() => { setFilter(m.topic); }}
              >
                {TOPIC_TITLES[m.topic] ?? m.topic}
              </button>
              <div class="small">
                <span style="color:var(--bad)">{m.given || '(blank)'}</span>
                {' → '}
                <span class="mono" style="color:var(--ok)">{m.expected}</span>
              </div>
              <div class="small muted">
                Unit {m.unit} · {m.mode} · {new Date(m.ts).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </section>
    </Screen>
  );
}
