import { parse, type HTMLElement, type Node } from 'node-html-parser';

/**
 * Deterministic HTML → Markdown for MediaWiki article bodies.
 *
 * Tables matter here: German declension and conjugation tables carry most of
 * the information in a grammar explanation, so they are converted rather than
 * dropped. Everything is a structural transformation — no text is rewritten.
 */

/** Wiki furniture that is navigation or editing chrome, not explanation. */
const DROP_SELECTORS = [
  'style',
  'script',
  'sup.reference',
  '.mw-editsection',
  '.navbox',
  '.metadata',
  '.ambox',
  '.toc',
  '#toc',
  '.mw-jump-link',
  '.noprint',
  '.mw-empty-elt',
  '.hatnote',
  '.sisterproject',
  '.printfooter',
  '.catlinks',
  '.mw-references-wrap',
  'table.messagebox',
  // Wikibooks puts the book's chapter navigation in a table.top banner at the
  // head and foot of every page.
  'table.top',
  'table.navigation',
  '.navigation',
  '.sidebar',
];

function textOf(node: Node): string {
  return node.text.replace(/\s+/g, ' ').trim();
}

function inline(el: Node): string {
  const anyEl = el as HTMLElement;
  if (!anyEl.tagName) return el.text.replace(/\s+/g, ' ');

  const tag = anyEl.tagName.toLowerCase();
  const inner = anyEl.childNodes.map(inline).join('');

  switch (tag) {
    case 'b':
    case 'strong':
      return inner.trim() ? `**${inner.trim()}**` : '';
    case 'i':
    case 'em':
      return inner.trim() ? `*${inner.trim()}*` : '';
    case 'code':
    case 'tt':
      return inner.trim() ? `\`${inner.trim()}\`` : '';
    case 'br':
      return ' ';
    case 'a': {
      // Links are flattened to their text: the app links to the source page as
      // a whole, and relative wiki hrefs would not resolve offline.
      return inner;
    }
    default:
      return inner;
  }
}

function cellText(cell: HTMLElement): string {
  return inline(cell).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

/**
 * Navigation dressed as content: nearly all of its text sits inside links.
 *
 * Wikibooks puts chapter navigation in ordinary tables and paragraphs, so
 * naming templates is not enough. A real grammar table (declensions,
 * conjugations) is mostly plain word forms with few or no links, and a real
 * paragraph is mostly prose, so link density separates them reliably.
 */
function isNavigation(el: HTMLElement): boolean {
  const links = el.querySelectorAll('a');
  if (links.length === 0) return false;
  const linkText = links.map((a) => a.text.trim()).join('').length;
  const raw = el.text.replace(/\s+/g, '');
  if (raw.length === 0 || linkText / raw.length <= 0.8) return false;
  // Either a long run of links, or a fragment that is nothing but a link and
  // has no sentence in it — explanatory prose always ends a sentence.
  return links.length >= 5 || !/[.!?:]/.test(el.text);
}

function span(cell: HTMLElement, attr: 'colspan' | 'rowspan'): number {
  const n = Number.parseInt(cell.getAttribute(attr) ?? '1', 10);
  // A span wider than any real table is a malformed attribute, not a hint.
  return Number.isFinite(n) && n >= 1 && n <= 32 ? n : 1;
}

/**
 * Lay the cells out on the grid the source describes, honouring colspan and
 * rowspan.
 *
 * The conjugation tables are shaped for their third-person row — *Person,
 * Masculine, Feminine, Neuter, Plural* — and every other row spans the three
 * singular columns with one cell:
 *
 *     | colspan="3" | ich weiß || wir wissen
 *
 * Reading cells in document order put *wir wissen* in the Feminine column.
 * A spanned cell keeps its text in the first column it covers and leaves the
 * rest of the span empty, which is as close as Markdown gets to a merged cell.
 */
function layOutGrid(rows: HTMLElement[]): string[][] {
  const grid: (string | undefined)[][] = [];
  const at = (r: number): (string | undefined)[] => (grid[r] ??= []);

  rows.forEach((tr, r) => {
    at(r);
    let c = 0;
    for (const cell of tr.querySelectorAll(':scope > th, :scope > td')) {
      // Skip the columns a rowspan from an earlier row already occupies.
      while (at(r)[c] !== undefined) c += 1;
      const cols = span(cell, 'colspan');
      const text = cellText(cell);
      for (let dr = 0; dr < span(cell, 'rowspan'); dr += 1) {
        for (let dc = 0; dc < cols; dc += 1) {
          at(r + dr)[c + dc] = dr === 0 && dc === 0 ? text : '';
        }
      }
      c += cols;
    }
  });

  const width = Math.max(0, ...grid.map((row) => row.length));
  return grid.map((row) => {
    const out: string[] = [];
    for (let c = 0; c < width; c += 1) out.push(row[c] ?? '');
    return out;
  });
}

function tableToMarkdown(table: HTMLElement): string {
  if (isNavigation(table)) return '';
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return '';

  const grid = layOutGrid(rows);
  const [header, ...rest] = grid;
  if (!header || header.length === 0) return '';

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rest.map((r) => `| ${r.join(' | ')} |`),
  ];

  // The caption names what the table conjugates or declines; without it a
  // reader arriving mid-page cannot tell which verb the forms belong to.
  const caption = table.querySelector('caption');
  const title = caption ? cellText(caption) : '';
  return title ? `${title}\n\n${lines.join('\n')}` : lines.join('\n');
}

