import type { ComponentChildren } from 'preact';

/** Standard screen frame: one title, optional subtitle, then content. */
export function Screen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ComponentChildren;
}) {
  return (
    <>
      <header style="margin-bottom:16px">
        <h1>{title}</h1>
        {subtitle ? <p class="muted small" style="margin:0">{subtitle}</p> : null}
      </header>
      {children}
    </>
  );
}

/**
 * Placeholder for a feature a later phase fills in. Per the spec, a gap is
 * shown as a stub with reference links — never filled in with invented content.
 */
export function Stub({
  what,
  phase,
  links = [],
}: {
  what: string;
  phase: string;
  links?: { label: string; url: string }[];
}) {
  return (
    <div class="notice">
      <p style="margin:0 0 6px"><strong>{what}</strong> is not built yet.</p>
      <p class="small muted" style="margin:0">Planned for {phase}.</p>
      {links.length > 0 ? (
        <ul class="small" style="margin:10px 0 0;padding-left:18px">
          {links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
