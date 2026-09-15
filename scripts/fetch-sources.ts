/**
 * Downloads the raw source dumps into raw/ (gitignored) and records exactly
 * what was fetched, when, and under what licence in raw/MANIFEST.json.
 *
 * The manifest is the audit trail: committed data can always be traced back to
 * a dated snapshot of a specific URL.
 *
 *   npm run data:fetch            # fetch anything missing
 *   npm run data:fetch -- --force # re-fetch everything
 *   npm run data:fetch -- kaikki-de
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, type Manifest, type ManifestEntry } from './sources.ts';

const RAW_DIR = fileURLToPath(new URL('../raw/', import.meta.url));
const MANIFEST_PATH = join(RAW_DIR, 'MANIFEST.json');

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const only = new Set(argv.filter((a) => !a.startsWith('--')));

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function download(url: string, dest: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }

  const total = Number(res.headers.get('content-length') ?? 0);
  let seen = 0;
  let lastLogged = 0;

  // Write to a .part file and rename on success, so an interrupted download
  // is never mistaken for a complete one.
  const part = `${dest}.part`;
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on('data', (chunk: Buffer) => {
    seen += chunk.length;
    if (seen - lastLogged > 25 * 1024 * 1024) {
      lastLogged = seen;
      // content-length reflects the transferred (possibly compressed) size,
      // so only show a percentage while it is still meaningful.
      const pct = total && seen <= total ? ` (${((seen / total) * 100).toFixed(0)}%)` : '';
      process.stdout.write(`    ${mb(seen)}${pct}\n`);
    }
  });
  await pipeline(body, createWriteStream(part));
  await rename(part, dest);

  return res.headers.get('last-modified');
}

await mkdir(RAW_DIR, { recursive: true });

const manifest: Manifest = existsSync(MANIFEST_PATH)
  ? (JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest)
  : {};

for (const source of SOURCES) {
  if (only.size > 0 && !only.has(source.id)) continue;

  const dest = join(RAW_DIR, source.file);
  const recorded = manifest[source.id];
  if (existsSync(dest) && !force && recorded) {
    console.log(`skip  ${source.id} — already in raw/ (${mb(recorded.bytes)})`);
    continue;
  }

  console.log(`fetch ${source.id}\n      ${source.url}`);
  const lastModified = await download(source.url, dest);
  const bytes = (await stat(dest)).size;

  const entry: ManifestEntry = {
    id: source.id,
    url: source.url,
    file: source.file,
    bytes,
    sha256: await sha256(dest),
    downloadedAt: new Date().toISOString(),
    lastModified,
    license: source.license,
    licenseUrl: source.licenseUrl,
    what: source.what,
  };
  manifest[source.id] = entry;
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`      ${mb(bytes)}  sha256 ${entry.sha256.slice(0, 16)}…\n`);
}

console.log(`manifest → ${MANIFEST_PATH}`);
