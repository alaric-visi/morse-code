import { useEffect, useRef, useState } from 'preact/hooks';
import regions from '../../../content/callsigns/regions.json';
import { awards, fromAdif, toAdif } from '../../learn/logbook';
import { loadProgress, progress, updateProgress } from '../../learn/store';
import { saveBlob } from '../../audio/export';
import { Help } from '../../ui/Linked';

/** Your logbook: every simulated contact plus anything imported, with award tallies. */
export function Logbook() {
  useEffect(() => void loadProgress(), []);
  const log = progress.value?.log ?? [];
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const a = awards(log, regions.states);
  const sources = [...new Set(log.map((e) => e.source))];
  const shown = log.filter((e) => filter === 'all' || e.source === filter).slice().reverse().slice(0, 300);

  return (
    <div class="mc-logbook">
      <section class="mc-tiles" aria-label="Awards">
        <div class="mc-tile mc-panel">
          <span class="mc-label">Contacts</span>
          <span class="mc-tile-value mc-display mc-num" data-testid="log-count">
            {a.contacts}
          </span>
          <span class="mc-help">{a.uniqueCalls} different calls</span>
        </div>
        <div class="mc-tile mc-panel" title={a.countries.join(', ')}>
          <span class="mc-label">Countries</span>
          <span class="mc-tile-value mc-display mc-num">{a.countries.length}</span>
          <span class="mc-help">DXCC-style: 100 is the classic goal</span>
        </div>
        <div class="mc-tile mc-panel" title={a.zones.join(', ')}>
          <span class="mc-label">CQ zones</span>
          <span class="mc-tile-value mc-display mc-num">{a.zones.length}</span>
          <span class="mc-help">of 40 (WAZ-style)</span>
        </div>
        <div class="mc-tile mc-panel" title={a.states.join(', ')}>
          <span class="mc-label">US states</span>
          <span class="mc-tile-value mc-display mc-num">{a.states.length}</span>
          <span class="mc-help">of 50 (WAS-style)</span>
        </div>
        <div class="mc-tile mc-panel" title={a.continents.join(', ')}>
          <span class="mc-label">Continents</span>
          <span class="mc-tile-value mc-display mc-num">{a.continents.length}</span>
          <span class="mc-help">of 6 (WAC-style)</span>
        </div>
      </section>

      <section class="mc-panel" aria-labelledby="mc-log-title">
        <div class="mc-panel-head">
          <h2 class="mc-label" id="mc-log-title">
            Log
          </h2>
          <label class="mc-field mc-inline">
            <span>Show</span>
            <select value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
              <option value="all">Everything</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div class="mc-stage-actions">
          <button
            type="button"
            class="mc-btn"
            disabled={!log.length}
            onClick={() => saveBlob(new Blob([toAdif(log)], { type: 'text/plain' }), `morse-code-log-${new Date().toISOString().slice(0, 10)}.adi`)}
          >
            Export ADIF
          </button>
          <button type="button" class="mc-btn" onClick={() => file.current?.click()}>
            Import ADIF
          </button>
          <button
            type="button"
            class="mc-btn ghost mc-danger"
            disabled={!log.length}
            onClick={() => {
              if (confirm('Delete every contact in your log? This cannot be undone. Export it first if you might want it.')) {
                void updateProgress((p) => (p.log = []));
                setMsg('Log cleared.');
              }
            }}
          >
            Clear log
          </button>
          <input
            ref={file}
            type="file"
            accept=".adi,.adif,text/plain"
            class="mc-sr"
            aria-label="ADIF file to import"
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!f) return;
              const entries = fromAdif(await f.text());
              if (!entries.length) return setMsg("No contacts found in that file. Is it ADIF (.adi)?");
              await updateProgress((p) => (p.log = [...p.log, ...entries].slice(-5000)));
              setMsg(`Imported ${entries.length} contact${entries.length > 1 ? 's' : ''}.`);
            }}
          />
        </div>
        <Help class="mc-help" role="status" aria-live="polite">
          {msg || 'ADIF works with most logging programs. Imported contacts count towards the award tallies too.'}
        </Help>
        {shown.length ? (
          <div class="mc-table-scroll">
            <table class="mc-fist-table mc-logtable">
              <thead>
                <tr>
                  <th scope="col">UTC</th>
                  <th scope="col">Call</th>
                  <th scope="col">Band</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Rcvd</th>
                  <th scope="col">Country</th>
                  <th scope="col">From</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={i}>
                    <td class="mc-num">{e.at.slice(0, 16).replace('T', ' ')}</td>
                    <td class="mc-mono">{e.call}</td>
                    <td>{e.band}</td>
                    <td class="mc-mono">{e.exchSent ?? e.rstSent}</td>
                    <td class="mc-mono">{e.exchRcvd ?? e.rstRcvd}</td>
                    <td>{e.country ?? ''}</td>
                    <td>{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Help class="mc-help">No contacts yet. Work some stations in the Shack or on the QSO page and they'll appear here.</Help>
        )}
      </section>
    </div>
  );
}
