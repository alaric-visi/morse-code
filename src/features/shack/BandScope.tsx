import { useEffect, useMemo, useState } from 'preact/hooks';
import { ACTIVITIES, BANDS, bandById, openness, populate, sUnits, type Activity, type BandStation } from '../../learn/band-sim';
import details from '../../../content/qso/details.json';
import { seeded } from '../../learn/random';
import { loadProgress, progress } from '../../learn/store';
import { Slider } from '../../ui/controls';
import { Lamp } from '../../ui/Lamp';
import { RadioPanel } from '../listen/RadioPanel';
import { loadRadio, type RadioSettings } from '../listen/radio';
import { loadSend } from '../send/settings';
import { logQso, useChorus, useMyTx } from './hooks';
import { Help } from '../../ui/Linked';

const TUNED_KHZ = 0.15;

/** A whole band to tune: who's on depends on the band, the time and the sun. */
export function BandScope() {
  useEffect(() => void loadProgress(), []);
  const [s, setS] = useState<RadioSettings>(loadRadio);
  const { get, rest } = useChorus(s);
  const tx = useMyTx(() => Math.max(16, loadSend().wpm));
  const [bandId, setBandId] = useState('40m');
  const band = bandById(bandId);
  const [hour, setHour] = useState(() => new Date().getUTCHours());
  const [sfi, setSfi] = useState(140);
  const [k, setK] = useState(2);
  const [activity, setActivity] = useState<Activity>('weekday');
  const [seed, setSeed] = useState(() => Date.now() & 0xffff);
  const stations = useMemo(() => populate(band, { hour, sfi, k }, activity, seeded(seed)), [bandId, hour, sfi, k, activity, seed]);
  const [dial, setDial] = useState(band.lo + 5);
  const [listening, setListening] = useState(false);
  const [spotted, setSpotted] = useState<Record<number, string>>({});
  const [heard, setHeard] = useState('');
  const [msg, setMsg] = useState('');
  const [worked, setWorked] = useState<Set<number>>(new Set());
  const me = progress.value?.operator.call.trim() || 'M0ABC';

  useEffect(() => setDial(band.lo + 5), [bandId]);
  useEffect(() => () => rest(), []);

  // Stations within earshot of the dial keep sending; their pitch follows the dial.
  useEffect(() => {
    if (!listening) return;
    const ch = get();
    const near = new Set<number>();
    for (const st of stations) {
      const off = Math.round((st.khz - dial) * 1000);
      if (Math.abs(off) <= 2600 && !worked.has(st.id)) {
        near.add(st.id);
        ch.loop({ id: st.id, offset: off, strength: st.strength, wpm: st.wpm, fist: st.fist }, st.lines, st.role === 'qso' ? [3, 7] : [1, 3.5]);
        ch.move(st.id, off);
      }
    }
    for (const st of stations) if (!near.has(st.id)) ch.stopLoop(st.id);
  }, [dial, listening, stations, worked]);

  // A new band or new conditions: everything that was playing stops.
  useEffect(() => {
    rest();
    setSpotted({});
    setWorked(new Set());
  }, [stations]);

  const tuned: BandStation | null = useMemo(() => {
    let best: BandStation | null = null;
    for (const st of stations) if (Math.abs(st.khz - dial) <= TUNED_KHZ && (!best || Math.abs(st.khz - dial) < Math.abs(best.khz - dial))) best = st;
    return best;
  }, [dial, stations]);

  const spot = () => {
    const c = heard.trim().toUpperCase();
    if (!c) return;
    if (tuned && tuned.call === c) {
      setSpotted((x) => ({ ...x, [tuned.id]: c }));
      setMsg(`Spotted ${c} on ${tuned.khz.toFixed(2)} kHz.`);
    } else setMsg(tuned ? `That isn't who's on ${dial.toFixed(2)} kHz. Listen again.` : 'Tune right onto a station first.');
  };

  const answer = async () => {
    const c = heard.trim().toUpperCase();
    if (!tuned || tuned.call !== c) return setMsg(tuned ? 'Get their callsign right first: it goes in your call to them.' : 'Tune right onto a station first.');
    if (tuned.role !== 'cq' && tuned.role !== 'contest' && tuned.role !== 'dx') return setMsg("They're busy in a contact. Wait for someone calling CQ.");
    const ch = get();
    ch.stopLoop(tuned.id);
    await tx.send(tuned.role === 'dx' ? me : `${c} DE ${me} K`);
    const rst = ['599', '579', '559'][Math.floor(Math.random() * 3)];
    const name = details.names[tuned.id % details.names.length];
    const reply = tuned.role === 'contest' ? `${me} 5NN ${String(1 + (tuned.id * 7) % 300).padStart(3, '0')}` : tuned.role === 'dx' ? `${me} 5NN TU` : `${me} DE ${c} GM UR RST ${rst} ${rst} = NAME ${name} = TNX CALL 73 TU`;
    await ch.say({ id: tuned.id, offset: Math.round((tuned.khz - dial) * 1000), strength: tuned.strength, wpm: tuned.wpm, fist: tuned.fist }, reply, 250);
    await tx.send('TU 73');
    setWorked((w) => new Set(w).add(tuned.id));
    setSpotted((x) => ({ ...x, [tuned.id]: c }));
    void logQso({ call: c, at: new Date().toISOString(), band: band.id, freq: tuned.khz / 1000, mode: 'CW', rstSent: '599', rstRcvd: tuned.role === 'cq' ? rst : '599', name: tuned.role === 'cq' ? name : undefined, source: 'band' });
    setMsg(`Worked ${c} (${tuned.country}). It's in your log.`);
  };

  const near = openness(band, 'near', { hour, sfi, k });
  const far = openness(band, 'dx', { hour, sfi, k });
  const span = band.hi + 3 - band.lo;

  return (
    <div class="mc-listen mc-shack-sim">
      <section
        class="mc-panel mc-listen-main"
        aria-label="The band"
        data-tuned={tuned?.call ?? ''}
        data-stations={stations.map((st) => `${st.call}@${st.khz}@${st.role}`).join(' ')}
      >
        <div class="mc-drill-controls">
          <label class="mc-field mc-inline">
            <span>Band</span>
            <select value={bandId} onChange={(e) => setBandId(e.currentTarget.value)}>
              {BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id}
                </option>
              ))}
            </select>
          </label>
          <label class="mc-field mc-inline">
            <span>Activity</span>
            <select value={activity} onChange={(e) => setActivity(e.currentTarget.value as Activity)}>
              {(Object.keys(ACTIVITIES) as Activity[]).map((a) => (
                <option key={a} value={a}>
                  {ACTIVITIES[a].label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" class="mc-btn ghost" onClick={() => setSeed((x) => x + 1)}>
            New band
          </button>
        </div>
        <Help class="mc-help">
          {ACTIVITIES[activity].about} Right now {band.id} is {pct(near)} across Europe and {pct(far)} to DX.
        </Help>
        <div class="mc-drill-controls">
          <Slider label="Time (UTC)" min={0} max={23} step={1} value={hour} display={`${String(hour).padStart(2, '0')}:00`} onInput={setHour} />
          <Slider label="Solar flux" min={65} max={250} step={5} value={sfi} display={String(sfi)} onInput={setSfi} />
          <Slider label="K-index" min={0} max={9} step={1} value={k} display={String(k)} onInput={setK} />
        </div>

        <div class="mc-dial">
          <Slider label="Dial" min={band.lo} max={band.hi + 3} step={0.01} value={dial} display={`${dial.toFixed(2)} kHz`} onInput={setDial} />
          <div class="mc-bandmap" aria-label={`${stations.length} signals on the band`}>
            {stations.map((st) => (
              <span
                key={st.id}
                class={'mc-bandmap-sig' + (worked.has(st.id) ? ' worked' : '')}
                style={{ left: `${((st.khz - band.lo) / span) * 100}%`, opacity: 0.25 + st.strength * 0.75 }}
                title={spotted[st.id] ?? ''}
              >
                {spotted[st.id] && <span class="mc-bandmap-label">{spotted[st.id]}</span>}
              </span>
            ))}
            <span class="mc-bandmap-dial" style={{ left: `${((dial - band.lo) / span) * 100}%` }} />
          </div>
          <div class="mc-stage-actions">
            {[-1, -0.1, -0.01].map((d) => (
              <button key={d} type="button" class="mc-btn" onClick={() => setDial((x) => Math.max(band.lo, +(x + d).toFixed(2)))}>
                {d * 1000} Hz
              </button>
            ))}
            {[0.01, 0.1, 1].map((d) => (
              <button key={d} type="button" class="mc-btn" onClick={() => setDial((x) => Math.min(band.hi + 3, +(x + d).toFixed(2)))}>
                +{d * 1000} Hz
              </button>
            ))}
          </div>
        </div>

        <div class="mc-head-stage">
          <Lamp lit={tx.lit} size="sm" />
          <span class="mc-smeter mc-num">{tuned ? sUnits(tuned.strength) : 'S1'}</span>
          {!listening ? (
            <button type="button" class="mc-btn primary" onClick={() => setListening(true)}>
              Switch on the receiver
            </button>
          ) : (
            <button type="button" class="mc-btn" onClick={() => (setListening(false), rest())}>
              Switch off
            </button>
          )}
        </div>
        <form
          class="mc-qrq-form"
          onSubmit={(e) => {
            e.preventDefault();
            spot();
          }}
        >
          <label class="mc-sr" for="mc-heard">
            Callsign you heard
          </label>
          <input id="mc-heard" class="mc-qrq-input mc-mono" placeholder="CALLSIGN" value={heard} autocomplete="off" onInput={(e) => setHeard(e.currentTarget.value.toUpperCase())} />
          <button type="submit" class="mc-btn">
            Spot
          </button>
          <button type="button" class="mc-btn primary" onClick={() => void answer()}>
            Call them
          </button>
        </form>
        <p class="mc-feedback" role="status" aria-live="polite">
          {msg || 'Tune slowly. When a station is right on your frequency, its note matches your sidetone.'}
        </p>
      </section>
      <div class="mc-listen-side">
        <RadioPanel s={s} onChange={setS} compact />
      </div>
    </div>
  );
}

const pct = (x: number) => (x < 0.1 ? 'closed' : x < 0.4 ? 'a little open' : x < 0.75 ? 'fairly open' : 'wide open');
