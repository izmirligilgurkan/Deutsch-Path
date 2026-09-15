import { useEffect, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { useSettings } from '~/db/settings-store.ts';
import { getDB } from '~/db/index.ts';
import { UNITS } from '~/lib/syllabus.ts';
import { unlockedUnits } from '~/srs/session.ts';
import type { UnitProgress } from '~/db/types.ts';
import { t } from '~/i18n/strings.ts';

export function Course() {
  const { settings, ready } = useSettings();
  const [unlocked, setUnlocked] = useState<Set<number>>(new Set([1]));
  const [progress, setProgress] = useState<Map<number, UnitProgress>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const db = await getDB();
      const rows = await db.getAll('unitProgress');
      setProgress(new Map(rows.map((p) => [p.unit, p])));
      setUnlocked(await unlockedUnits(settings));
      setLoading(false);
    })();
  }, [ready, settings.requireUnitTestToUnlock]);

  if (loading) return <Screen title={t.nav.course}><p class="muted">{t.common.loading}</p></Screen>;

  let currentLevel = '';

  return (
    <Screen title={t.nav.course} subtitle="A1 → A2 → B1, 35 units">
      {UNITS.map((unit) => {
        const isOpen = unlocked.has(unit.unit);
        const p = progress.get(unit.unit);
        const passed = (p?.bestScore ?? 0) >= 0.8;
        const heading = unit.level !== currentLevel ? (currentLevel = unit.level) : null;

        const row = (
          <a
            key={unit.unit}
            class={`unit-row ${passed ? 'unit-done' : ''}`}
            href={isOpen ? `#/unit/${unit.unit}` : undefined}
            aria-disabled={isOpen ? undefined : 'true'}
            onClick={(e) => { if (!isOpen) e.preventDefault(); }}
          >
            <span class="unit-num">{passed ? '✓' : unit.unit}</span>
            <span style="flex:1;min-width:0">
              <span style="display:block">{unit.title}</span>
              <span class="small muted">
                {isOpen
                  ? p?.bestScore !== undefined
                    ? `Best ${Math.round(p.bestScore * 100)}%`
                    : 'Not started'
                  : 'Locked'}
              </span>
            </span>
            {!isOpen ? <span aria-hidden="true" class="muted">🔒</span> : null}
          </a>
        );

        return heading ? (
          <div key={`h${unit.unit}`}>
            <h2 style="margin:20px 0 8px">{heading}</h2>
            {row}
          </div>
        ) : (
          row
        );
      })}
    </Screen>
  );
}
