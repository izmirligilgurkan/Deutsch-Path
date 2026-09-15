import { useEffect, useState } from 'preact/hooks';
import { currentPath, currentQuery } from './hash-router.ts';

/** Re-renders on every hash change; the single source of routing truth. */
export function useRoute(): { path: string; query: URLSearchParams } {
  const [path, setPath] = useState(currentPath());
  const [query, setQuery] = useState(currentQuery());

  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      setQuery(currentQuery());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return { path, query };
}
