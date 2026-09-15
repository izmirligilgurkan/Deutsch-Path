import type { Block, Inline } from '~/lib/markdown.ts';
import { parseMarkdown } from '~/lib/markdown.ts';

/**
 * Renders parsed Markdown as elements.
 *
 * Content comes from data/ rather than from the app, so it is rendered as
 * text nodes through the token tree — never as raw HTML.
 */

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'bold':
            return <strong key={i}>{node.text}</strong>;
          case 'italic':
            return <em key={i}>{node.text}</em>;
          case 'code':
            return <code key={i} class="mono">{node.text}</code>;
          case 'link':
            return (
              <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
                {node.text}
              </a>
            );
          default:
            return <span key={i}>{node.text}</span>;
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      // The screen owns h1; sourced headings start at h2.
      const Tag = `h${Math.min(Math.max(block.level, 2), 6)}` as 'h2';
      return <Tag><Inlines nodes={block.content} /></Tag>;
    }
    case 'paragraph':
      return <p><Inlines nodes={block.content} /></p>;
    case 'list':
      return block.ordered ? (
        <ol>{block.items.map((item, i) => <li key={i}><Inlines nodes={item} /></li>)}</ol>
      ) : (
        <ul>{block.items.map((item, i) => <li key={i}><Inlines nodes={item} /></li>)}</ul>
      );
    case 'table':
      return (
        // Declension tables are wider than a phone; scroll them, not the page.
        <div class="table-scroll">
          <table>
            <thead>
              <tr>{block.header.map((cell, i) => <th key={i}><Inlines nodes={cell} /></th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}><Inlines nodes={cell} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'quote':
      return <blockquote><Inlines nodes={block.content} /></blockquote>;
    case 'code':
      return <pre class="mono">{block.text}</pre>;
  }
}

export function Markdown({ source }: { source: string }) {
  return (
    <div class="grammar-body">
      {parseMarkdown(source).map((block, i) => <BlockView key={i} block={block} />)}
    </div>
  );
}
