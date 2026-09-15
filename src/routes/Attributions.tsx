import { Screen } from '~/components/Screen.tsx';
import { FURTHER_READING, SOURCES } from '~/lib/attributions.ts';
import { t } from '~/i18n/strings.ts';

export function Attributions() {
  return (
    <Screen title={t.attributions.title}>
      <p class="small">{t.attributions.intro}</p>

      <div class="stack">
        {SOURCES.map((s) => (
          <section class="card" key={s.id}>
            <div class="row-between" style="align-items:flex-start">
              <h2 style="margin:0">
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
              </h2>
              <span class="badge">{s.bundled ? 'bundled' : 'linked only'}</span>
            </div>
            <p class="small" style="margin:8px 0 4px">{s.used}</p>
            <p class="small muted" style="margin:0 0 4px">
              {t.common.license}:{' '}
              <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">{s.license}</a>
            </p>
            <p class="small muted" style="margin:0">
              {t.attributions.modifications}: {s.modifications}
            </p>
          </section>
        ))}
      </div>

      <section class="card">
        <h2>{t.common.furtherReading}</h2>
        <p class="small muted">
          Proprietary sites linked from grammar topics. No text from these is copied into this app.
        </p>
        <ul class="small" style="padding-left:18px;margin:0">
          {FURTHER_READING.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a>
            </li>
          ))}
        </ul>
      </section>

      <section class="card">
        <h2>This app</h2>
        <p class="small" style="margin:0">
          Code is MIT-licensed. The bundled <code class="mono">data/</code> directory is CC BY-SA 4.0,
          as required by share-alike.{' '}
          <a href="https://github.com/izmirligilgurkan/Deutsch-Path" target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </p>
      </section>
    </Screen>
  );
}
