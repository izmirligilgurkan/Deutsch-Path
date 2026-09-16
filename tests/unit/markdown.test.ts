import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '../../src/lib/markdown.ts';

/** Flattens a token tree to the text a reader would see, with no markers. */
function plain(nodes: ReturnType<typeof parseInline>): string {
  return nodes
    .map((n) =>
      n.type === 'bold' || n.type === 'italic' ? plain(n.content) : n.text,
    )
    .join('');
}

describe('parseInline', () => {
  it('nests bold inside italic without leaking asterisks', () => {
    // Regression: the flat regex matched from the wrong star, so a Wikibooks
    // example sentence rendered with literal ** on the screen.
    const nodes = parseInline('*Wo ist der Mann? **Er** ist draußen.*');
    expect(plain(nodes)).toBe('Wo ist der Mann? Er ist draußen.');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe('italic');
  });

  it('nests italic inside bold, as a table caption does', () => {
    const nodes = parseInline('**Conjugating *wissen*, present tense**');
    expect(plain(nodes)).toBe('Conjugating wissen, present tense');
    expect(nodes[0]?.type).toBe('bold');
  });

  it('reads three stars as bold and italic at once', () => {
    const nodes = parseInline('***meine*** – "my"');
    expect(plain(nodes)).toBe('meine – "my"');
    const first = nodes[0];
    expect(first?.type).toBe('bold');
    if (first?.type === 'bold') expect(first.content[0]?.type).toBe('italic');
  });

  it('leaves an unpaired star as text', () => {
    expect(plain(parseInline('2 * 3 = 6'))).toBe('2 * 3 = 6');
  });

  it('keeps code and links', () => {
    const nodes = parseInline('`der` and [Duden](https://duden.de)');
    expect(nodes.map((n) => n.type)).toEqual(['code', 'text', 'link']);
  });
});

describe('parseMarkdown', () => {
  it('keeps a table row that has empty cells', () => {
    // The conjugation tables span the singular columns, so most rows are
    // mostly empty; dropping the blanks would shift the forms left again.
    const md = ['| Person | M | F | N | Plural |', '| --- | --- | --- | --- | --- |', '| First | ich weiß |  |  | wir wissen |'].join('\n');
    const blocks = parseMarkdown(md);
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      expect(table.header).toHaveLength(5);
      expect(table.rows[0]).toHaveLength(5);
      expect(plain(table.rows[0]?.[4] ?? [])).toBe('wir wissen');
    }
  });
});
