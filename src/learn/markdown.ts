/**
 * A deliberately tiny Markdown subset for the teaching cards: `# title`,
 * `## heading`, paragraphs, `- ` lists, **bold** and *italic*. It produces a
 * plain data tree (never HTML strings), so nothing in a card can inject markup.
 */
export type Inline = { t: 'text' | 'b' | 'i'; s: string };
export type Block =
  | { t: 'h1' | 'h2'; content: Inline[] }
  | { t: 'p'; content: Inline[] }
  | { t: 'ul'; items: Inline[][] };

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ t: 'text', s: s.slice(last, m.index) });
    out.push(m[1] !== undefined ? { t: 'b', s: m[1] } : { t: 'i', s: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', s: s.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', content: inline(para.join(' ')) });
    if (list) blocks.push({ t: 'ul', items: list.map(inline) });
    para = [];
    list = null;
  };
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ t: 'h2', content: inline(line.slice(3)) });
    } else if (line.startsWith('# ')) {
      flush();
      blocks.push({ t: 'h1', content: inline(line.slice(2)) });
    } else if (line.startsWith('- ')) {
      if (para.length) flush();
      (list ??= []).push(line.slice(2));
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** The card's title: its first `# ` heading, as plain text. */
export const titleOf = (blocks: Block[]) => {
  const h = blocks.find((b) => b.t === 'h1');
  return h && 'content' in h ? h.content.map((x) => x.s).join('') : '';
};
