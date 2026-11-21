import { CONDITION_PRESETS, FILTERS, type Conditions, type ConditionsPreset } from '../../audio/band';
import { FIST_PRESETS, type FistPreset } from '../../core/fist-model';
import { Slider, Switch } from '../../ui/controls';
import { sanitizeRadio, saveRadio, type RadioSettings } from './radio';
import { Help } from '../../ui/Linked';

/** Band conditions, your receiver, and the station's speed and fist. */
export function RadioPanel({ s, onChange, compact = false }: { s: RadioSettings; onChange(s: RadioSettings): void; compact?: boolean }) {
  const set = (patch: Partial<RadioSettings>) => {
    const next = sanitizeRadio({ ...s, ...patch });
    saveRadio(next);
    onChange(next);
  };
  const setC = (patch: Partial<Conditions>) => set({ preset: 'custom', c: { ...s.c, ...patch } });
  const presetInfo = s.preset === 'custom' ? null : CONDITION_PRESETS[s.preset];

  return (
    <section class={'mc-panel mc-radio' + (compact ? ' compact' : '')} aria-label="Band, receiver and station">
      <fieldset class="mc-group">
        <legend class="mc-label">Band</legend>
        <div class="mc-field">
          <label for="mc-band">Conditions</label>
          <select
            id="mc-band"
            value={s.preset}
            onChange={(e) => {
              const v = e.currentTarget.value as ConditionsPreset | 'custom';
              if (v === 'custom') set({ preset: 'custom' });
              else set({ preset: v, c: CONDITION_PRESETS[v].c });
            }}
          >
            {(Object.keys(CONDITION_PRESETS) as ConditionsPreset[]).map((k) => (
              <option key={k} value={k}>
                {CONDITION_PRESETS[k].label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <Help class="mc-help">{presetInfo ? presetInfo.about : 'Your own mix of conditions.'}</Help>
        </div>
        <details class="mc-fine">
          <summary>Fine-tune conditions</summary>
          <div class="mc-fine-grid">
            <Slider label="Noise" min={0} max={1} step={0.05} value={s.c.noise} display={`${Math.round(s.c.noise * 100)}%`} onInput={(v) => setC({ noise: v })} />
            <Slider label="Fading (QSB)" min={0} max={1} step={0.05} value={s.c.qsb} display={`${Math.round(s.c.qsb * 100)}%`} onInput={(v) => setC({ qsb: v })} />
            <Slider label="Fading speed" min={0.03} max={1} step={0.01} value={s.c.qsbRate} display={`${s.c.qsbRate.toFixed(2)} Hz`} onInput={(v) => setC({ qsbRate: v })} />
            <Slider label="Static crashes (QRN)" min={0} max={1} step={0.05} value={s.c.qrn} display={`${Math.round(s.c.qrn * 100)}%`} onInput={(v) => setC({ qrn: v })} />
            <Slider label="Nearby station (QRM)" min={0} max={1} step={0.05} value={s.c.qrm} display={`${Math.round(s.c.qrm * 100)}%`} onInput={(v) => setC({ qrm: v })} />
            <Slider label="QRM offset" min={-800} max={800} step={10} value={s.c.qrmOffset} display={`${s.c.qrmOffset > 0 ? '+' : ''}${s.c.qrmOffset} Hz`} onInput={(v) => setC({ qrmOffset: v })} />
            <Slider label="Chirp" min={0} max={150} step={5} value={s.c.chirp} display={`${s.c.chirp} Hz`} onInput={(v) => setC({ chirp: v })} />
            <Slider label="Mains hum" min={0} max={1} step={0.05} value={s.c.hum} display={`${Math.round(s.c.hum * 100)}%`} onInput={(v) => setC({ hum: v })} />
            <Slider label="Drift" min={-120} max={120} step={5} value={s.c.drift} display={`${s.c.drift} Hz/min`} onInput={(v) => setC({ drift: v })} />
            <Slider label="Auroral flutter" min={0} max={1} step={0.05} value={s.c.flutter} display={`${Math.round(s.c.flutter * 100)}%`} onInput={(v) => setC({ flutter: v })} />
            <Slider label="Echo (multipath)" min={0} max={1} step={0.05} value={s.c.echo} display={`${Math.round(s.c.echo * 100)}%`} onInput={(v) => setC({ echo: v })} />
            <div class="mc-switches">
              <Switch label="Key clicks" checked={s.c.clicks} onChange={(v) => setC({ clicks: v })} />
              <Switch label="Pink noise (softer hiss)" checked={s.c.pink} onChange={(v) => setC({ pink: v })} />
            </div>
          </div>
        </details>
      </fieldset>

      <fieldset class="mc-group">
        <legend class="mc-label">Receiver</legend>
        <div class="mc-field">
          <span class="mc-field-label-plain" id="mc-filter-label">
            Filter
          </span>
          <div class="mc-seg" role="group" aria-labelledby="mc-filter-label">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={s.rx.filter === f} onClick={() => set({ rx: { ...s.rx, filter: f } })}>
                {f >= 1000 ? `${f / 1000} k` : f}
              </button>
            ))}
          </div>
          <Help class="mc-help">Narrower lifts a weak signal out of the noise and shuts out neighbours, but you must be tuned in.</Help>
        </div>
        <Slider label="RIT" min={-500} max={500} step={10} value={s.rx.rit} display={`${s.rx.rit > 0 ? '+' : ''}${s.rx.rit} Hz`} onInput={(v) => set({ rx: { ...s.rx, rit: v } })} />
        <Slider label="Volume" min={0} max={1} step={0.05} value={s.volume} display={`${Math.round(s.volume * 100)}%`} onInput={(v) => set({ volume: v })} />
        <Switch label="AGC" checked={s.rx.agc} onChange={(v) => set({ rx: { ...s.rx, agc: v } })} />
      </fieldset>

      <fieldset class="mc-group">
        <legend class="mc-label">Station</legend>
        <Slider label="Character speed" min={5} max={60} step={1} value={s.charWpm} display={`${s.charWpm} WPM`} onInput={(v) => set({ charWpm: v })} />
        <Slider
          label="Effective speed"
          min={5}
          max={s.charWpm}
          step={1}
          value={Math.min(s.effWpm, s.charWpm)}
          display={`${Math.min(s.effWpm, s.charWpm)} WPM`}
          onInput={(v) => set({ effWpm: v })}
        />
        <div class="mc-field">
          <label for="mc-fist">Fist</label>
          <select id="mc-fist" value={s.fist} onChange={(e) => set({ fist: e.currentTarget.value as FistPreset })}>
            {(Object.keys(FIST_PRESETS) as FistPreset[]).map((k) => (
              <option key={k} value={k}>
                {FIST_PRESETS[k].label}
              </option>
            ))}
          </select>
          <Help class="mc-help">{FIST_PRESETS[s.fist].about}</Help>
        </div>
      </fieldset>
    </section>
  );
}
