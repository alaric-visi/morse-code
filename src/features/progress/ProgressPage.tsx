import { useEffect, useRef, useState } from 'preact/hooks';
import { charsAt, lessonOf, MAX_LEVEL } from '../../learn/koch';
import { streak, topConfusions, type Confusion } from '../../learn/stats';
import { emptyProgress, exportProgress, importProgress, type Progress, type SessionLog } from '../../learn/progress';
import { loadProgress, persistent, progress, replaceProgress } from '../../learn/store';
import { saveBlob } from '../../audio/export';
import { Ladder } from '../learn/Learn';
import { Help } from '../../ui/Linked';

/** How you're doing: mastery, streak, copy accuracy over time, and what you mix up. */
export function ProgressPage() {
  const [ready, setReady] = useState(!!progress.value);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void loadProgress().then(() => setReady(true));
  }, []);
  const p = progress.value;
  const file = useRef<HTMLInputElement>(null);
  if (!ready || !p) return <Help class="mc-help">Loading your progress…</Help>;

  const minutes = Math.round(p.sessions.reduce((a, s) => a + s.seconds, 0) / 60);
  const days = streak(p.days, new Date());

  const doExport = () => {
    const blob = new Blob([exportProgress(p)], { type: 'application/json' });
    saveBlob(blob, `morse-code-progress-${new Date().toISOString().slice(0, 10)}.json`);
    setMsg('Progress exported.');
  };
  const doImport = async (f: File) => {
    try {
      const next = importProgress(await f.text());
      await replaceProgress(next);
      setMsg(`Imported: lesson ${lessonOf(next.level)}, ${next.sessions.length} sessions.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const doReset = () => {
    if (!confirm('Reset all course progress? This cannot be undone. Export first if you might want it back.')) return;
    void replaceProgress(emptyProgress());
    setMsg('Progress reset.');
  };

  return (
    <div class="mc-progress">
      <h1 class="mc-display mc-page-title">Progress</h1>

      <section class="mc-tiles" aria-label="Summary">
        <Tile label="Lesson" value={`${lessonOf(p.level)}`} note={`of ${MAX_LEVEL - 1}`} />
        <Tile label="Characters" value={`${p.level}`} note={`of ${MAX_LEVEL}`} />
        <Tile label="Streak" value={`${days}`} note={days === 1 ? 'day' : 'days'} />
        <Tile label="Practice" value={`${minutes}`} note={minutes === 1 ? 'minute' : 'minutes'} />
      </section>

      <section class="mc-panel" aria-labelledby="mc-mastery-title">
        <h2 class="mc-label" id="mc-mastery-title">
          Mastery
        </h2>
        <Ladder p={p} />
        <ul class="mc-mastery-legend" aria-label="Key">
          {['Not yet', 'Learning', 'Getting there', 'Good', 'Solid'].map((l, i) => (
            <li key={l}>
              <span class="mc-swatch" data-mastery={i} />
              {l}
            </li>
          ))}
        </ul>
      </section>

      <section class="mc-panel" aria-labelledby="mc-acc-title">
        <h2 class="mc-label" id="mc-acc-title">
          Copy accuracy
        </h2>
        <AccuracyChart sessions={p.sessions.filter((s) => s.copyAccuracy !== undefined)} />
      </section>

      <section class="mc-panel" aria-labelledby="mc-conf-title">
        <h2 class="mc-label" id="mc-conf-title">
          What you mix up
        </h2>
        <Confusions confusion={p.confusion} known={charsAt(p.level)} />
      </section>

      <section class="mc-panel mc-data" aria-labelledby="mc-data-title">
        <h2 class="mc-label" id="mc-data-title">
          Your data
        </h2>
        <Help class="mc-help">
          Progress is saved in this browser only{persistent.value ? '' : " (and right now it can't be saved at all)"}. Export
          it to keep a copy or move it to another device.
        </Help>
        <div class="mc-stage-actions">
          <button type="button" class="mc-btn" onClick={doExport}>
            Export progress
          </button>
          <button type="button" class="mc-btn" onClick={() => file.current?.click()}>
            Import progress
          </button>
          <button type="button" class="mc-btn ghost mc-danger" onClick={doReset}>
            Reset
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            class="mc-sr"
            aria-label="Progress file to import"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void doImport(f);
              e.currentTarget.value = '';
            }}
          />
        </div>
        <Help class="mc-help" role="status" aria-live="polite">
          {msg}
        </Help>
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div class="mc-tile mc-panel">
      <span class="mc-label">{label}</span>
      <span class="mc-tile-value mc-display mc-num">{value}</span>
      <span class="mc-help">{note}</span>
    </div>
  );
}

// ------------------------------------------------------------------ accuracy chart

const W = 640;
const H = 220;
const PAD = { l: 40, r: 16, t: 14, b: 28 };

/**
 * Copy accuracy per session (one series, so no legend), with the 90% pass line.
 * Hover or focus shows the session; a table view carries the same data.
 */
function AccuracyChart({ sessions }: { sessions: SessionLog[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!sessions.length) return <Help class="mc-help">Finish a copy drill and your accuracy will show up here.</Help>;
  const n = sessions.length;
  const x = (i: number) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
  const pts = sessions.map((s, i) => [x(i), y(s.copyAccuracy!)] as const);
  const path = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const fmtDate = (s: SessionLog) => new Date(s.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const h = hover !== null ? sessions[hover] : null;

  const onMove = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };

  return (
    <div class="mc-chart">
      <ul class="mc-chart-key" aria-label="Key">
        <li>
          <svg width="22" height="8" aria-hidden="true">
            <line class="mc-chart-key-target" x1="0" x2="22" y1="4" y2="4" />
          </svg>
          90% needed to unlock the next character
        </li>
        <li>
          <svg width="12" height="12" aria-hidden="true">
            <circle class="mc-chart-dot up" cx="6" cy="6" r="4" />
          </svg>
          Unlocked a character
        </li>
      </ul>
      <div class="mc-chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Copy accuracy over ${n} session${n > 1 ? 's' : ''}, latest ${Math.round(sessions[n - 1].copyAccuracy! * 100)}%`}
          tabindex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setHover((h0) => Math.max(0, (h0 ?? n - 1) - 1));
            if (e.key === 'ArrowRight') setHover((h0) => Math.min(n - 1, (h0 ?? n - 1) + 1));
          }}
        >
          {[0, 0.5, 1].map((v) => (
            <g key={v} class="mc-chart-grid">
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
              <text x={PAD.l - 8} y={y(v)} dy="0.32em" text-anchor="end">
                {v * 100}%
              </text>
            </g>
          ))}
          <g class="mc-chart-target">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(0.9)} y2={y(0.9)} />
          </g>
          <text class="mc-chart-axis" x={PAD.l} y={H - 6}>
            {fmtDate(sessions[0])}
          </text>
          {n > 1 && (
            <text class="mc-chart-axis" x={W - PAD.r} y={H - 6} text-anchor="end">
              {fmtDate(sessions[n - 1])}
            </text>
          )}
          {hover !== null && <line class="mc-chart-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />}
          <path class="mc-chart-line" d={path} />
          {pts.map(([px, py], i) => (
            <circle key={i} class={'mc-chart-dot' + (sessions[i].levelUp ? ' up' : '')} cx={px} cy={py} r={hover === i ? 6 : 4} />
          ))}
        </svg>
        {h && hover !== null && (
          <div
            class="mc-tooltip"
            data-below={pts[hover][1] < 70 ? 'true' : undefined}
            data-edge={x(hover) < W * 0.15 ? 'left' : x(hover) > W * 0.85 ? 'right' : undefined}
            style={{ left: `${(x(hover) / W) * 100}%`, top: `${(pts[hover][1] / H) * 100}%` }}
            role="status"
          >
            <strong class="mc-num">{Math.round(h.copyAccuracy! * 100)}%</strong>
            <span>
              {fmtDate(h)} · lesson {lessonOf(h.level)} · {h.copyChars} chars
            </span>
            {h.levelUp && <span>Unlocked a character</span>}
          </div>
        )}
      </div>
      <details class="mc-table-view">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Lesson</th>
              <th scope="col">Characters</th>
              <th scope="col">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {sessions
              .slice()
              .reverse()
              .map((s) => (
                <tr key={s.at}>
                  <td>{new Date(s.at).toLocaleString()}</td>
                  <td class="mc-num">{lessonOf(s.level)}</td>
                  <td class="mc-num">{s.copyChars}</td>
                  <td class="mc-num">{Math.round(s.copyAccuracy! * 100)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ confusion heat map

/**
 * Sent (rows) against what you answered (columns), for the characters you mix up
 * most. One-hue sequential ramp; every cell also shows its count.
 */
function Confusions({ confusion, known }: { confusion: Confusion; known: string[] }) {
  const top = topConfusions(confusion, 12);
  if (!top.length) return <Help class="mc-help">No mix-ups yet. When you confuse two characters, they'll show up here and get extra practice.</Help>;
  const order = new Map(known.map((c, i) => [c, i]));
  const chars = [...new Set(top.flatMap(([a, b]) => [a, b]))]
    .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
    .slice(0, 10);
  const max = Math.max(...top.map((t) => t[2]));
  const step = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  return (
    <div class="mc-confusion">
      <table class="mc-heat" aria-label="Confusion: character sent (row) against your answer (column)">
        <thead>
          <tr>
            <th scope="col">
              <span class="mc-sr">Sent</span>
            </th>
            {chars.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chars.map((r) => (
            <tr key={r}>
              <th scope="row">{r}</th>
              {chars.map((c) => {
                const v = r === c ? 0 : confusion[r]?.[c] ?? 0;
                return (
                  <td key={c} data-step={step(v)} data-self={r === c ? 'true' : undefined} title={v ? `${r} taken for ${c}: ${v}×` : undefined}>
                    {v || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ol class="mc-conf-list">
        {top.slice(0, 6).map(([a, b, n]) => (
          <li key={a + b}>
            <strong>{a}</strong> taken for <strong>{b}</strong> <span class="mc-num mc-help">{n}×</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type { Progress };
