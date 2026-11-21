import { useState } from 'preact/hooks';
import { hashQuery } from '../../app/router';
import { BandScope } from './BandScope';
import { CallsignTrainer } from './CallsignTrainer';
import { ContestSim } from './ContestSim';
import { Etiquette } from './Etiquette';
import { Logbook } from './Logbook';
import { NetSim } from './NetSim';
import { OffAir } from './OffAir';
import { RadioPanel } from '../listen/RadioPanel';
import { loadRadio, useRadio, type RadioSettings } from '../listen/radio';
import { Help } from '../../ui/Linked';

type Tab = 'band' | 'callsigns' | 'pileup' | 'contest' | 'activations' | 'net' | 'etiquette' | 'log' | 'decoder';

const TABS: { id: Tab; label: string; about: string }[] = [
  { id: 'band', label: 'Band', about: 'Tune a band and see who’s on. What you hear depends on the band, the time and the sun.' },
  { id: 'callsigns', label: 'Callsigns', about: 'Callsigns are the hardest thing to copy: no words to guess. One at a time, in every format.' },
  { id: 'pileup', label: 'Pileup', about: 'Be the rare station: pick callsigns out of a crowd, and work split.' },
  { id: 'contest', label: 'Contest', about: 'Run or search and pounce in seven contest styles, with function keys, dupes, multipliers and a rate meter.' },
  { id: 'activations', label: 'Activations', about: 'Parks and summits: activate (with hunters piling in), or hunt the activators.' },
  { id: 'net', label: 'Net', about: 'Check in to a CW traffic net and pass, or receive, a radiogram.' },
  { id: 'etiquette', label: 'Etiquette', about: 'How to behave on the air, from QRL? to pileups.' },
  { id: 'log', label: 'Logbook', about: 'Everything you’ve worked, with ADIF export and import, and award tallies.' },
  { id: 'decoder', label: 'Decoder', about: 'Decode a real receiver through your microphone.' },
];

/** The shack: operating practice on simulated bands. */
export function Shack() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(hashQuery()).get('tab');
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'band';
  });
  const info = TABS.find((t) => t.id === tab)!;
  return (
    <div class="mc-shack">
      <nav class="mc-drill-nav" aria-label="Shack">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <header class="mc-shack-head">
        <h1 class="mc-display mc-listen-title">{info.label}</h1>
        <Help class="mc-help">{info.about}</Help>
      </header>
      {tab === 'band' && <BandScope />}
      {tab === 'callsigns' && <WithRadio render={(radio) => <CallsignTrainer radio={radio} />} />}
      {tab === 'pileup' && <ContestSim kinds={['pileup']} initial="dxpileup" />}
      {tab === 'contest' && <ContestSim kinds={['contest']} initial="ukclub" />}
      {tab === 'activations' && <ContestSim kinds={['activation']} initial="pota" />}
      {tab === 'net' && <NetSim />}
      {tab === 'etiquette' && (
        <section class="mc-panel">
          <Etiquette />
        </section>
      )}
      {tab === 'log' && <Logbook />}
      {tab === 'decoder' && (
        <section class="mc-panel">
          <OffAir />
        </section>
      )}
    </div>
  );
}

function WithRadio({ render }: { render(radio: ReturnType<typeof useRadio>): preact.JSX.Element }) {
  const [s, setS] = useState<RadioSettings>(loadRadio);
  const radio = useRadio(s);
  return (
    <div class="mc-listen mc-shack-sim">
      <section class="mc-panel mc-listen-main">{render(radio)}</section>
      <div class="mc-listen-side">
        <RadioPanel s={s} onChange={setS} compact />
      </div>
    </div>
  );
}
