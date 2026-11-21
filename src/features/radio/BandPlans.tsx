import { useState } from 'preact/hooks';
import plans from '../../../content/reference/bandplans.json';
import { Linked } from '../../ui/Linked';

interface Band {
  band: string;
  edges: number[];
  cw: (number | string)[][];
  qrp?: number;
  qrs?: number;
  beacons?: number[];
  note?: string;
  noContests?: boolean;
}

const khz = (f: number) => f.toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** Where CW lives on each HF band, region by region. */
export function BandPlans() {
  const [id, setId] = useState('uk');
  const region = plans.regions.find((r) => r.id === id)!;
  return (
    <section class="mc-panel mc-bandplans" aria-label="Band plans" data-region={id}>
      <p>
        <Linked text={plans.about} />
      </p>
      <div class="mc-seg mc-bandplan-regions" role="group" aria-label="Region">
        {plans.regions.map((r) => (
          <button key={r.id} type="button" aria-pressed={id === r.id} onClick={() => setId(r.id)}>
            {r.id === 'uk' ? 'UK' : `Region ${r.id.slice(1)}`}
          </button>
        ))}
      </div>
      <h2 class="mc-display">{region.name}</h2>
      <p class="mc-help">
        {region.source} {region.contests}
      </p>
      <div class="mc-bandplan-key" aria-hidden="true">
        <span class="mc-bp-swatch cw" /> CW <span class="mc-bp-swatch other" /> other modes <span class="mc-bp-legend qrp">QRP centre</span> <span class="mc-bp-legend qrs">QRS centre</span> <span class="mc-bp-legend beacon">beacons</span>
      </div>
      <ol class="mc-bandplan-list">
        {(region.bands as Band[]).map((b) => (
          <BandRow key={b.band} b={b} />
        ))}
      </ol>
    </section>
  );
}

function BandRow({ b }: { b: Band }) {
  const [lo, hi] = b.edges;
  const points = [...b.cw.map((s) => s[1] as number), b.qrp ?? lo, b.qrs ?? lo, b.beacons?.[1] ?? lo];
  // Show the low end of the band in detail: CW is always at the bottom.
  const end = Math.min(hi, lo + Math.max(...points.map((p) => p - lo)) * 1.6 + 2);
  const seen = new Set<string>();
  const x = (f: number) => `${((f - lo) / (end - lo)) * 100}%`;
  return (
    <li class="mc-bandplan-band" data-band={b.band}>
      <div class="mc-bandplan-head">
        <span class="mc-glossary-term">{b.band}</span>
        <span class="mc-help mc-num">
          {khz(lo)}–{khz(hi)} kHz
        </span>
        {b.noContests && <span class="mc-label">No contests</span>}
      </div>
      {b.cw.length > 0 && (
        <div class="mc-bp-bar" role="img" aria-label={`${b.band}: CW ${b.cw.map((s) => `${khz(s[0] as number)}–${khz(s[1] as number)} kHz`).join(', ')}`}>
          {b.cw.map((s, i) => (
            <span key={i} class="mc-bp-seg" style={{ left: x(s[0] as number), width: `calc(${x(s[1] as number)} - ${x(s[0] as number)})` }} />
          ))}
          {b.beacons && <span class="mc-bp-mark beacon" style={{ left: x(b.beacons[0]) }} />}
          {b.qrp && <span class="mc-bp-mark qrp" style={{ left: x(b.qrp) }} />}
          {b.qrs && <span class="mc-bp-mark qrs" style={{ left: x(b.qrs) }} />}
          <span class="mc-bp-end mc-num">{end < hi ? `… ${khz(hi)}` : ''}</span>
        </div>
      )}
      <ul class="mc-bandplan-facts">
        {b.cw.map((s, i) => (
          <li key={i}>
            <span class="mc-num">
              {khz(s[0] as number)}–{khz(s[1] as number)} kHz
            </span>{' '}
            <Linked text={s[2] as string} seen={seen} />
          </li>
        ))}
        {b.qrp && (
          <li>
            <span class="mc-num">{khz(b.qrp)} kHz</span> <Linked text="CW QRP centre of activity" seen={seen} />
          </li>
        )}
        {b.qrs && (
          <li>
            <span class="mc-num">{khz(b.qrs)} kHz</span> QRS (slow CW) centre of activity
          </li>
        )}
        {b.beacons && (
          <li>
            <span class="mc-num">{b.beacons[0] === b.beacons[1] ? `${khz(b.beacons[0])} kHz` : `${khz(b.beacons[0])}–${khz(b.beacons[1])} kHz`}</span> International Beacon Project: keep clear
          </li>
        )}
        {b.note && (
          <li class="mc-help">
            <Linked text={b.note} seen={seen} />
          </li>
        )}
      </ul>
    </li>
  );
}
