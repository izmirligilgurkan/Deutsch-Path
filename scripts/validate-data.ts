/**
 * Gatekeeper for data/ (spec §7). Runs in CI; a non-zero exit fails the build.
 *
 * It enforces the rules that keep the project honest: everything shown to the
 * learner is sourced, licensed for redistribution, and traceable back to the
 * record it came from.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

const LICENSE_ALLOWLIST = new Set([
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-2.0-FR',
  'CC0-1.0',
]);

/** Size budget from spec §7. */
const MAX_DATA_BYTES = 15 * 1024 * 1024;

const problems: string[] = [];
const notes: string[] = [];

function fail(where: string, msg: string): void {
  problems.push(`${where}: ${msg}`);
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

interface AnyRecord { [k: string]: unknown }

function checkProvenance(where: string, rec: AnyRecord): void {
  const license = rec['license'];
  if (typeof license !== 'string' || license.length === 0) {
    fail(where, 'missing "license"');
  } else if (!LICENSE_ALLOWLIST.has(license)) {
    fail(where, `licence "${license}" is not on the allowlist`);
  }

  const source = rec['source'];
  const hasSourceName = typeof source === 'string' && source.length > 0;
  const hasSourceRef =
    (typeof rec['sourceUrl'] === 'string' && (rec['sourceUrl'] as string).length > 0) ||
    rec['sourceId'] !== undefined ||
    rec['tatoebaId'] !== undefined;

  if (!hasSourceName && rec['tatoebaId'] === undefined) fail(where, 'missing "source"');
  if (!hasSourceRef) fail(where, 'missing "sourceUrl" / "sourceId"');
}

async function validateLexicon(): Promise<Map<string, AnyRecord>> {
  const byId = new Map<string, AnyRecord>();
  const lexicon = await readJson<AnyRecord[]>(join(DATA_DIR, 'lexicon.json'));
  if (!lexicon) {
    notes.push('data/lexicon.json not present yet (built in phase 2).');
    return byId;
  }
  if (!Array.isArray(lexicon)) {
    fail('lexicon.json', 'expected a JSON array');
    return byId;
  }

  lexicon.forEach((lemma, i) => {
    const where = `lexicon[${i}] (${String(lemma['lemma'] ?? '?')})`;
    const id = lemma['id'];
    if (typeof id !== 'string' || id.length === 0) {
      fail(where, 'missing "id"');
    } else if (byId.has(id)) {
      fail(where, `duplicate id "${id}"`);
    } else {
      byId.set(id, lemma);
    }

    if (typeof lemma['lemma'] !== 'string' || (lemma['lemma'] as string).length === 0) {
      fail(where, 'missing "lemma"');
    }
    checkProvenance(where, lemma);

    // Every noun needs a gender and a plural, or an explicit flag from
    // Wiktionary saying why it has neither. Pluralia tantum (Eltern, Leute,
    // Ferien) are the real exception: German gives them no singular and so no
    // gender, and Wiktionary tags them `plural-only`.
    if (lemma['pos'] === 'noun') {
      const pluralOnly = lemma['pluralOnly'] === true;
      if (!['m', 'f', 'n'].includes(String(lemma['gender'])) && !pluralOnly) {
        fail(where, 'noun without a gender and not marked pluralOnly');
      }
      const hasPlural = typeof lemma['plural'] === 'string' && (lemma['plural'] as string).length > 0;
      if (!hasPlural && lemma['noPlural'] !== true && !pluralOnly) {
        fail(where, 'noun without a plural, a noPlural flag or a pluralOnly flag');
      }
    }

    // A Goethe level must never reach the repo; only on-device imports may set it.
    if (lemma['levelSource'] === 'goethe-import') {
      fail(where, 'Goethe-derived level found in committed data — this must stay on-device only');
    }
  });

  return byId;
}

async function validateSentences(): Promise<Map<number, AnyRecord>> {
  const byId = new Map<number, AnyRecord>();
  const sentences = await readJson<AnyRecord[]>(join(DATA_DIR, 'sentences.json'));
  if (!sentences) {
    notes.push('data/sentences.json not present yet (built in phase 2).');
    return byId;
  }
  if (!Array.isArray(sentences)) {
    fail('sentences.json', 'expected a JSON array');
    return byId;
  }

  sentences.forEach((s, i) => {
    const where = `sentences[${i}] (#${String(s['id'] ?? '?')})`;
    const id = s['id'];
    if (typeof id !== 'number') fail(where, 'missing numeric "id"');
    else if (byId.has(id)) fail(where, `duplicate id ${id}`);
    else byId.set(id, s);

    for (const field of ['de', 'en', 'author']) {
      if (typeof s[field] !== 'string' || (s[field] as string).length === 0) {
        fail(where, `missing "${field}"`);
      }
    }
    if (typeof s['tatoebaId'] !== 'number') fail(where, 'missing "tatoebaId"');
    checkProvenance(where, s);
  });

  return byId;
}

async function validateExercises(
  lemmas: Map<string, AnyRecord>,
  sentences: Map<number, AnyRecord>,
): Promise<void> {
  const dir = join(DATA_DIR, 'exercises');
  if (!existsSync(dir)) {
    notes.push('data/exercises/ not present yet (built in phase 2).');
    return;
  }

  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
    const items = await readJson<AnyRecord[]>(join(dir, file));
    if (!Array.isArray(items)) {
      fail(`exercises/${file}`, 'expected a JSON array');
      continue;
    }

    items.forEach((ex, i) => {
      const where = `exercises/${file}[${i}] (${String(ex['id'] ?? '?')})`;

      if (typeof ex['generator'] !== 'string' || (ex['generator'] as string).length === 0) {
        fail(where, 'missing "generator" — every item must name the rule that produced it');
      }

      const refs = (ex['refs'] ?? {}) as AnyRecord;
      const lemmaIds = Array.isArray(refs['lemmaIds']) ? (refs['lemmaIds'] as unknown[]) : [];
      for (const id of lemmaIds) {
        if (lemmas.size > 0 && !lemmas.has(String(id))) {
          fail(where, `references unknown lemma "${String(id)}"`);
        }
      }

      const sentenceId = refs['sentenceId'];
      let sentence: AnyRecord | undefined;
      if (sentenceId !== undefined) {
        sentence = sentences.get(Number(sentenceId));
        if (sentences.size > 0 && !sentence) {
          fail(where, `references unknown sentence ${String(sentenceId)}`);
        }
      }

      // A cloze answer must be lifted verbatim from its source sentence —
      // never computed and inserted into text we made up.
      if (ex['type'] === 'cloze') {
        if (!sentence) {
          fail(where, 'cloze without a sentence reference');
        } else {
          const de = String(sentence['de']);
          const answers = Array.isArray(ex['answer']) ? ex['answer'] : [ex['answer']];
          for (const a of answers) {
            if (!de.includes(String(a))) {
              fail(where, `cloze answer "${String(a)}" does not appear in sentence #${String(sentenceId)}`);
            }
          }
        }
      }
    });
  }
}

