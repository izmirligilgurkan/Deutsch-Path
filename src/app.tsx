import { useEffect } from 'preact/hooks';
import { ErrorBoundary } from '~/components/ErrorBoundary.tsx';
import { TabBar } from '~/components/TabBar.tsx';
import { UpdatePrompt } from '~/components/UpdatePrompt.tsx';
import { applyTheme, useSettings } from '~/db/settings-store.ts';
import { matchRoute } from '~/router/hash-router.ts';
import { useRoute } from '~/router/use-route.ts';

import { Attributions } from '~/routes/Attributions.tsx';
import { Course } from '~/routes/Course.tsx';
import { Dictionary } from '~/routes/Dictionary.tsx';
import { Home } from '~/routes/Home.tsx';
import { ImportLevelList } from '~/routes/ImportLevelList.tsx';
import { NotFound } from '~/routes/NotFound.tsx';
import { Onboarding } from '~/routes/Onboarding.tsx';
import { Progress } from '~/routes/Progress.tsx';
import { Review } from '~/routes/Review.tsx';
import { Settings } from '~/routes/Settings.tsx';
import { Unit } from '~/routes/Unit.tsx';
import { ExerciseSession } from '~/routes/ExerciseSession.tsx';

import type { JSX } from 'preact';
import type { RouteParams } from '~/router/hash-router.ts';

/** Ordered most-specific first; the first match wins. */
const ROUTES: { pattern: string; render: (params: RouteParams) => JSX.Element }[] = [
  { pattern: '/', render: () => <Home /> },
  { pattern: '/onboarding', render: () => <Onboarding /> },
  { pattern: '/course', render: () => <Course /> },
  { pattern: '/unit/:unit/drill', render: (p) => <ExerciseSession unit={Number(p['unit'])} mode="drill" /> },
  { pattern: '/unit/:unit/test', render: (p) => <ExerciseSession unit={Number(p['unit'])} mode="test" /> },
  { pattern: '/unit/:unit', render: (p) => <Unit unit={Number(p['unit'])} /> },
  { pattern: '/review/leeches', render: () => <Review leechMode /> },
  { pattern: '/review', render: () => <Review /> },
  { pattern: '/dictionary', render: () => <Dictionary /> },
  { pattern: '/progress', render: () => <Progress /> },
  { pattern: '/settings', render: () => <Settings /> },
  { pattern: '/import-level-list', render: () => <ImportLevelList /> },
  { pattern: '/attributions', render: () => <Attributions /> },
];

export function App() {
  const { path } = useRoute();
  const { settings, ready } = useSettings();

  useEffect(() => {
    if (ready) applyTheme(settings.theme);
  }, [ready, settings.theme]);

  let screen: JSX.Element = <NotFound path={path} />;
  for (const route of ROUTES) {
    const params = matchRoute(route.pattern, path);
    if (params) {
      screen = route.render(params);
      break;
    }
  }

  return (
    <div class="app-shell">
      <main class="app-main">
        {/* Keyed so a crash on one screen clears when the learner navigates away. */}
        <ErrorBoundary key={path}>{screen}</ErrorBoundary>
      </main>
      <TabBar path={path} />
      <UpdatePrompt />
    </div>
  );
}
