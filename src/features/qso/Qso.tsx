import { useEffect, useMemo, useState } from 'preact/hooks';
import { FIST_PRESETS } from '../../core/fist-model';
import { makeQso, missingFrom, QSO_STYLES, type Qso as QsoData, type QsoStyle } from '../../learn/qso';
import { sanitizeOperator, type OperatorInfo } from '../../learn/progress';
import { seeded } from '../../learn/random';
import { loadProgress, progress, updateProgress } from '../../learn/store';
import { Lamp } from '../../ui/Lamp';
import { IconPlay } from '../../ui/icons';
import { CopyTask } from '../listen/CopyTask';
import { RadioPanel } from '../listen/RadioPanel';
import { loadRadio, useRadio, type RadioSettings } from '../listen/radio';
import { loadSend } from '../send/settings';
import { useKeying } from '../send/useKeying';
import { Help } from '../../ui/Linked';

type Mode = 'receive' | 'send';
const PASS = 0.8;
/** Used until you set your own. */
const EXAMPLE: OperatorInfo = { call: 'M0ABC', name: 'ALEX', qth: 'LEEDS' };

/**
 * A simulated contact. They call CQ; you answer. Copy their overs (ask for a
 * slower repeat if you need one) and either let the app send your side or key
 * it yourself, in which case it checks you included what matters.
 */
export function Qso() {
  useEffect(() => void loadProgress(), []);
  const p = progress.value;
  const op = p?.operator ?? EXAMPLE;
  const me: OperatorInfo = { call: op.call.trim() || EXAMPLE.call, name: op.name.trim() || EXAMPLE.name, qth: op.qth.trim() || EXAMPLE.qth };
  const [s, setS] = useState<RadioSettings>(loadRadio);
  const radio = useRadio(s);
  const [style, setStyle] = useState<QsoStyle>('standard');
  const [mode, setMode] = useState<Mode>('receive');
  const [ownFist, setOwnFist] = useState(true);
  const [qso, setQso] = useState<QsoData | null>(null);

  const start = () => setQso(makeQso(style, me, seeded(Date.now() & 0xffffffff), new Date().getHours()));

  return (
    <div class="mc-listen mc-qso">
      <section class="mc-panel mc-listen-main" aria-labelledby="mc-qso-title">
        <h1 class="mc-display mc-listen-title" id="mc-qso-title">
          On the air
        </h1>
        {!qso ? (
          <div class="mc-qso-setup">
            <Help class="mc-help">
              A station is calling CQ. Answer it, exchange reports, and see the contact through to the end. Real operators slow down
              (QRS) when asked, and so does this one.
            </Help>
            <fieldset class="mc-group">
              <legend class="mc-label">You</legend>
              <div class="mc-op-fields">
                {(['call', 'name', 'qth'] as const).map((k) => (
                  <label key={k} class="mc-field">
                    <span>{k === 'call' ? 'Callsign' : k === 'name' ? 'Name' : 'QTH (town)'}</span>
                    <input
                      class="mc-text"
                      value={op[k]}
                      placeholder={EXAMPLE[k]}
                      maxLength={k === 'call' ? 12 : 20}
                      onInput={(e) => {
                        const v = e.currentTarget.value;
                        void updateProgress((x) => (x.operator = sanitizeOperator({ ...x.operator, [k]: v })));
                      }}
                    />
                  </label>
                ))}
              </div>
              {!op.call && <Help class="mc-help">Leave these blank to use the example operator {EXAMPLE.call}.</Help>}
            </fieldset>
            <fieldset class="mc-group">
              <legend class="mc-label">Contact</legend>
              <div class="mc-style-cards" role="radiogroup" aria-label="Kind of contact">
                {(Object.keys(QSO_STYLES) as QsoStyle[]).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={style === k} class="mc-style-card" onClick={() => setStyle(k)}>
                    <strong>{QSO_STYLES[k].label}</strong>
                    <span class="mc-help">{QSO_STYLES[k].about}</span>
                  </button>
                ))}
              </div>
              <div class="mc-seg" role="group" aria-label="Their sending">
                <button type="button" aria-pressed={ownFist} onClick={() => setOwnFist(true)}>
                  Their own fist
                </button>
                <button type="button" aria-pressed={!ownFist} onClick={() => setOwnFist(false)}>
                  Fist from Station settings ({FIST_PRESETS[s.fist].label})
                </button>
              </div>
              <div class="mc-seg" role="group" aria-label="Your side">
                <button type="button" aria-pressed={mode === 'receive'} onClick={() => setMode('receive')}>
                  Receive only
                </button>
                <button type="button" aria-pressed={mode === 'send'} onClick={() => setMode('send')}>
                  Send my side on the key
                </button>
              </div>
            </fieldset>
            <div class="mc-stage-actions">
              <button type="button" class="mc-btn primary" onClick={start}>
                <IconPlay />
                Tune in
              </button>
            </div>
          </div>
        ) : (
          <Contact
            key={qso.them.call}
            qso={ownFist ? qso : { ...qso, them: { ...qso.them, fist: s.fist } }}
            mode={mode}
            radio={radio}
            s={s}
            onEnd={() => (radio.rest(), setQso(null))}
          />
        )}
      </section>
      <div class="mc-listen-side">
        <RadioPanel s={s} onChange={setS} compact />
      </div>
    </div>
  );
}

