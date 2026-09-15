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
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'quote'; content: Inline[] }
  | { type: 'code'; text: string };

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const token = match[0];
    const start = match.index;
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) });

    if (token.startsWith('**')) {
      out.push({ type: 'bold', text: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      out.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      out.push({
        type: 'link',
        text: token.slice(1, split),
        href: token.slice(split + 2, -1),
      });
    } else {
      out.push({ type: 'italic', text: token.slice(1, -1) });
    }
    last = start + token.length;
  }

  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
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