function listToMarkdown(list: HTMLElement, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth);
  const items: string[] = [];
  let n = 0;
  for (const li of list.querySelectorAll(':scope > li')) {
    n += 1;
    const marker = ordered ? `${n}.` : '-';
    // Render nested lists separately so they keep their own indentation.
    const nested: string[] = [];
    for (const child of li.querySelectorAll(':scope > ul, :scope > ol')) {
      nested.push(listToMarkdown(child, child.tagName.toLowerCase() === 'ol', depth + 1));
      child.remove();
    }
    const text = inline(li).replace(/\s+/g, ' ').trim();
    if (text) items.push(`${indent}${marker} ${text}`);
    items.push(...nested.filter(Boolean));
  }
  return items.join('\n');
}

function blockToMarkdown(el: HTMLElement, depth = 0): string {
  const tag = el.tagName?.toLowerCase();
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag[1]);
      const text = textOf(el);
      // MediaWiki's h1 is the page title; shift down so the app owns h1.
      return text ? `${'#'.repeat(Math.min(level + 1, 6))} ${text}` : '';
    }
    case 'p': {
      if (isNavigation(el)) return '';
      return inline(el).replace(/\s+/g, ' ').trim();
    }
    case 'ul':
      return listToMarkdown(el, false, depth);
    case 'ol':
      return listToMarkdown(el, true, depth);
    case 'table':
      return tableToMarkdown(el);
    case 'blockquote': {
      const text = inline(el).replace(/\s+/g, ' ').trim();
      return text ? `> ${text}` : '';
    }
    case 'pre':
      return el.text.trim() ? `\`\`\`\n${el.text.trim()}\n\`\`\`` : '';
    case 'dl': {
      const parts: string[] = [];
      for (const child of el.querySelectorAll(':scope > dt, :scope > dd')) {
        const text = inline(child).replace(/\s+/g, ' ').trim();
        if (!text) continue;
        parts.push(child.tagName.toLowerCase() === 'dt' ? `**${text}**` : text);
      }
      return parts.join('\n\n');
    }
    case 'div':
    case 'section': {
      return el.childNodes
        .filter((n): n is HTMLElement => Boolean((n as HTMLElement).tagName))
        .map((child) => blockToMarkdown(child, depth))
        .filter(Boolean)
        .join('\n\n');
    }
    default:
      return '';
  }
}

export interface ExtractOptions {
  /** Keep only the content under this heading, if given. */
  section?: string;
  /** Stop after this many characters, at a block boundary. */
  maxChars?: number;
}

/** A paradigm table is a few hundred characters; a reference list is not. */
const MAX_TRAILING_TABLE = 2000;

export function htmlToMarkdown(html: string, options: ExtractOptions = {}): string {
  const root = parse(html);
  for (const selector of DROP_SELECTORS) {
    for (const el of root.querySelectorAll(selector)) el.remove();
  }

  const body = root.querySelector('.mw-parser-output') ?? root;

  // MediaWiki now wraps every heading in <div class="mw-heading">, which would
  // hide the h2/h3 from the top-level block scan and break section selection.
  for (const wrapper of body.querySelectorAll('.mw-heading')) {
    const heading = wrapper.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) wrapper.replaceWith(heading);
  }
  const blocks = body.childNodes.filter((n): n is HTMLElement =>
    Boolean((n as HTMLElement).tagName),
  );

  let selected = blocks;
  if (options.section) {
    const wanted = options.section.toLowerCase();
    const start = blocks.findIndex(
      (el) => /^h[1-6]$/.test(el.tagName?.toLowerCase() ?? '') && textOf(el).toLowerCase().includes(wanted),
    );
    if (start !== -1) {
      const startLevel = Number(blocks[start]!.tagName[1]);
      const end = blocks.findIndex(
        (el, i) =>
          i > start &&
          /^h[1-6]$/.test(el.tagName?.toLowerCase() ?? '') &&
          Number(el.tagName[1]) <= startLevel,
      );
      selected = blocks.slice(start, end === -1 ? undefined : end);
    }
  }

  const out: string[] = [];
  let chars = 0;
  for (const block of selected) {
    const md = blockToMarkdown(block);
    if (!md) continue;
    if (options.maxChars && chars + md.length > options.maxChars && out.length > 0) {
      // The conjugation and declension tables are what a learner comes to a
      // grammar page for; the prose around them is the part that can be cut.
      // Stopping on a table kept the padding and dropped the content, so one
      // table is allowed over the budget and the excerpt ends with it —
      // unless it is a reference list rather than a paradigm. Wikibooks ends
      // some pages with the whole strong-verb table, which is 17 kB and not
      // an explanation of anything.
      if (block.tagName?.toLowerCase() !== 'table' || md.length > MAX_TRAILING_TABLE) break;
      out.push(md);
      break;
    }
    out.push(md);
    chars += md.length;
  }

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