async function validateGrammar(): Promise<void> {
  const dir = join(DATA_DIR, 'grammar');
  if (!existsSync(dir)) {
    notes.push('data/grammar/ not present yet (built in phase 2).');
    return;
  }
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md'))) {
    const body = await readFile(join(dir, file), 'utf8');
    const where = `grammar/${file}`;
    // Each topic carries a YAML front-matter attribution header.
    if (!body.startsWith('---')) {
      fail(where, 'missing front-matter attribution header');
      continue;
    }
    const header = body.slice(3, body.indexOf('\n---', 3));
    for (const key of ['source:', 'sourceUrl:', 'license:']) {
      if (!header.includes(key)) fail(where, `front matter missing "${key}"`);
    }
    const licenseLine = /license:\s*(\S+)/.exec(header)?.[1];
    if (licenseLine && !LICENSE_ALLOWLIST.has(licenseLine)) {
      fail(where, `licence "${licenseLine}" is not on the allowlist`);
    }
  }
}

async function checkNoGoetheData(): Promise<void> {
  // Belt and braces: the import output must never be committed.
  for (const name of ['goethe-levels.json', 'goethe.json']) {
    if (existsSync(join(DATA_DIR, name))) {
      fail(`data/${name}`, 'Goethe-derived file must never be committed');
    }
  }
}

async function checkSize(): Promise<void> {
  if (!existsSync(DATA_DIR)) return;
  let total = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else total += (await stat(path)).size;
    }
  };
  await walk(DATA_DIR);
  const mb = (total / 1024 / 1024).toFixed(2);
  if (total > MAX_DATA_BYTES) {
    fail('data/', `${mb} MB exceeds the ${MAX_DATA_BYTES / 1024 / 1024} MB budget`);
  } else {
    notes.push(`data/ is ${mb} MB (budget ${MAX_DATA_BYTES / 1024 / 1024} MB).`);
  }
}

const lemmas = await validateLexicon();
const sentences = await validateSentences();
await validateExercises(lemmas, sentences);
await validateGrammar();
await checkNoGoetheData();
await checkSize();

for (const note of notes) console.log(`note  ${note}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} validation problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log(
  `\n✓ data validation passed (${lemmas.size} lemmas, ${sentences.size} sentences).`,
);
