import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from './i18n';
import { loadProgress, updateProgress } from '../learn/store';
import { sanitizeSettings } from '../learn/progress';

const KEY = 'mc:onboarded:v1';

/**
 * Show the welcome only on a first visit that lands on the home page. Someone
 * following a link to a particular screen (`#/learn`, a shared translation) goes
 * straight there.
 */
export function onboardingWanted(): boolean {
  try {
    if (localStorage.getItem(KEY)) return false;
  } catch {
    return false; // storage blocked: don't nag on every visit
  }
  return location.hash === '' || location.hash === '#' || location.hash === '#/';
}

function remember() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked */
  }
}

const SPEEDS = [
  { id: 'gentle', charWpm: 15, effWpm: 5, label: 'onboard.speed.gentle' },
  { id: 'standard', charWpm: 20, effWpm: 10, label: 'onboard.speed.standard' },
  { id: 'brisk', charWpm: 25, effWpm: 15, label: 'onboard.speed.brisk' },
] as const;

/** A 30-second first run: pick a goal, and the app sets itself up for it. */
export function Onboarding({ onDone }: { onDone(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<'goal' | 'learn' | 'air'>('goal');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['id']>('standard');
  const [call, setCall] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    void loadProgress();
  }, []);

  const finish = (to?: string) => {
    remember();
    ref.current?.close();
    onDone();
    if (to) location.hash = to;
  };

  return (
    <dialog ref={ref} class="mc-onboard" aria-labelledby="mc-onboard-title" onCancel={() => finish()}>
      {step === 'goal' && (
        <>
          <h2 id="mc-onboard-title" class="mc-display">
            {t('onboard.title')}
          </h2>
          <p class="mc-help">{t('onboard.intro')}</p>
          <div class="mc-onboard-goals">
            <button type="button" class="mc-style-card" onClick={() => finish('/translate')}>
              <strong>{t('onboard.translate')}</strong>
              <span class="mc-help">{t('onboard.translate.about')}</span>
            </button>
            <button type="button" class="mc-style-card" onClick={() => setStep('learn')}>
              <strong>{t('onboard.learn')}</strong>
              <span class="mc-help">{t('onboard.learn.about')}</span>
            </button>
            <button type="button" class="mc-style-card" onClick={() => setStep('air')}>
              <strong>{t('onboard.air')}</strong>
              <span class="mc-help">{t('onboard.air.about')}</span>
            </button>
          </div>
          <div class="mc-stage-actions">
            <button type="button" class="mc-btn ghost" onClick={() => finish()}>
              {t('onboard.skip')}
            </button>
          </div>
        </>
      )}
      {step === 'learn' && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            const sp = SPEEDS.find((x) => x.id === speed)!;
            void loadProgress().then(() => updateProgress((p) => (p.settings = sanitizeSettings({ ...p.settings, charWpm: sp.charWpm, effWpm: sp.effWpm }))));
            finish('/learn');
          }}
        >
          <h2 id="mc-onboard-title" class="mc-display">
            {t('onboard.speed')}
          </h2>
          <p class="mc-help">{t('onboard.speed.about')}</p>
          <fieldset class="mc-onboard-speeds">
            <legend class="mc-sr">{t('onboard.speed')}</legend>
            {SPEEDS.map((s) => (
              <label key={s.id} class="mc-onboard-choice">
                <input type="radio" name="speed" value={s.id} checked={speed === s.id} onChange={() => setSpeed(s.id)} />
                <span>{t(s.label)}</span>
              </label>
            ))}
          </fieldset>
          <div class="mc-stage-actions">
            <button type="submit" class="mc-btn primary">
              {t('onboard.start')}
            </button>
            <button type="button" class="mc-btn ghost" onClick={() => setStep('goal')}>
              {t('onboard.back')}
            </button>
          </div>
        </form>
      )}
      {step === 'air' && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            const licensed = (e.submitter as HTMLButtonElement | null)?.value === 'licensed';
            const c = call.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
            const n = name.trim();
            if (c || n) void loadProgress().then(() => updateProgress((p) => (p.operator = { ...p.operator, ...(c ? { call: c } : {}), ...(n ? { name: n.toUpperCase() } : {}) })));
            finish(licensed ? '/shack' : '/radio?tab=licence');
          }}
        >
          <h2 id="mc-onboard-title" class="mc-display">
            {t('onboard.air')}
          </h2>
          <label class="mc-field">
            <span>{t('onboard.call')}</span>
            <input class="mc-mono" value={call} autocomplete="off" maxLength={15} onInput={(e) => setCall(e.currentTarget.value.toUpperCase())} />
          </label>
          <label class="mc-field">
            <span>{t('onboard.name')}</span>
            <input value={name} autocomplete="given-name" maxLength={20} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <div class="mc-stage-actions">
            <button type="submit" class="mc-btn primary" value="licensed">
              {t('onboard.licensed')}
            </button>
            <button type="submit" class="mc-btn" value="learner">
              {t('onboard.unlicensed')}
            </button>
            <button type="button" class="mc-btn ghost" onClick={() => setStep('goal')}>
              {t('onboard.back')}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
