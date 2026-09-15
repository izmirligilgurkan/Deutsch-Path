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
import { Placement } from '~/routes/Placement.tsx';
import { Progress } from '~/routes/Progress.tsx';
import { Review } from '~/routes/Review.tsx';
import { Settings } from '~/routes/Settings.tsx';
import { Unit } from '~/routes/Unit.tsx';
import { DailyTest, LevelTest, UnitDrill, UnitTest } from '~/routes/sessions.tsx';

import type { JSX } from 'preact';
import type { RouteParams } from '~/router/hash-router.ts';
import type { Level } from '~/lib/content-types.ts';

/** Ordered most-specific first; the first match wins. */
const ROUTES: { pattern: string; render: (params: RouteParams) => JSX.Element }[] = [
  { pattern: '/', render: () => <Home /> },
  { pattern: '/onboarding', render: () => <Onboarding /> },
  { pattern: '/course', render: () => <Course /> },
  { pattern: '/unit/:unit/drill', render: (p) => <UnitDrill unit={Number(p['unit'])} /> },
  { pattern: '/unit/:unit/test', render: (p) => <UnitTest unit={Number(p['unit'])} /> },
  { pattern: '/test/daily', render: () => <DailyTest /> },
  { pattern: '/placement', render: () => <Placement /> },
  { pattern: '/test/level/:level', render: (p) => <LevelTest level={(p['level'] ?? 'A1') as Level} /> },
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

  // While answering, the tab bar is dead weight and its height matters on a
  // phone; the session's own Close button replaces it.
  const inSession = /^\/review(\/|$)|^\/unit\/[^/]+\/(drill|test)$|^\/test\/|^\/placement$/.test(path);

  let screen: JSX.Element = <NotFound path={path} />;
  for (const route of ROUTES) {
    const params = matchRoute(route.pattern, path);
    if (params) {
      screen = route.render(params);
      break;
    }
  }

  return (
    <div class={`app-shell${inSession ? ' in-session' : ''}`}>
      <main class="app-main">
        {/* Keyed so a crash on one screen clears when the learner navigates away. */}
        <ErrorBoundary key={path}>{screen}</ErrorBoundary>
      </main>
      {inSession ? null : <TabBar path={path} />}
      <UpdatePrompt />
    </div>
  );
}
