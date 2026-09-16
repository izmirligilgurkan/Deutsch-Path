import { useMemo } from 'preact/hooks';
import { ExerciseSession, type SessionSpec } from './ExerciseSession.tsx';
import { Screen } from '~/components/Screen.tsx';
import { getDB } from '~/db/index.ts';
import { loadExercises } from '~/lib/content.ts';
import { UNITS } from '~/lib/syllabus.ts';
import {
  buildDailyTest,
  buildLevelTest,
  ladderOrder,
  sample,
  unitsForLevel,
  TEST_LENGTHS,
} from '~/lib/test-builder.ts';
import { dayKey } from '~/srs/scheduler.ts';
import type { Level } from '~/lib/content-types.ts';

/**
 * Route wrappers: each builds the item set for one kind of session and hands
 * it to the shared runner.
 */

export function UnitDrill({ unit }: { unit: number }) {
  const plan = UNITS.find((u) => u.unit === unit);
  const spec = useMemo<SessionSpec | null>(
    () =>
      plan
        ? {
            kind: 'drill',
            title: plan.title,
            closeHref: `#/unit/${unit}`,
            load: async () => ({
              // A drill runs the whole unit as a ladder: recognise, then
              // complete, then produce. The unit test is the mixed one.
              items: ladderOrder(await loadExercises(unit), `drill:${unit}`),
              level: plan.level,
            }),
          }
        : null,
    [unit],
  );
  return spec ? <ExerciseSession spec={spec} /> : <UnknownUnit />;
}

export function UnitTest({ unit }: { unit: number }) {
  const plan = UNITS.find((u) => u.unit === unit);
  const spec = useMemo<SessionSpec | null>(
    () =>
      plan
        ? {
            kind: 'unit',
            title: `${plan.title} — test`,
            closeHref: `#/unit/${unit}`,
            unit,
            level: plan.level,
            load: async () => ({
              items: sample(await loadExercises(unit), TEST_LENGTHS.unit, `test:${unit}`),
              level: plan.level,
            }),
          }
        : null,
    [unit],
  );
  return spec ? <ExerciseSession spec={spec} /> : <UnknownUnit />;
}

/** 10 items weighted toward recent mistakes, reseeded each day. */
export function DailyTest() {
  const spec = useMemo<SessionSpec>(
    () => ({
      kind: 'daily',
      title: 'Daily test',
      closeHref: '#/',
      load: async () => {
        const db = await getDB();
        const progress = await db.getAll('unitProgress');
        const mistakes = await db.getAll('mistakes');

        // Only draw on units the learner has actually opened.
        const opened = progress.filter((p) => p.unlocked).map((p) => p.unit);
        const units = opened.length > 0 ? opened : [1];
        const pools = await Promise.all(units.map((u) => loadExercises(u).catch(() => [])));
        const pool = pools.flat();

        const level = highestLevel(units);
        return { items: buildDailyTest(pool, mistakes, `daily:${dayKey()}`), level };
      },
    }),
    [],
  );
  return <ExerciseSession spec={spec} />;
}

/** 60 items across a whole level, exam-styled. */
export function LevelTest({ level }: { level: Level }) {
  const spec = useMemo<SessionSpec>(
    () => ({
      kind: 'level',
      title: `${level} level test`,
      closeHref: '#/course',
      level,
      load: async () => {
        const units = unitsForLevel(level);
        const pools = await Promise.all(units.map((u) => loadExercises(u).catch(() => [])));
        const byUnit = new Map(units.map((u, i) => [u, pools[i] ?? []]));
        return { items: buildLevelTest(byUnit, level, `level:${level}`), level };
      },
    }),
    [level],
  );
  return <ExerciseSession spec={spec} />;
}

function highestLevel(units: number[]): Level {
  const order: Level[] = ['A1', 'A2', 'B1'];
  let best = 0;
  for (const unit of units) {
    const plan = UNITS.find((u) => u.unit === unit);
    if (plan) best = Math.max(best, order.indexOf(plan.level));
  }
  return order[best] ?? 'A1';
}

function UnknownUnit() {
  return (
    <Screen title="Unknown unit">
      <a class="btn btn-primary btn-block" href="#/course">Back to the course</a>
    </Screen>
  );
}
