import type { Block, Inline } from '../../learn/markdown';
import { Linked } from '../../ui/Linked';

const Inl = ({ parts, seen }: { parts: Inline[]; seen?: Set<string> }) => (
  <>
    {parts.map((p, i) =>
      p.t === 'b' ? <strong key={i}>{p.s}</strong> : p.t === 'i' ? <em key={i}>{p.s}</em> : seen ? <Linked key={i} text={p.s} seen={seen} /> : p.s,
    )}
  </>
);

/** Renders a parsed teaching card. Text only — no HTML from the source ever reaches the page. */
export function CardBody({ blocks }: { blocks: Block[] }) {
  // Glossary terms link once per card; headings stay plain.
  const seen = new Set<string>();
  return (
    <div class="mc-prose">
      {blocks.map((b, i) =>
        b.t === 'h1' ? (
          <h1 key={i} class="mc-display">
            <Inl parts={b.content} />
          </h1>
        ) : b.t === 'h2' ? (
          <h2 key={i} class="mc-display">
            <Inl parts={b.content} />
          </h2>
        ) : b.t === 'ul' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inl parts={it} seen={seen} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inl parts={b.content} seen={seen} />
          </p>
        ),
      )}
    </div>
  );
}
