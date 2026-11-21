import { useEffect, useState } from 'preact/hooks';
import { hashQuery } from '../../app/router';
import { BandPlans } from './BandPlans';
import { Glossary } from './Glossary';
import { History } from './History';
import { Keys } from './Keys';
import { Licence } from './Licence';
import { OtherCodes } from './OtherCodes';
import { Rig } from './Rig';
import { Signals } from './Signals';
import { UkScene } from './UkScene';

type Tab = 'licence' | 'glossary' | 'bands' | 'uk' | 'keys' | 'rig' | 'codes' | 'signals' | 'history';

const TABS: { id: Tab; label: string; about: string }[] = [
  { id: 'licence', label: 'Licence', about: 'Get on the air in the UK: study notes for every item of the Foundation, Intermediate and Full syllabus, practice questions, and timed mock exams.' },
  { id: 'glossary', label: 'Glossary', about: 'Every Q-code, prosign, abbreviation and radio term used in this app. Terms in the text link here.' },
  { id: 'bands', label: 'Band plans', about: 'Where CW lives on every HF band, in the UK and all three IARU regions, with the QRP and slow-CW calling frequencies.' },
  { id: 'uk', label: 'UK scene', about: 'The UK’s CW contests, clubs and portable schemes, and where to find them on the air.' },
  { id: 'keys', label: 'Keys', about: 'Straight keys, bugs, cooties and paddles: how each one works, and a chance to try it.' },
  { id: 'rig', label: 'The rig', about: 'What’s inside a CW transceiver, from the antenna to your headphones and back.' },
  { id: 'codes', label: 'Other codes', about: 'American Morse, and Morse for Japanese, Russian, Greek, Hebrew, Arabic and Korean.' },
  { id: 'signals', label: 'Beacons and light', about: 'Morse beyond amateur radio: aviation beacon idents, signal lamps, and Morse as an input method.' },
  { id: 'history', label: 'History', about: 'From Morse’s idea in 1832 to today’s licences.' },
];

const read = () => {
  const q = new URLSearchParams(hashQuery());
  const tab = TABS.some((t) => t.id === q.get('tab')) ? (q.get('tab') as Tab) : 'licence';
  return { tab, term: q.get('term') ?? undefined };
};

/** Radio knowledge: the licence, the glossary, keys, the rig, other codes and history. */
export function Radio() {
  const [{ tab, term }, setState] = useState(read);
  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const info = TABS.find((t) => t.id === tab)!;
  return (
    <div class="mc-shack mc-ref">
      <nav class="mc-drill-nav" aria-label="Radio">
        {TABS.map((t) => (
          <a key={t.id} href={`#/radio?tab=${t.id}`} class="mc-drill-tab" aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      <header class="mc-shack-head">
        <h1 class="mc-display mc-listen-title">{info.label}</h1>
        <p class="mc-help">{info.about}</p>
      </header>
      {tab === 'licence' && <Licence />}
      {tab === 'glossary' && <Glossary term={term} />}
      {tab === 'bands' && <BandPlans />}
      {tab === 'uk' && <UkScene />}
      {tab === 'keys' && <Keys />}
      {tab === 'rig' && <Rig />}
      {tab === 'codes' && <OtherCodes />}
      {tab === 'signals' && <Signals />}
      {tab === 'history' && <History />}
    </div>
  );
}