interface TurnResult {
  accuracy: number;
  repeats: number;
}

function Contact({
  qso,
  mode,
  radio,
  s,
  onEnd,
}: {
  qso: QsoData;
  mode: Mode;
  radio: ReturnType<typeof useRadio>;
  s: RadioSettings;
  onEnd(): void;
}) {
  const [i, setI] = useState(0);
  const [wpm, setWpm] = useState(s.charWpm);
  const [eff, setEff] = useState(s.effWpm);
  const [attempt, setAttempt] = useState(0);
  const [lastAcc, setLastAcc] = useState<number | null>(null);
  const [results, setResults] = useState<TurnResult[]>([]);
  const turn = qso.turns[i];
  const finished = i >= qso.turns.length;
  const them = qso.them;
  const repeatsSoFar = attempt;

  const next = () => {
    setI((x) => x + 1);
    setAttempt(0);
    setLastAcc(null);
  };
  const qrs = () => {
    // They slow down for the repeat, and stay slower for the rest of the contact.
    setWpm((w) => Math.max(8, w - 3));
    setEff((e) => Math.max(5, e - 3));
    setAttempt((a) => a + 1);
    setLastAcc(null);
  };

  if (finished) {
    const avg = results.length ? results.reduce((a, r) => a + r.accuracy, 0) / results.length : 0;
    return (
      <div class="mc-stage mc-done" role="status">
        <p class="mc-label">Contact complete</p>
        <h2 class="mc-display mc-done-title">
          {them.call} in {them.qth}, {them.country}
        </h2>
        <dl class="mc-done-stats">
          <div>
            <dt>Your copy</dt>
            <dd class="mc-num">{Math.round(avg * 100)}%</dd>
          </div>
          <div>
            <dt>Repeats asked</dt>
            <dd class="mc-num">{results.reduce((a, r) => a + r.repeats, 0)}</dd>
          </div>
          <div>
            <dt>Their speed at the end</dt>
            <dd class="mc-num">{wpm} WPM</dd>
          </div>
        </dl>
        <Help class="mc-help">
          {them.name} was using {them.rig} at {them.power} W into a {them.antenna.toLowerCase()}, with {FIST_PRESETS[them.fist].label.toLowerCase()} timing.
        </Help>
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn primary" onClick={onEnd}>
            Another contact
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="mc-qso-run">
      <ol class="mc-run-steps" aria-label="Overs">
        {qso.turns.map((t, k) => (
          <li key={k} aria-current={k === i ? 'step' : undefined} data-done={k < i ? 'true' : undefined}>
            {t.from === 'them' ? them.call.split('/')[0] : 'You'}
          </li>
        ))}
      </ol>
      {turn.from === 'them' ? (
        <div class="mc-qso-turn" data-sent={turn.text}>
          <Help class="mc-help">
            {i === 0 ? 'Someone is calling CQ. Copy what they send.' : `${them.call.split('/')[0]} comes back to you.`} {wpm !== s.charWpm && `(Now ${wpm} WPM.)`}
          </Help>
          <CopyTask
            key={`${i}-${attempt}`}
            radio={radio}
            text={turn.text}
            opts={{ wpm, effWpm: Math.min(eff, wpm), fist: them.fist }}
            startLabel={attempt ? 'Listen to the repeat' : i === 0 ? 'Listen' : 'Listen to their over'}
            onDone={(r) => setLastAcc(r.accuracy)}
          />
          {lastAcc !== null && (
            <div class="mc-stage-actions">
              {lastAcc < PASS && (
                <button type="button" class="mc-btn" onClick={qrs}>
                  Ask for a repeat, slower (QRS)
                </button>
              )}
              <button
                type="button"
                class={'mc-btn' + (lastAcc >= PASS ? ' primary' : '')}
                onClick={() => {
                  setResults((rs) => [...rs, { accuracy: lastAcc, repeats: repeatsSoFar }]);
                  next();
                }}
              >
                {lastAcc >= PASS ? 'Reply' : 'Carry on anyway'}
              </button>
            </div>
          )}
        </div>
      ) : mode === 'receive' ? (
        <YourTurnAuto text={turn.text} radio={radio} onDone={next} />
      ) : (
        <YourTurnKeyed text={turn.text} expect={turn.expect ?? []} onDone={next} />
      )}
    </div>
  );
}

/** Receive-only: your side is shown and sent for you, at your own pitch. */
export function YourTurnAuto({ text, radio, onDone }: { text: string; radio: ReturnType<typeof useRadio>; onDone(): void }) {
  const [sending, setSending] = useState(false);
  return (
    <div class="mc-qso-you">
      <p class="mc-label">Your reply</p>
      <p class="mc-qso-text mc-mono">{text}</p>
      <div class="mc-stage-actions">
        <Lamp lit={radio.lit} size="sm" />
        <button
          type="button"
          class="mc-btn primary"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            await radio.play(text, { clean: true, fist: 'textbook' });
            setSending(false);
            onDone();
          }}
        >
          {sending ? 'Sending…' : 'Send it'}
        </button>
        <button type="button" class="mc-btn ghost" disabled={sending} onClick={onDone}>
          Skip
        </button>
      </div>
    </div>
  );
}

