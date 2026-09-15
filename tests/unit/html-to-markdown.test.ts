import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../scripts/lib/html-to-markdown.ts';

const wrap = (inner: string) => `<div class="mw-parser-output">${inner}</div>`;

describe('htmlToMarkdown', () => {
  it('keeps prose and headings', () => {
    const md = htmlToMarkdown(wrap('<h2>Cases</h2><p>German has four cases.</p>'));
    // MediaWiki's h2 shifts down: the app owns h1.
    expect(md).toContain('### Cases');
    expect(md).toContain('German has four cases.');
  });

  it('converts a declension table, which carries the real content', () => {
    const md = htmlToMarkdown(
      wrap('<table><tr><th>Case</th><th>m</th></tr><tr><td>Nom</td><td>der</td></tr></table>'),
    );
    expect(md).toContain('| Case | m |');
    expect(md).toContain('| Nom | der |');
  });

  it('drops the chapter navigation Wikibooks puts on every page', () => {
    // Regression: this rendered as a table of contents at the top of unit 1.
    const nav =
      '<table class="top"><tr><td><a href="/a">Level I</a> <a href="/b">Level II</a></td></tr></table>';
    expect(htmlToMarkdown(wrap(`${nav}<p>Real content.</p>`))).toBe('Real content.');
  });

  it('drops a navigation paragraph that is only links', () => {
    const nav =
      '<p><a href="/1">Level I</a> · <a href="/2">Level II</a> · <a href="/3">Grammar</a> · ' +
      '<a href="/4">Appendices</a> · <a href="/5">About</a> · <a href="/6">Q&amp;A</a></p>';
    expect(htmlToMarkdown(wrap(`${nav}<p>Real content.</p>`))).toBe('Real content.');
  });

  it('drops a bare link fragment with no sentence in it', () => {
    expect(htmlToMarkdown(wrap('<p><a href="/p">Planning</a></p><p>Real content.</p>')))
      .toBe('Real content.');
  });

  it('keeps a paragraph that merely contains a link', () => {
    const md = htmlToMarkdown(
      wrap('<p>The <a href="/x">dative</a> marks the indirect object of a sentence.</p>'),
    );
    expect(md).toContain('dative');
    expect(md).toContain('indirect object');
  });

  it('keeps a table of forms even though its cells are short', () => {
    // A grammar table has few links, so the navigation rule must not fire.
    const md = htmlToMarkdown(
      wrap('<table><tr><th>ich</th><th>du</th></tr><tr><td>bin</td><td>bist</td></tr></table>'),
    );
    expect(md).toContain('bin');
    expect(md).toContain('bist');
  });

  it('strips edit links and reference markers', () => {
    const md = htmlToMarkdown(
      wrap('<p>Text<sup class="reference">[1]</sup></p><span class="mw-editsection">edit</span>'),
    );
    expect(md).toBe('Text');
  });

  it('unwraps the heading container MediaWiki now emits', () => {
    // Without unwrapping, section selection cannot see the heading at all.
    const md = htmlToMarkdown(
      wrap('<div class="mw-heading mw-heading2"><h2>Dative</h2></div><p>Body.</p>'),
    );
    expect(md).toContain('### Dative');
  });
});
