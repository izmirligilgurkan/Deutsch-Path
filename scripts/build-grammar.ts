/**
 * Wikibooks: German → data/grammar/<topic>.md
 *
 * Explanations are excerpted, never written. Each file carries a front-matter
 * header naming the source page, its revision, its licence and the fact that
 * the text was shortened — what CC BY-SA attribution requires.
 *
 * A topic the open sources do not cover becomes a stub: it says so and links
 * out. The gap is never filled in by hand.
 *
 *   npm run data:grammar
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { htmlToMarkdown } from './lib/html-to-markdown.ts';
import { TOPIC_SOURCES } from './lib/grammar-map.ts';
import { DATA_DIR } from './lib/io.ts';
import { ALL_TOPICS, UNITS, unitsForTopic } from '../src/lib/syllabus.ts';
import type { Level } from '../src/lib/content-types.ts';

const API = 'https://en.wikibooks.org/w/api.php';
const LICENSE = 'CC-BY-SA-4.0';
const SOURCE = 'Wikibooks: German';

/** Wikimedia asks for a descriptive agent and modest request rates. */
const USER_AGENT =
  'Deutsch-Path/0.1 (https://github.com/izmirligilgurkan/Deutsch-Path; one-off content build)';
const REQUEST_DELAY_MS = 1200;

/** A phone screen, not a textbook chapter. */
const MAX_CHARS = 6000;

const OUT_DIR = join(DATA_DIR, 'grammar');

interface ParseResult {
  parse?: { title?: string; revid?: number; text?: string };
  error?: { code?: string; info?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(title: string): Promise<{ html: string; revid: number } | null> {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text|revid&format=json&formatversion=2`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    if (res.status === 429 || res.status >= 500) {
      const wait = REQUEST_DELAY_MS * 2 ** (attempt + 1);
      console.log(`      rate-limited (${res.status}), waiting ${wait}ms`);
      await sleep(wait);
      continue;
    }
    const body = (await res.json()) as ParseResult;
    if (body.error) {
      console.log(`      API error: ${body.error.code ?? '?'} ${body.error.info ?? ''}`);
      return null;
    }
    const text = body.parse?.text;
    if (typeof text !== 'string') return null;
    return { html: text, revid: body.parse?.revid ?? 0 };
  }
  return null;
}

function levelForTopic(topic: string): Level {
  return UNITS.find((u) => u.topics.includes(topic))?.level ?? 'A1';
}

function frontMatter(fields: Record<string, string | number | boolean | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' && /[:#]/.test(v) ? JSON.stringify(v) : String(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

await mkdir(OUT_DIR, { recursive: true });

let written = 0;
let stubs = 0;
const missing: string[] = [];

for (const topic of ALL_TOPICS) {
  const spec = TOPIC_SOURCES[topic];
  if (!spec) {
    console.log(`!! ${topic}: no entry in grammar-map.ts`);
    missing.push(topic);
    continue;
  }

  const units = unitsForTopic(topic);
  const level = levelForTopic(topic);
  const further = spec.furtherReading ?? [];
  const readingBlock =
    further.length > 0
      ? `\n\n## Further reading\n\n${further.map((l) => `- [${l.label}](${l.url})`).join('\n')}\n`
      : '\n';

  let body = '';
  let header: Record<string, string | number | boolean | undefined>;

  if (spec.page) {
    process.stdout.write(`   ${topic} ← ${spec.page}${spec.section ? ` §${spec.section}` : ''}\n`);
    const page = await fetchPage(spec.page);
    await sleep(REQUEST_DELAY_MS);

    if (page) {
      body = htmlToMarkdown(page.html, {
        section: spec.section,
        maxChars: MAX_CHARS,
      });
    }

    if (body.length < 120) {
      // The page exists but yielded nothing usable (a redirect or a stub).
      console.log(`      too little content — writing a stub instead`);
      body = '';
    }

    if (body) {
      // Wiki URLs use underscores for spaces and keep their slashes; encoding
      // the whole title with encodeURIComponent would escape the slashes too.
      const pageUrl = `https://en.wikibooks.org/wiki/${spec.page.replace(/ /g, '_')}`;
      header = {
        id: topic,
        title: spec.title,
        level,
        units: `[${units.join(', ')}]`,
        stub: false,
        source: SOURCE,
        sourcePage: spec.page,
        sourceUrl: pageUrl,
        sourceRevision: page?.revid,
        license: LICENSE,
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        modified: 'Excerpted and converted to Markdown; headings shifted. Text not rewritten.',
        retrieved: new Date().toISOString().slice(0, 10),
      };
      written += 1;
    } else {
      header = stubHeader(topic, spec.title, level, units);
      stubs += 1;
    }
  } else {
    header = stubHeader(topic, spec.title, level, units);
    stubs += 1;
  }

  const isStub = header['stub'] === true;
  const content = isStub
    ? `${frontMatter(header)}\n# ${spec.title}\n\n` +
      `No openly licensed explanation of this topic was available to bundle, so ` +
      `none is shown here rather than an invented one. The drills for this topic ` +
      `still use real sentences and Wiktionary forms.\n` +
      `${readingBlock}`
    : `${frontMatter(header)}\n# ${spec.title}\n\n${body}\n${readingBlock}`;

  await writeFile(join(OUT_DIR, `${topic}.md`), content, 'utf8');
}

function stubHeader(
  topic: string,
  title: string,
  level: Level,
  units: number[],
): Record<string, string | number | boolean | undefined> {
  return {
    id: topic,
    title,
    level,
    units: `[${units.join(', ')}]`,
    stub: true,
    source: 'none — no openly licensed source covers this topic',
    sourceUrl: 'https://en.wikibooks.org/wiki/German/Grammar',
    license: LICENSE,
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    modified: 'No source text included.',
    retrieved: new Date().toISOString().slice(0, 10),
  };
}

console.log(`\n✓ data/grammar/ — ${written} sourced, ${stubs} stubs, ${ALL_TOPICS.length} topics`);
if (missing.length > 0) console.log(`  unmapped: ${missing.join(', ')}`);