/** Send your side on the key; it's decoded and checked for the essentials. */
export function YourTurnKeyed({ text, expect, onDone }: { text: string; expect: string[]; onDone(): void }) {
  const cfg = useMemo(loadSend, []);
  const k = useKeying({ input: cfg.input, wpm: cfg.wpm, swap: cfg.swap, pitch: cfg.pitch, volume: cfg.volume });
  const [missing, setMissing] = useState<string[] | null>(null);
  const sent = k.events.value.map((e) => (e.kind === 'space' ? ' ' : e.ch || '?')).join('');
  const check = () => {
    const m = missingFrom(sent, expect);
    setMissing(m);
    if (!m.length) setTimeout(onDone, 700);
  };
  return (
    <div class="mc-qso-you">
      <p class="mc-label">Your reply: send something like</p>
      <p class="mc-qso-text mc-mono">{text}</p>
      <Help class="mc-help">
        Key it with {cfg.input === 'straight' ? 'Space (straight key)' : '[ and ] (paddles)'}, set up on the Send page. Must include:{' '}
        <strong>{expect.join(', ')}</strong>.
      </Help>
      <div class="mc-qso-sending">
        <Lamp lit={k.lit} size="sm" />
        <p class="mc-transcript mc-mono" data-testid="qso-sent" aria-live="polite">
          {sent || ' '}
          <span class="mc-send-pending">{k.pending.value}</span>
        </p>
      </div>
      {missing && missing.length > 0 && (
        <p class="mc-feedback" role="status">
          They didn't catch: <strong>{missing.join(', ')}</strong>. Send it again, or carry on.
        </p>
      )}
      {missing && missing.length === 0 && (
        <p class="mc-feedback" role="status">
          R R: they got it.
        </p>
      )}
      <div class="mc-stage-actions">
        <button type="button" class="mc-btn primary" onClick={check}>
          Over (done)
        </button>
        <button type="button" class="mc-btn" onClick={() => (k.clear(), setMissing(null))}>
          Clear
        </button>
        <button type="button" class="mc-btn ghost" onClick={onDone}>
          Skip
        </button>
      </div>
    </div>
  );
}
