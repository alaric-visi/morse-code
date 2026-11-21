import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CONTESTS, FIELD_LABEL, RunEngine, contestById, makeRunners, myExchange, runnerCq, runnerReply, type Caller, type ContestDef, type Field, type LogResult, type Runner } from '../../learn/contest';
import { bandById, BANDS } from '../../learn/band-sim';
import { loadProgress, progress } from '../../learn/store';
import { Slider, Switch } from '../../ui/controls';
import { Lamp } from '../../ui/Lamp';
import { RadioPanel } from '../listen/RadioPanel';
import { loadRadio, type RadioSettings } from '../listen/radio';
import { loadSend } from '../send/settings';
import { logQso, useChorus, useMyTx } from './hooks';
import { Help } from '../../ui/Linked';

const DURATIONS = [0, 5, 10, 30, 60];
const EXAMPLE_CALL = 'M0ABC';

interface Row {
  call: string;
  exch: string;
  ok: boolean;
  dupe: boolean;
  note: string;
}

/**
 * Contest, pileup and activation operating. Run: call CQ, pick callers out of
 * the noise, exchange and log. Search and pounce: tune the band and call the
 * stations already running. Enter steps you through each contact, the way
 * contest loggers do.
 */
export function ContestSim({ kinds, initial }: { kinds: ContestDef['kind'][]; initial: string }) {
  useEffect(() => void loadProgress(), []);
  const defs = CONTESTS.filter((c) => kinds.includes(c.kind));
  const [defId, setDefId] = useState(initial);
  const def = contestById(defId);
  const [mode, setMode] = useState<'run' | 'sp'>('run');
  const [split, setSplit] = useState(false);
  const [minutes, setMinutes] = useState(def.kind === 'pileup' ? 0 : 10);
  const [bandId, setBandId] = useState('40m');
  const [ref, setRef] = useState(def.id === 'sota' ? 'G/LD-012' : 'GB-0412');
  const [s, setS] = useState<RadioSettings>(loadRadio);
  const [running, setRunning] = useState(false);
  const opCall = progress.value?.operator.call.trim() || EXAMPLE_CALL;
  const opName = progress.value?.operator.name.trim() || 'ALEX';

  return (
    <div class="mc-listen mc-shack-sim">
      <section class="mc-panel mc-listen-main" aria-label={def.name}>
        {!running ? (
          <div class="mc-qso-setup">
            <div class="mc-style-cards" role="radiogroup" aria-label="Event">
              {defs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={d.id === defId}
                  class="mc-style-card"
                  onClick={() => {
                    setDefId(d.id);
                    setRef(d.id === 'sota' ? 'G/LD-012' : 'GB-0412');
                  }}
                >
                  <strong>{d.name}</strong>
                  <span class="mc-help">{d.summary}</span>
                </button>
              ))}
            </div>
            <Help class="mc-help">
              Exchange: <strong>{def.exchange.map((f) => FIELD_LABEL[f]).join(' + ')}</strong>. You are <strong>{opCall}</strong> (set your callsign on the QSO page).
            </Help>
            <div class="mc-drill-controls">
              {def.kind !== 'pileup' && (
                <div class="mc-seg" role="group" aria-label="How you operate">
                  <button type="button" aria-pressed={mode === 'run'} onClick={() => setMode('run')}>
                    {def.kind === 'activation' ? 'Activate (run)' : 'Run'}
                  </button>
                  <button type="button" aria-pressed={mode === 'sp'} onClick={() => setMode('sp')}>
                    {def.kind === 'activation' ? 'Hunt (search and pounce)' : 'Search and pounce'}
                  </button>
                </div>
              )}
              {def.kind === 'pileup' && <Switch label="Work split (listen up 1–3 kHz)" checked={split} onChange={setSplit} />}
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
                <span>Length</span>
                <select value={minutes} onChange={(e) => setMinutes(+e.currentTarget.value)}>
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m ? `${m} minutes` : 'No time limit'}
                    </option>
                  ))}
                </select>
              </label>
              {def.kind === 'activation' && mode === 'run' && (
                <label class="mc-field mc-inline">
                  <span>{def.id === 'sota' ? 'Summit' : 'Park'}</span>
                  <input class="mc-text" value={ref} maxLength={12} onInput={(e) => setRef(e.currentTarget.value.toUpperCase())} />
                </label>
              )}
            </div>
            <div class="mc-stage-actions">
              <button type="button" class="mc-btn primary" onClick={() => setRunning(true)}>
                {def.kind === 'pileup' ? 'Start the pileup' : def.kind === 'activation' ? 'Go on the air' : 'Start the contest'}
              </button>
            </div>
          </div>
        ) : (
          <Session
            key={`${defId}-${mode}-${split}`}
            def={def}
            mode={def.kind === 'pileup' ? 'run' : mode}
            split={split}
            minutes={minutes}
            band={bandId}
            me={{ call: opCall, name: opName, ref }}
            s={s}
            onEnd={() => setRunning(false)}
          />
        )}
      </section>
      <div class="mc-listen-side">
        <RadioPanel s={s} onChange={setS} compact />
      </div>
    </div>
  );
}

