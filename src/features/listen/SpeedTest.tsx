import { useEffect, useMemo, useState } from 'preact/hooks';
import { CERT_ACCURACY, CERT_SECONDS, MILESTONES, type Milestone } from '../../learn/ladder';
import { certificateSvg, type CertificateColours } from '../../learn/certificate';
import { sentences } from '../../learn/material';
import { seeded } from '../../learn/random';
import { loadProgress, progress, updateProgress } from '../../learn/store';
import { sanitizeOperator } from '../../learn/progress';
import { saveBlob } from '../../audio/export';
import { readTokens } from '../../ui/canvas';
import { CopyTask } from './CopyTask';
import type { Radio } from './radio';
import { Help } from '../../ui/Linked';

/** The light theme's tokens, so a downloaded certificate looks the same whatever theme you're in. */
function certificateColours(): CertificateColours {
  const probe = document.createElement('div');
  probe.className = 'mc-root';
  probe.dataset.theme = 'light';
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const t = readTokens(probe, ['paper', 'ink', 'ink-2', 'brass', 'brass-hi'] as const);
  probe.remove();
  return { paper: t.paper, ink: t.ink, ink2: t['ink-2'], brass: t.brass, brassHi: t['brass-hi'] };
}

function download(wpm: number, accuracy: number, at: string, name: string, call: string) {
  const svg = certificateSvg({ name: name.trim() || 'A Morse Code learner', call: call.trim() || undefined, wpm, accuracy, date: new Date(at) }, certificateColours());
  saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `morse-code-certificate-${wpm}wpm.svg`);
}

/**
 * Copy tests for the speed milestones: a minute of plain text at the speed,
 * sent cleanly. 90% earns a certificate.
 */
export function SpeedTest({ radio }: { radio: Radio }) {
  useEffect(() => void loadProgress(), []);
  const p = progress.value;
  const [wpm, setWpm] = useState<Milestone>(10);
  const [round, setRound] = useState(0);
  const [earned, setEarned] = useState<{ wpm: number; accuracy: number; at: string } | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const rng = useMemo(() => seeded(Date.now() & 0xffffffff), [round]);
  // About a minute of text at this speed (PARIS: wpm × 5 letters a minute).
  const text = useMemo(() => sentences((wpm * 5 * CERT_SECONDS) / 60, rng), [wpm, round]);
  const op = p?.operator ?? { call: '', name: '', qth: '' };
  const best = (w: number) => p?.certs.filter((c) => c.wpm === w).sort((a, b) => b.accuracy - a.accuracy)[0];

  return (
    <div class="mc-speedtest">
      <Help class="mc-help">
        A minute of plain English at the speed you choose, sent cleanly at your own pitch. Copy {Math.round(CERT_ACCURACY * 100)}% to earn a
        certificate.
      </Help>
      <div class="mc-seg" role="group" aria-label="Test speed">
        {MILESTONES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={wpm === m}
            onClick={() => {
              setWpm(m);
              setEarned(null);
              setFailed(null);
              setRound((r) => r + 1);
            }}
          >
            {m}
            {best(m) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div class="mc-operator-name">
        <label class="mc-field mc-inline">
          <span>Name on certificate</span>
          <input
            class="mc-text"
            value={op.name}
            maxLength={16}
            placeholder="YOUR NAME"
            onInput={(e) => {
              const v = e.currentTarget.value;
              void updateProgress((x) => (x.operator = sanitizeOperator({ ...x.operator, name: v })));
            }}
          />
        </label>
      </div>
      <CopyTask
        key={`${wpm}-${round}`}
        radio={radio}
        text={text}
        opts={{ wpm, effWpm: wpm, fist: 'textbook', clean: true }}
        startLabel={`Start the ${wpm} WPM test`}
        onDone={(r) => {
          if (r.accuracy >= CERT_ACCURACY && r.total >= wpm * 4) {
            const cert = { wpm, accuracy: r.accuracy, at: new Date().toISOString() };
            setEarned(cert);
            void updateProgress((x) => x.certs.push(cert));
          } else setFailed(r.accuracy);
        }}
      />
      {earned && (
        <div class="mc-cert-earned" role="status">
          <p class="mc-display mc-cert-title">Certificate earned: {earned.wpm} WPM</p>
          <button type="button" class="mc-btn primary" onClick={() => download(earned.wpm, earned.accuracy, earned.at, op.name, op.call)}>
            Download certificate
          </button>
        </div>
      )}
      {failed !== null && (
        <p class="mc-feedback" role="status">
          {Math.round(failed * 100)}%: not quite. You need {Math.round(CERT_ACCURACY * 100)}% over the whole minute.{' '}
          <button type="button" class="mc-btn ghost" onClick={() => (setFailed(null), setRound((r) => r + 1))}>
            Try another passage
          </button>
        </p>
      )}
      {p && p.certs.length > 0 && (
        <section class="mc-certs" aria-label="Your certificates">
          <h3 class="mc-label">Your certificates</h3>
          <ul>
            {MILESTONES.filter((m) => best(m)).map((m) => {
              const c = best(m)!;
              return (
                <li key={m}>
                  <span class="mc-num">
                    <strong>{m} WPM</strong> · {Math.round(c.accuracy * 100)}% · {new Date(c.at).toLocaleDateString()}
                  </span>
                  <button type="button" class="mc-btn ghost" onClick={() => download(c.wpm, c.accuracy, c.at, op.name, op.call)}>
                    Download
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
