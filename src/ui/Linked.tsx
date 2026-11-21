import type { ComponentChildren } from 'preact';
import { entryById, linkTerms, termHref } from '../reference/glossary';

/**
 * Plain text with glossary terms turned into links. Hovering (or focusing) a
 * term shows its short definition; following it opens the full entry.
 */
export function Linked({ text, seen }: { text: string; seen?: Set<string> }) {
  return (
    <>
      {linkTerms(text, seen).map((p, i) =>
        p.t === 'text' ? (
          p.s
        ) : (
          <a key={i} class="mc-term" href={termHref(p.id)} title={entryById(p.id)?.short}>
            {p.s}
          </a>
        ),
      )}
    </>
  );
}

/** Plain-text children get their glossary terms linked; elements (kbd, links…) are left alone. */
function linkChildren(children: ComponentChildren, seen: Set<string>): ComponentChildren {
  if (typeof children === 'string') return <Linked text={children} seen={seen} />;
  if (Array.isArray(children)) return children.map((c) => linkChildren(c, seen));
  return children;
}

/** A help paragraph (`.mc-help`) whose terms link to the glossary. */
export function Help({ children, class: cls, ...rest }: { children?: ComponentChildren; class?: string } & Record<string, unknown>) {
  const seen = new Set<string>();
  return (
    <p class={cls ?? 'mc-help'} {...rest}>
      {linkChildren(children, seen)}
    </p>
  );
}