function Session({
  def,
  mode,
  split,
  minutes,
  band,
  me,
  s,
  onEnd,
}: {
  def: ContestDef;
  mode: 'run' | 'sp';
  split: boolean;
  minutes: number;
  band: string;
  me: { call: string; name: string; ref: string };
  s: RadioSettings;
  onEnd(): void;
}) {
  // Contest macros go out briskly, as they would from a logger.
  const sendWpm = useMemo(() => Math.max(24, loadSend().wpm), []);
  const { get, rest, rng } = useChorus(s);
  const tx = useMyTx(() => sendWpm);
  const startedAt = useMemo(() => performance.now() / 1000, []);
  const [now, setNow] = useState(0);
  const engine = useMemo(() => new RunEngine(def, me, rng, { split, minute: () => (performance.now() / 1000 - startedAt) / 60 }), []);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [current, setCurrent] = useState<Caller | null>(null);
  const [call, setCall] = useState('');
  const [fields, setFields] = useState<Partial<Record<Field, string>>>(() => blankFields(def));
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState(mode === 'run' ? 'Press F1 (or Enter) to call CQ.' : 'Tune across the band and listen for stations calling CQ.');
  const [rx, setRx] = useState(split ? 2000 : 0);
  const [ended, setEnded] = useState(false);
  const callInput = useRef<HTMLInputElement>(null);
  const exchInput = useRef<HTMLInputElement>(null);
  const exchFields = def.exchange.filter((f) => f !== 'rst');

  // Search and pounce: stations running across the band.
  const segment = bandById(band);
  const runners = useMemo(() => (mode === 'sp' ? makeRunners(def, rng, 10, Math.min(40, segment.hi - segment.lo)) : []), []);
  const [dial, setDial] = useState(1);

  // The clock.
  useEffect(() => {
    const t = window.setInterval(() => setNow(performance.now() / 1000 - startedAt), 500);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (minutes && now >= minutes * 60 && !ended) finish();
  }, [now]);
  useEffect(() => () => rest(), []);

  // Split: move your receiver.
  useEffect(() => {
    if (split) get().retune(rx);
  }, [rx]);

  // S&P: stations near the dial are heard calling CQ; moving the dial moves their pitch.
  useEffect(() => {
    if (mode !== 'sp' || ended) return;
    const ch = get();
    for (const r of runners) {
      const off = Math.round((r.khz - dial) * 1000);
      if (Math.abs(off) < 2600 && !r.worked) {
        ch.loop({ id: 1000 + r.id, offset: off, strength: r.strength, wpm: r.wpm, fist: r.fist }, [runnerCq(def, r)], [1.2, 3]);
        ch.move(1000 + r.id, off);
      } else ch.stopLoop(1000 + r.id);
    }
  }, [dial, ended]);

  const voice = (c: Caller) => ({ id: c.id, offset: c.offset, strength: c.strength, wpm: c.wpm, fist: c.fist });
  const tuned = (): Runner | null => {
    let best: Runner | null = null;
    for (const r of runners) if (!r.worked && Math.abs(r.khz - dial) <= 0.15 && (!best || Math.abs(r.khz - dial) < Math.abs(best.khz - dial))) best = r;
    return best;
  };

  async function cq() {
    if (tx.sending.peek()) return;
    setCurrent(null);
    const text = def.kind === 'pileup' ? `${me.call} ${split ? 'UP 2' : 'K'}` : def.kind === 'activation' ? `CQ ${def.id.toUpperCase()} DE ${me.call} ${me.call} K` : `CQ TEST ${me.call} ${me.call}`;
    setStatus('Calling CQ…');
    await tx.send(text);
    const cs = engine.cq();
    setCallers(cs);
    callersCall(cs);
    setStatus(cs.length ? `${cs.length > 1 ? 'Stations are' : 'A station is'} calling. Type a call (or part of one, e.g. K1?) and press Enter.` : 'No takers. Call CQ again.');
    callInput.current?.focus();
  }

  function callersCall(cs: Caller[]) {
    const ch = get();
    cs.forEach((c) => void ch.say(voice(c), rng() < 0.5 ? `${c.call} ${c.call}` : c.call, rng() * 500));
  }

  async function answer() {
    const q = call.trim().toUpperCase();
    if (mode === 'sp') return spCall();
    if (!q) return cq();
    const { exact, calling } = engine.answer(q);
    if (exact) {
      setCurrent(exact);
      await tx.send(engine.myOver());
      await get().say(voice(exact), engine.theirReply(exact), 200);
      setStatus('Copy their exchange, then Enter to log.');
      exchInput.current?.focus();
    } else {
      await tx.send(q.includes('?') ? q : `${q}?`);
      callersCall(calling);
      setStatus(calling.length ? `${calling.length} ${calling.length > 1 ? 'stations' : 'station'} came back.` : 'Nobody matches that. Try again, or ? for everyone.');
    }
  }

  async function agn() {
    if (current) {
      await tx.send('AGN?');
      await get().say(voice(current), engine.theirReply(current));
    } else {
      await tx.send('?');
      callersCall(engine.waiting);
    }
  }

  async function spCall() {
    const r = tuned();
    await tx.send(me.call);
    if (!r) {
      setStatus('Nobody came back. Tune right onto a station first (within 150 Hz).');
      return;
    }
    get().stopLoop(1000 + r.id);
    await get().say({ id: 1000 + r.id, offset: Math.round((r.khz - dial) * 1000), strength: r.strength, wpm: r.wpm, fist: r.fist }, runnerReply(def, r, me.call), 300);
    setCurrent(r);
    setStatus("Copy their call and exchange, then Enter to log.");
    callInput.current?.focus();
  }

  async function logIt() {
    const target = current;
    if (mode === 'sp' && target && !engine.waiting.includes(target)) engine.waiting.push(target);
    const res: LogResult = engine.logContact({ call, fields }, performance.now() / 1000 - startedAt);
    const truth = res.truth;
    const ok = res.callOk && Object.values(res.fieldsOk).every(Boolean) && !res.dupe;
    const exchText = def.exchange.map((f) => fields[f] ?? '').join(' ');
    let note = res.dupe ? 'Dupe' : !res.callOk ? `Busted: ${truth ? truth.call : '?'}` : ok ? (res.newMult ? `New mult ${res.newMult}` : '') : `Check ${def.exchange.filter((f) => !res.fieldsOk[f]).map((f) => FIELD_LABEL[f]).join(', ')}`;
    if (!ok && truth && res.callOk) note += ` (sent ${def.exchange.map((f) => truth.exch[f]).join(' ')})`;
    setRows((rs) => [{ call: call.toUpperCase(), exch: exchText, ok, dupe: res.dupe, note }, ...rs].slice(0, 200));
    if (res.callOk && !res.dupe) {
      const b = bandById(band);
      void logQso({
        call: call.toUpperCase(),
        at: new Date().toISOString(),
        band: b.id,
        freq: (b.lo + (mode === 'sp' && target && 'khz' in target ? (target as Runner).khz : 5)) / 1000,
        mode: 'CW',
        rstSent: '599',
        rstRcvd: fields.rst ?? '599',
        exchSent: myExchange(def, me, engine.serial - (ok ? 1 : 0)),
        exchRcvd: exchText,
        state: fields.state,
        source: def.kind,
        contest: def.id,
      });
    }
    if (mode === 'sp' && target && 'khz' in target) (target as Runner).worked = true;
    setCall('');
    setFields(blankFields(def));
    setCurrent(null);
    callInput.current?.focus();
    if (mode === 'run') {
      await tx.send(def.kind === 'contest' ? `TU ${me.call}` : 'TU 73');
      // Others who were calling may try again straight away.
      const cs = engine.cq();
      setCallers(cs);
      if (cs.length) callersCall(cs);
      setStatus(cs.length ? 'More callers. Pick the next one.' : 'Quiet. Call CQ (F1).');
    } else {
      await tx.send(`TU ${myExchange(def, me, engine.serial)}`);
      setStatus('Logged. Tune on for the next one.');
    }
  }

  function finish() {
    setEnded(true);
    get().stopAll();
    tx.stop();
    setStatus('Finished.');
  }

  // Function keys, as in a contest logger. F5 would reload the page, so it's taken over here.
  const keys = useRef({ cq, agn, answer, logIt, finish });
  keys.current = { cq, agn, answer, logIt, finish };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ended) return;
      const k = keys.current;
      if (e.key === 'F1') (e.preventDefault(), void k.cq());
      else if (e.key === 'F2' || e.key === 'F4') (e.preventDefault(), void k.answer());
      else if (e.key === 'F3') (e.preventDefault(), void k.logIt());
      else if (e.key === 'F5' || e.key === 'F6') (e.preventDefault(), void k.agn());
      else if (e.key === 'Escape') tx.stop();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ended]);

  const score = engine.score();
  const left = minutes ? Math.max(0, minutes * 60 - now) : null;
  const goal = def.goal;
  const reply = current ? def.exchange.map((f) => current.exch[f]).join(' ') : '';

  return (
    <div
      class="mc-contest"
      data-callers={callers.map((c) => `${c.call}@${c.offset}`).join(' ')}
      data-runners={runners.map((r) => `${r.call}@${r.khz}`).join(' ')}
      data-current={current?.call ?? ''}
      data-reply={reply}
    >
      <div class="mc-contest-head">
        <Lamp lit={tx.lit} size="sm" />
        <h2 class="mc-display mc-contest-title">{def.name}</h2>
        <span class="mc-num mc-contest-clock">
          {left !== null ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left` : `${Math.floor(now / 60)} min`}
        </span>
      </div>

      <dl class="mc-done-stats mc-contest-score">
        <div>
          <dt>QSOs</dt>
          <dd class="mc-num" data-testid="qsos">
            {score.qsos}
            {goal ? ` / ${goal}` : ''}
          </dd>
        </div>
        {def.mult !== 'none' && (
          <div>
            <dt>Mults</dt>
            <dd class="mc-num">{score.mults}</dd>
          </div>
        )}
        <div>
          <dt>Score</dt>
          <dd class="mc-num">{score.total}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd class="mc-num">{engine.rate(now, 0)}/h</dd>
        </div>
        {score.busted > 0 && (
          <div>
            <dt>Busted/dupes</dt>
            <dd class="mc-num">{score.busted}</dd>
          </div>
        )}
      </dl>
      {goal && score.qsos >= goal && <p class="mc-feedback">That's {goal} contacts: a valid activation. Well done!</p>}

      {!ended && mode === 'sp' && (
        <div class="mc-dial">
          <Slider
            label="Dial"
            min={0}
            max={Math.min(40, segment.hi - segment.lo)}
            step={0.05}
            value={dial}
            display={`${(segment.lo + dial).toFixed(2)} kHz`}
            onInput={setDial}
          />
          <div class="mc-bandmap" aria-hidden="true">
            {runners.map((r) => (
              <span key={r.id} class={'mc-bandmap-sig' + (r.worked ? ' worked' : '')} style={{ left: `${(r.khz / Math.min(40, segment.hi - segment.lo)) * 100}%`, opacity: 0.35 + r.strength * 0.65 }} />
            ))}
            <span class="mc-bandmap-dial" style={{ left: `${(dial / Math.min(40, segment.hi - segment.lo)) * 100}%` }} />
          </div>
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn" onClick={() => setDial((d) => Math.max(0, +(d - 0.05).toFixed(2)))}>
              ◀ 50 Hz
            </button>
            <button type="button" class="mc-btn" onClick={() => setDial((d) => +(d + 0.05).toFixed(2))}>
              50 Hz ▶
            </button>
          </div>
        </div>
      )}
      {!ended && split && (
        <Slider label="Listening" min={0} max={3500} step={50} value={rx} display={`UP ${(rx / 1000).toFixed(2)} kHz`} onInput={setRx} />
      )}

      {!ended && (
        <form
          class="mc-entry"
          onSubmit={(e) => {
            e.preventDefault();
            // Enter does the next logical thing: answer a caller, then log.
            if (mode === 'sp') void (current ? logIt() : spCall());
            else if (current && (document.activeElement !== callInput.current || exchFields.length === 0)) void logIt();
            else void answer();
          }}
        >
          <label class="mc-field">
            <span>Call</span>
            <input ref={callInput} class="mc-text" value={call} autocomplete="off" spellcheck={false} onInput={(e) => setCall(e.currentTarget.value.toUpperCase())} />
          </label>
          {def.exchange.includes('rst') && (
            <label class="mc-field mc-entry-rst">
              <span>RST</span>
              <input class="mc-text" value={fields.rst ?? ''} onInput={(e) => setFields((f) => ({ ...f, rst: e.currentTarget.value.toUpperCase() }))} />
            </label>
          )}
          {exchFields.map((f, i) => (
            <label key={f} class="mc-field">
              <span>{FIELD_LABEL[f]}</span>
              <input
                ref={i === 0 ? exchInput : undefined}
                class="mc-text"
                value={fields[f] ?? ''}
                autocomplete="off"
                spellcheck={false}
                onInput={(e) => setFields((x) => ({ ...x, [f]: e.currentTarget.value.toUpperCase() }))}
              />
            </label>
          ))}
          <button type="submit" class="mc-sr">
            Enter
          </button>
        </form>
      )}
      <p class="mc-feedback" role="status" aria-live="polite">
        {status}
      </p>
      {!ended && (
        <div class="mc-fkeys" role="group" aria-label="Function keys">
          {mode === 'run' ? (
            <>
              <button type="button" class="mc-btn" onClick={() => void cq()}>
                F1 CQ
              </button>
              <button type="button" class="mc-btn" onClick={() => void answer()}>
                F2 Exch
              </button>
              <button type="button" class="mc-btn" disabled={!current} onClick={() => void logIt()}>
                F3 Log + TU
              </button>
              <button type="button" class="mc-btn" onClick={() => void agn()}>
                F6 AGN?
              </button>
            </>
          ) : (
            <>
              <button type="button" class="mc-btn" onClick={() => void spCall()}>
                F4 My call
              </button>
              <button type="button" class="mc-btn" disabled={!current} onClick={() => void logIt()}>
                F3 Log + TU
              </button>
            </>
          )}
          <button type="button" class="mc-btn ghost" onClick={finish}>
            End
          </button>
        </div>
      )}
      {ended && (
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={onEnd}>
            Back
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <table class="mc-fist-table mc-contest-log" aria-label="Contacts this session">
          <thead>
            <tr>
              <th scope="col">Call</th>
              <th scope="col">Exchange</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-ok={r.ok ? 'true' : 'false'}>
                <td class="mc-mono">{r.call}</td>
                <td class="mc-mono">{r.exch}</td>
                <td>
                  <span aria-hidden="true">{r.ok ? '✓ ' : '✗ '}</span>
                  {r.note || 'Good'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function blankFields(def: ContestDef): Partial<Record<Field, string>> {
  return def.exchange.includes('rst') ? { rst: '599' } : {};
}
