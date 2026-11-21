import { useEffect, useMemo, useState } from 'preact/hooks';
import { CATEGORIES, ENTRIES, entryById, entryByTerm, termHref } from '../../reference/glossary';
import { Linked } from '../../ui/Linked';
import { Code } from '../../ui/Code';

/** Every term the app uses, searchable, with links between entries. */
export function Glossary({ term }: { term?: string }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const focus = term ? entryById(term) : undefined;

  useEffect(() => {
    if (!focus) return;
    setQ('');
    setCat('');
    requestAnimationFrame(() => document.getElementById(`gl-${focus.id}`)?.scrollIntoView({ block: 'center' }));
  }, [focus?.id]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ENTRIES.filter(
      (e) =>
        (!cat || e.cat === cat) &&
        (!s || e.term.toLowerCase().includes(s) || e.aka?.some((a) => a.toLowerCase().includes(s)) || e.short.toLowerCase().includes(s)),
    );
  }, [q, cat]);

  return (
    <section class="mc-panel mc-glossary" aria-label="Glossary">
      <div class="mc-drill-controls">
        <label class="mc-field mc-inline mc-glossary-search">
          <span>Search</span>
          <input type="search" value={q} placeholder="QSB, zero beat, ERP…" onInput={(e) => setQ(e.currentTarget.value)} />
        </label>
        <label class="mc-field mc-inline">
          <span>Kind</span>
          <select value={cat} onChange={(e) => setCat(e.currentTarget.value)}>
            <option value="">Everything</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span class="mc-help mc-num" role="status">
          {shown.length} of {ENTRIES.length}
        </span>
      </div>
      <dl class="mc-glossary-list">
        {shown.map((e) => {
          const seen = new Set([e.id]);
          return (
            <div key={e.id} id={`gl-${e.id}`} class="mc-glossary-entry" data-focus={focus?.id === e.id ? '' : undefined}>
              <dt>
                <span class="mc-glossary-term">{e.term}</span>
                <span class="mc-label">{e.cat}</span>
                {e.code && <Code morse={e.code} />}
              </dt>
              <dd>
                <Linked text={e.short} seen={seen} />
                {e.more && (
                  <>
                    {' '}
                    <Linked text={e.more} seen={seen} />
                  </>
                )}
                {e.aka && e.aka.length > 0 && <span class="mc-help"> Also: {e.aka.join(', ')}.</span>}
                {e.see && (
                  <span class="mc-help">
                    {' '}
                    See{' '}
                    {e.see.map((s, i) => {
                      const t = entryByTerm(s);
                      return (
                        <span key={s}>
                          {i > 0 && ', '}
                          {t ? <a href={termHref(t.id)}>{s}</a> : s}
                        </span>
                      );
                    })}
                    .
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
