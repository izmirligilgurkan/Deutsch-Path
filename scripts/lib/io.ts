import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const RAW_DIR = `${ROOT}raw/`;
export const DATA_DIR = `${ROOT}data/`;

/** Streams a text file line by line, so a 1 GB dump never loads into memory. */
export async function* readLines(path: string): AsyncGenerator<string> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length > 0) yield line;
  }
}

/** Streams a bzip2 file line by line via the system `bzcat`. */
export async function* readBz2Lines(path: string): AsyncGenerator<string> {
  const proc = spawn('bzcat', [path], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.length > 0) yield line;
    }
  } finally {
    proc.kill();
  }
}

/** Streams the single member of a .tar.bz2, line by line. */
export async function* readTarBz2Lines(path: string): AsyncGenerator<string> {
  const proc = spawn('tar', ['-xjOf', path], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.length > 0) yield line;
    }
  } finally {
    proc.kill();
  }
}

/** Writes JSON atomically, so an interrupted build never leaves half a file. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await pipeline(
    (function* () {
      yield JSON.stringify(value);
      yield '\n';
    })(),
    createWriteStream(tmp, { encoding: 'utf8' }),
  );
  await rename(tmp, path);
}

export function progress(label: string, every = 100_000) {
  let n = 0;
  return {
    tick(): void {
      n += 1;
      if (n % every === 0) process.stdout.write(`    ${label}: ${n.toLocaleString()}\n`);
    },
    get count(): number {
      return n;
    },
  };
}

/**
 * Re-joins the split lexicon for build steps that need inflection tables.
 *
 * The app loads `core.json` plus only the level it needs; a build script runs
 * on a laptop, so it just takes everything.
 */
export async function loadFullLexicon(): Promise<import('../../src/lib/content-types.ts').Lemma[]> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  type Lemma = import('../../src/lib/content-types.ts').Lemma;
  type Form = import('../../src/lib/content-types.ts').Form;

  const core = JSON.parse(
    await readFile(join(DATA_DIR, 'lexicon', 'core.json'), 'utf8'),
  ) as Lemma[];

  const forms: Record<string, Form[]> = {};
  for (const level of ['A1', 'A2', 'B1'] as const) {
    Object.assign(
      forms,
      JSON.parse(await readFile(join(DATA_DIR, 'lexicon', `forms-${level}.json`), 'utf8')) as Record<
        string,
        Form[]
      >,
    );
  }
  return core.map((l) => ({ ...l, forms: forms[l.id] ?? [] }));
}

/** Every selected sentence, across levels. */
export async function loadAllSentences(): Promise<
  import('../../src/lib/content-types.ts').Sentence[]
> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  type Sentence = import('../../src/lib/content-types.ts').Sentence;
  const out: Sentence[] = [];
  for (const level of ['A1', 'A2', 'B1'] as const) {
    out.push(
      ...(JSON.parse(
        await readFile(join(DATA_DIR, 'sentences', `${level}.json`), 'utf8'),
      ) as Sentence[]),
    );
  }
  return out;
}
