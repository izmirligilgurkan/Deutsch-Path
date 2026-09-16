import { useEffect, useMemo, useState } from 'preact/hooks';
import { Screen } from '~/components/Screen.tsx';
import { getDB } from '~/db/index.ts';
import { loadForms } from '~/lib/content.ts';
import { loadCourseLexicon } from '~/db/level-list.ts';
import { formKey } from '~/lib/tokenize.ts';
import { withArticle } from '~/srs/cards.ts';
import type { Form, Lemma } from '~/lib/content-types.ts';
import type { SeenLemma } from '~/db/types.ts';
import { t } from '~/i18n/strings.ts';

/** Searchable dictionary of the course vocabulary (spec §4.7). */
export function Dictionary() {
  const [lexicon, setLexicon] = useState<Lemma[]>([]);
  const [seen, setSeen] = useState<Map<string, SeenLemma>>(new Map());
  const [query, setQuery] = useState('');
  const [onlySeen, setOnlySeen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, Form[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [all, db] = await Promise.all([loadCourseLexicon(), getDB()]);
      setLexicon(all);
      setSeen(new Map((await db.getAll('seenLemmas')).map((s) => [s.lemmaId, s])));
      setLoading(false);
    })();
  }, []);

  const results = useMemo(() => {
    const q = formKey(query.trim());
    const pool = onlySeen ? lexicon.filter((l) => seen.has(l.id)) : lexicon;
    if (!q) return pool.slice(0, 60);
    // Prefix matches first — typing "Ha" should surface "Haus" before "Bahnhof".
    const starts: Lemma[] = [];
    const contains: Lemma[] = [];
    for (const l of pool) {
      const key = formKey(l.lemma);
      if (key.startsWith(q)) starts.push(l);
      else if (key.includes(q) || l.glosses.some((g) => g.toLowerCase().includes(q))) {
        contains.push(l);
      }
    }
    return [...starts, ...contains].slice(0, 60);
  }, [query, lexicon, onlySeen, seen]);

  /** Inflection tables load per level, only when an entry is expanded. */
  async function toggle(lemma: Lemma) {
    if (open === lemma.id) {
      setOpen(null);
      return;
    }
    setOpen(lemma.id);
    if (!forms[lemma.id] && lemma.level) {
      const levelForms = await loadForms(lemma.level);
      setForms((f) => ({ ...f, ...levelForms }));
    }
  }

  if (loading) return <Screen title={t.nav.dictionary}><p class="muted">{t.common.loading}</p></Screen>;

  return (
    <Screen title={t.nav.dictionary} subtitle={`${lexicon.length} words`}>
      <input
        type="text" value={query} placeholder="Search German or English"
        autocomplete="off" autocapitalize="off" spellcheck={false}
        onInput={(e) => { setQuery((e.target as HTMLInputElement).value); }}
      />
      <label class="setting">
        <span class="small">Only words I have studied ({seen.size})</span>
        <input type="checkbox" checked={onlySeen} onChange={(e) => { setOnlySeen((e.target as HTMLInputElement).checked); }} />
      </label>

      {results.length === 0 ? <p class="muted small">No matches.</p> : null}

      {results.map((lemma) => {
        const isOpen = open === lemma.id;
        const record = seen.get(lemma.id);
        return (
          <div class="card" key={lemma.id} style="padding:12px">
            <button
              style="all:unset;display:block;width:100%;cursor:pointer;min-height:44px"
              onClick={() => { void toggle(lemma); }}
              aria-expanded={isOpen}
            >
              <div class="row-between">
                <strong lang="de">{withArticle(lemma)}</strong>
                <span class="badge">{lemma.level ?? '—'}</span>
              </div>
              <div class="small muted">{lemma.glosses.slice(0, 2).join('; ')}</div>
            </button>

            {isOpen ? (
              <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
                <p class="small" style="margin:0 0 6px">
                  <strong>{lemma.pos}</strong>
                  {lemma.plural ? ` · plural: ${lemma.plural}` : ''}
                  {lemma.noPlural ? ' · no plural' : ''}
                  {lemma.pluralOnly ? ' · plural only' : ''}
                </p>
                {lemma.principalParts ? (
                  <p class="small mono" style="margin:0 0 6px">
                    {[lemma.principalParts.thirdSg, lemma.principalParts.praeteritum,
                      `${lemma.principalParts.auxiliary === 'sein' ? 'ist' : 'hat'} ${lemma.principalParts.partizip2 ?? ''}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                ) : null}

                <ol class="small" style="margin:0 0 8px;padding-left:18px">
                  {lemma.glosses.map((g) => <li key={g}>{g}</li>)}
                </ol>

                {forms[lemma.id]?.length ? (
                  <details>
                    <summary class="small">Full form table ({forms[lemma.id]!.length})</summary>
                    <div class="table-scroll">
                      <table>
                        <tbody>
                          {forms[lemma.id]!.map((f, i) => (
                            <tr key={i}>
                              <td class="mono" lang="de">{f.form}</td>
                              <td class="small muted">{f.tags.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}

                {record ? (
                  <p class="small muted" style="margin:8px 0 0">
                    {record.timesCorrect} correct · {record.timesWrong} wrong
                  </p>
                ) : null}

                <p class="attribution">
                  <a href={lemma.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {lemma.source}
                  </a> · {lemma.license}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </Screen>
  );
}
