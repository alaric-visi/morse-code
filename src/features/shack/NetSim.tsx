import { useEffect, useMemo, useState } from 'preact/hooks';
import { makeNet, type Net } from '../../learn/net';
import { FORM_FIELDS, PRECEDENCE, checkForm, toForm, type RadiogramForm } from '../../learn/radiogram';
import { seeded } from '../../learn/random';
import { loadProgress, progress } from '../../learn/store';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import { CopyTask } from '../listen/CopyTask';
import { RadioPanel } from '../listen/RadioPanel';
import { loadRadio, useRadio, type RadioSettings } from '../listen/radio';
import { YourTurnAuto, YourTurnKeyed } from '../qso/Qso';
import { logQso } from './hooks';
import { Help } from '../../ui/Linked';

/** A directed CW net: check in, list or receive traffic, and pass a radiogram. */
export function NetSim() {
  useEffect(() => void loadProgress(), []);
  const [s, setS] = useState<RadioSettings>(loadRadio);
  const radio = useRadio(s);
  const [youSend, setYouSend] = useState(true);
  const [keyed, setKeyed] = useState(false);
  const [net, setNet] = useState<Net | null>(null);
  const op = progress.value?.operator;
  const me = { call: op?.call.trim() || 'M0ABC', name: op?.name.trim() || 'ALEX', qth: op?.qth.trim() || 'LEEDS' };

  return (
    <div class="mc-listen mc-shack-sim">
      <section class="mc-panel mc-listen-main" aria-label="CW net">
        {!net ? (
          <div class="mc-qso-setup">
            <Help class="mc-help">
              A net is a scheduled on-air meeting run by net control (NCS). Stations check in (QNI), list any traffic (QTC), and NCS
              pairs them up to pass formal messages: radiograms, with a preamble, address, text and signature.
            </Help>
            <div class="mc-seg" role="group" aria-label="Traffic">
              <button type="button" aria-pressed={youSend} onClick={() => setYouSend(true)}>
                I have a radiogram to pass
              </button>
              <button type="button" aria-pressed={!youSend} onClick={() => setYouSend(false)}>
                Someone has one for me
              </button>
            </div>
            <div class="mc-seg" role="group" aria-label="Your side">
              <button type="button" aria-pressed={!keyed} onClick={() => setKeyed(false)}>
                Send my side for me
              </button>
              <button type="button" aria-pressed={keyed} onClick={() => setKeyed(true)}>
                I'll key my side
              </button>
            </div>
            <div class="mc-stage-actions">
              <button type="button" class="mc-btn primary" onClick={() => setNet(makeNet(me, seeded(Date.now() & 0xffffffff), youSend))}>
                <IconPlay />
                Join the net
              </button>
            </div>
          </div>
        ) : (
          <NetRun key={net.ncs} net={net} keyed={keyed} radio={radio} onEnd={() => (radio.rest(), setNet(null))} />
        )}
      </section>
      <div class="mc-listen-side">
        <RadioPanel s={s} onChange={setS} compact />
      </div>
    </div>
  );
}

