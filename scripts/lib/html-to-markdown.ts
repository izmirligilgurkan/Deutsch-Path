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

function tableToMarkdown(table: HTMLElement): string {
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return '';

  const grid = rows.map((tr) =>
    tr.querySelectorAll('th, td').map((c) => cellText(c)),
  );
  const width = Math.max(...grid.map((r) => r.length));
  if (width === 0) return '';

  const pad = (r: string[]) => {
    const out = [...r];
    while (out.length < width) out.push('');
    return out;
  };

  const [first, ...rest] = grid;
  const header = pad(first ?? []);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rest.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  return lines.join('\n');
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
      const text = inline(el).replace(/\s+/g, ' ').trim();
      return text;
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
    if (options.maxChars && chars + md.length > options.maxChars && out.length > 0) break;
    out.push(md);
    chars += md.length;
  }

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
