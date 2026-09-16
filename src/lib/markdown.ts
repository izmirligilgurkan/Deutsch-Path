/**
 * Minimal Markdown renderer for the sourced grammar files.
 *
 * Only the constructs build-grammar.ts emits are supported — headings,
 * paragraphs, lists, tables, bold/italic, code, links, blockquotes. Tables are
 * the important one: German declension and conjugation tables carry most of
 * the information in an explanation.
 *
 * Output is a token tree, not HTML, so nothing from the data can be injected
 * as markup. The renderer component turns tokens into elements.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; content: Inline[] }
  | { type: 'italic'; content: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'quote'; content: Inline[] }
  | { type: 'code'; text: string };

/**
 * Emphasis nests in the sourced files — a wiki example is italic prose with a
 * bold word inside it, and a table caption is bold with an italic verb inside:
 *
 *     *Wo ist der Mann? **Er** ist draußen.*
 *     **Conjugating *wissen*, present tense**
 *
 * A flat regex cannot see that, so it matched from the wrong star and left
 * literal asterisks on the screen. Emphasis is scanned instead, outermost
 * first, and the span inside is parsed the same way.
 */

/** Where the run of `*` that closes this one starts, or -1. */
function closingStar(text: string, from: number, width: number): number {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] !== '*') continue;
    let run = 0;
    while (text[i + run] === '*') run += 1;
    // A single star never closes at a `**`: that run opens the bold span
    // nested inside this italic one. Wider openers accept a wider run.
    if (run >= width && (width > 1 || run === 1)) return i;
    i += run - 1;
  }
  return -1;
}

const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === '[') {
      const link = LINK_RE.exec(text.slice(i));
      if (link?.[1] && link[2]) {
        flush();
        out.push({ type: 'link', text: link[1], href: link[2] });
        i += link[0].length;
        continue;
      }
    }

    if (ch === '*') {
      let width = 0;
      while (text[i + width] === '*' && width < 3) width += 1;
      const end = closingStar(text, i + width, width);
      if (end > i + width) {
        flush();
        const inner = parseInline(text.slice(i + width, end));
        // Three stars are bold and italic at once.
        out.push(
          width === 1
            ? { type: 'italic', content: inner }
            : width === 2
              ? { type: 'bold', content: inner }
              : { type: 'bold', content: [{ type: 'italic', content: inner }] },
        );
        i = end + width;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out.length > 0 ? out : [{ type: 'text', text }];
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    // A cell may contain an escaped pipe, which is not a separator.
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());
}

const isTableSeparator = (line: string): boolean => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

export function parseMarkdown(source: string): Block[] {
  const lines = source.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        content: parseInline(heading[2]!),
      });
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    // A table needs a header row followed by a separator row.
    if (line.trimStart().startsWith('|') && isTableSeparator(lines[i + 1] ?? '')) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.trimStart().startsWith('|')) {
        rows.push(splitRow(lines[i]!).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const bullet = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]!);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        items.push(parseInline(m[2]!));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (line.startsWith('>')) {
      blocks.push({ type: 'quote', content: parseInline(line.replace(/^>\s?/, '')) });
      i++;
      continue;
    }

    // Otherwise a paragraph: consecutive non-blank, non-structural lines.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const next = lines[i]!;
      if (
        next.trim() === '' ||
        next.startsWith('#') ||
        next.startsWith('>') ||
        next.startsWith('```') ||
        next.trimStart().startsWith('|') ||
        /^\s*([-*]|\d+\.)\s+/.test(next)
      ) {
        break;
      }
      paragraph.push(next);
      i++;
    }
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
    }
  }

  return blocks;
}
