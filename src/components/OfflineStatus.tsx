import { useEffect, useState } from 'preact/hooks';
import { formatMB, offlineState, warmOfflineCache, type OfflineProgress } from '~/lib/offline.ts';

/**
 * Whether the course is actually on the device.
 *
 * The app downloads it by itself on every start, but a download that was
 * interrupted — the connection went, the tab closed — leaves the learner
 * believing they are covered when they are not. This says what is really
 * cached and offers to finish the job.
 */
export function OfflineStatus() {
  const [state, setState] = useState<OfflineProgress | null>(null);
  const [busy, setBusy] = useState(false);

  // The app fills the cache in the background, so this screen keeps looking
  // until it is complete rather than reporting whatever was true on mount.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = () => {
      void offlineState()
        .then((s) => {
          if (!live) return;
          setState(s);
          if (s.done < s.total) timer = setTimeout(poll, 1000);
        })
        .catch(() => { if (live) setState(null); });
    };
    poll();

    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function download() {
    setBusy(true);
    try {
      setState(await warmOfflineCache((p) => { setState(p); }));
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <p class="small muted" style="margin:0">This browser cannot store the course offline.</p>;
  }

  const complete = state.done >= state.total;
  return (
    <div class="stack">
      <p class="small" style="margin:0">
        {complete ? (
          <>The whole course is on this device — {formatMB(state.totalBytes)}, ready offline.</>
        ) : (
          <>
            {state.done} of {state.total} files saved ({formatMB(state.bytes)} of{' '}
            {formatMB(state.totalBytes)}). What is missing will be fetched when you are online.
          </>
        )}
      </p>
      {complete ? null : (
        <button class="btn-block" disabled={busy} onClick={() => { void download(); }}>
          {busy ? 'Downloading…' : 'Download the rest now'}
        </button>
      )}
    </div>
  );
}
