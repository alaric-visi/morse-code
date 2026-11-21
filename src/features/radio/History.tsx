import type { JSX } from 'preact';
import history from '../../../content/reference/history.json';
import { Linked } from '../../ui/Linked';

/** Small line drawings for the timeline, in the brass-and-ink style of the instruments. */
const ICONS: Record<string, JSX.Element> = {
  ship: (
    <>
      <path d="M6 26h28l-4 6H10z" />
      <path d="M20 8v18M20 10l9 12H20M20 12l-8 10h8" />
    </>
  ),
  needle: (
    <>
      <rect x="8" y="6" width="24" height="28" rx="3" />
      <path d="M14 14l12 12M26 14L14 26" />
      <circle cx="20" cy="20" r="2" />
    </>
  ),
  key: (
    <>
      <path d="M4 32h32" />
      <path d="M8 28h4v4M10 26l22-4" />
      <ellipse cx="32" cy="20" rx="5" ry="2.5" />
    </>
  ),
  line: (
    <>
      <path d="M10 34V8M30 34V8M6 12h8M26 12h8" />
      <path d="M10 12q10 6 20 0M10 16q10 6 20 0" />
    </>
  ),
  cable: (
    <>
      <path d="M2 14q9 4 18 0t18 0" />
      <path d="M4 26q8 6 16 2t16 2" />
      <circle cx="20" cy="28" r="3" />
    </>
  ),
  globe: (
    <>
      <circle cx="20" cy="20" r="13" />
      <path d="M7 20h26M20 7q-8 13 0 26M20 7q8 13 0 26" />
    </>
  ),
  mast: (
    <>
      <path d="M20 34L14 6h12zM14 6L20 34L26 6" />
      <path d="M29 9q4 4 0 8M32 6q7 7 0 14M11 9q-4 4 0 8M8 6q-7 7 0 14" />
    </>
  ),
  sos: (
    <>
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="14" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
      <path d="M7 20h7M17 20h7M27 20h7" />
      <circle cx="21" cy="28" r="1.6" />
      <circle cx="26" cy="28" r="1.6" />
      <circle cx="31" cy="28" r="1.6" />
    </>
  ),
  book: (
    <>
      <path d="M20 10q-7-4-14-2v22q7-2 14 2q7-4 14-2V8q-7-2-14 2zM20 10v22" />
    </>
  ),
  club: (
    <>
      <circle cx="13" cy="13" r="4" />
      <circle cx="27" cy="13" r="4" />
      <path d="M5 30q8-14 16 0M19 30q8-14 16 0" />
    </>
  ),
  war: (
    <>
      <rect x="6" y="14" width="28" height="18" rx="2" />
      <circle cx="14" cy="23" r="4" />
      <path d="M24 20h6M24 25h6M10 14V8M10 8h6" />
    </>
  ),
  satellite: (
    <>
      <rect x="16" y="16" width="8" height="8" />
      <path d="M16 20H4M24 20h12M4 15v10M36 15v10M20 24v6M14 34q6-6 12 0" />
    </>
  ),
  licence: (
    <>
      <rect x="7" y="6" width="26" height="28" rx="2" />
      <path d="M12 13h16M12 18h16M12 23h9" />
      <circle cx="26" cy="27" r="3" />
    </>
  ),
  at: (
    <>
      <circle cx="20" cy="20" r="5" />
      <path d="M25 16v7q0 4 4 3t3-7q-1-12-12-12T8 20t12 12q4 0 7-2" />
    </>
  ),
};

/** A timeline of the code and the hobby. */
export function History() {
  const seen = new Set<string>();
  return (
    <section class="mc-panel" aria-label="History">
      <p class="mc-help">{history.about}</p>
      <ol class="mc-timeline">
        {history.events.map((e) => (
          <li key={e.year + e.title} data-icon={e.icon}>
            <span class="mc-timeline-year mc-num">{e.year}</span>
            <svg class="mc-timeline-icon" viewBox="0 0 40 40" aria-hidden="true">
              {ICONS[e.icon]}
            </svg>
            <div>
              <h3 class="mc-display">{e.title}</h3>
              <p>
                <Linked text={e.text} seen={seen} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
