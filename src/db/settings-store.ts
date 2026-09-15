import { useEffect, useState } from 'preact/hooks';
import { getSettings, saveSettings } from './index.ts';
import { DEFAULT_SETTINGS, type Settings } from './types.ts';

/**
 * Tiny module-level store so every screen sees the same settings without a
 * context provider. Reads are synchronous after the first load.
 */
let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
let loading: Promise<Settings> | null = null;
const listeners = new Set<(s: Settings) => void>();

function emit(): void {
  for (const fn of listeners) fn(current);
}

export async function loadSettings(): Promise<Settings> {
  if (loaded) return current;
  loading ??= getSettings().then((s) => {
    current = s;
    loaded = true;
    emit();
    return s;
  });
  return loading;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  current = await saveSettings(patch);
  loaded = true;
  emit();
  return current;
}

export function useSettings(): { settings: Settings; ready: boolean } {
  const [state, setState] = useState<{ settings: Settings; ready: boolean }>({
    settings: current,
    ready: loaded,
  });

  useEffect(() => {
    const onChange = (s: Settings) => { setState({ settings: s, ready: true }); };
    listeners.add(onChange);
    void loadSettings();
    return () => { listeners.delete(onChange); };
  }, []);

  return state;
}

/** Applies the theme choice to <html data-theme>; 'system' removes the attribute. */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
