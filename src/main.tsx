import { render } from 'preact';
import { App } from './app.tsx';
import { loadSettings, applyTheme } from './db/settings-store.ts';
import './styles/global.css';

// Apply the stored theme before first paint where possible, so a dark-mode
// learner does not get a white flash on launch.
void loadSettings().then((s) => { applyTheme(s.theme); });

const root = document.getElementById('app');
if (!root) throw new Error('#app mount point missing from index.html');
render(<App />, root);