function NetRun({ net, keyed, radio, onEnd }: { net: Net; keyed: boolean; radio: ReturnType<typeof useRadio>; onEnd(): void }) {
  const [i, setI] = useState(0);
  const [formOk, setFormOk] = useState<number | null>(null);
  const step = net.steps[i];
  const next = () => setI((x) => x + 1);
  const done = i >= net.steps.length;

  useEffect(() => {
    if (!done) return;
    void logQso({
      call: net.relay,
      at: new Date().toISOString(),
      band: '80m',
      mode: 'CW',
      rstSent: '599',
      rstRcvd: '599',
      exchSent: net.youSend ? `NR ${net.radiogram.number}` : undefined,
      exchRcvd: net.youSend ? undefined : `NR ${net.radiogram.number}`,
      source: 'net',
    });
  }, [done]);

  if (done) {
    return (
      <div class="mc-stage mc-done" role="status">
        <p class="mc-label">Net closed</p>
        <h2 class="mc-display mc-done-title">
          Radiogram NR {net.radiogram.number} {net.youSend ? 'passed and receipted' : 'received'}
        </h2>
        {formOk !== null && <Help class="mc-help">You copied {formOk} of {FORM_FIELDS.length} fields correctly.</Help>}
        <Help class="mc-help">Logged a contact with {net.relay}.</Help>
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={onEnd}>
            Another net
          </button>
        </div>
      </div>
    );
  }

  const who = step.from === 'ncs' ? `${net.ncs} (net control)` : step.from === 'relay' ? net.relay : 'You';
  return (
    <div class="mc-qso-run">
      <ol class="mc-run-steps" aria-label="Net">
        {net.steps.map((st, k) => (
          <li key={k} aria-current={k === i ? 'step' : undefined} data-done={k < i ? 'true' : undefined}>
            {st.from === 'ncs' ? 'NCS' : st.from === 'relay' ? 'Relay' : 'You'}
          </li>
        ))}
      </ol>
      <p class="mc-label">{who}</p>
      {step.from === 'you' ? (
        keyed ? (
          <YourTurnKeyed key={i} text={step.text} expect={step.expect ?? []} onDone={next} />
        ) : (
          <YourTurnAuto key={i} text={step.text} radio={radio} onDone={next} />
        )
      ) : step.form ? (
        <ReceiveRadiogram key={i} net={net} text={step.text} radio={radio} onDone={(n) => (setFormOk(n), next())} />
      ) : (
        <div class="mc-qso-turn" data-sent={step.text}>
          <CopyTask key={i} radio={radio} text={step.text} startLabel="Listen" />
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn" onClick={next}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Copy an incoming radiogram onto the message form, then check it field by field. */
function ReceiveRadiogram({ net, text, radio, onDone }: { net: Net; text: string; radio: ReturnType<typeof useRadio>; onDone(right: number): void }) {
  const blank = useMemo(() => Object.fromEntries(FORM_FIELDS.map((f) => [f.key, ''])) as unknown as RadiogramForm, []);
  const [form, setForm] = useState<RadiogramForm>(blank);
  const [result, setResult] = useState<ReturnType<typeof checkForm> | null>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div class="mc-radiogram" data-form={JSON.stringify(toForm(net.radiogram))}>
      <Help class="mc-help">
        Copy the message onto the form. The <strong>check</strong> is the number of words in the text: count yours to see if you
        missed one. Precedence: {Object.entries(PRECEDENCE).map(([k, v]) => `${k} = ${v}`).join(', ')}.
      </Help>
      <div class="mc-stage-actions">
        <Lamp lit={radio.lit} size="sm" />
        <button
          type="button"
          class="mc-btn primary"
          disabled={playing}
          onClick={async () => {
            setPlaying(true);
            await radio.play(text);
            setPlaying(false);
          }}
        >
          <IconPlay />
          {playing ? 'Receiving…' : 'Receive the message'}
        </button>
      </div>
      <div class="mc-radiogram-form">
        {FORM_FIELDS.map(({ key, label }) => {
          const r = result?.fields.find((f) => f.key === key);
          return (
            <label key={key} class={'mc-field' + (key === 'text' ? ' wide' : '')} data-ok={r ? String(r.ok) : undefined}>
              <span>
                {label}
                {r && !r.ok ? ` (was ${r.want})` : ''}
              </span>
              <input class="mc-text" value={form[key]} autocomplete="off" onInput={(e) => setForm((f) => ({ ...f, [key]: e.currentTarget.value.toUpperCase() }))} />
            </label>
          );
        })}
      </div>
      {result ? (
        <>
          <p class="mc-feedback" role="status">
            {result.right} of {result.total} fields right.{' '}
            {result.checkAgrees ? 'Your text matches the check.' : "Your text doesn't match the check: a word is missing or extra."}
          </p>
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn primary" onClick={() => onDone(result.right)}>
              Send QSL
            </button>
          </div>
        </>
      ) : (
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={() => setResult(checkForm(net.radiogram, form))}>
            Check my copy
          </button>
        </div>
      )}
    </div>
  );
}
