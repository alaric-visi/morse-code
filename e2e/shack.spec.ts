import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const tab = (page: Page, name: string) => page.locator('.mc-drill-nav').getByRole('button', { name, exact: true }).click();
const qsos = (page: Page) => page.getByTestId('qsos');

/** Fast stations, so tests don't wait on slow Morse. */
async function fastBand(page: Page) {
  await page.locator('.mc-radio').getByLabel('Character speed').fill('40');
  await page.locator('.mc-radio').getByLabel('Effective speed').fill('40');
}

/** Call CQ until somebody answers; return the callers ("CALL@offset"). */
async function cqUntilCalled(page: Page) {
  const contest = page.locator('.mc-contest');
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: 'F1 CQ' }).click();
    await expect(page.locator('.mc-contest + * , .mc-feedback').first()).toBeVisible();
    await expect(page.locator('.mc-contest [role="status"]')).not.toHaveText('Calling CQ…', { timeout: 30_000 });
    const callers = (await contest.getAttribute('data-callers')) ?? '';
    if (callers) return callers.split(' ').map((c) => ({ call: c.split('@')[0], offset: Number(c.split('@')[1]) }));
  }
  throw new Error('nobody called');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/shack');
  await expect(page.getByRole('heading', { name: 'Band', exact: true })).toBeVisible();
});

test('the band: tune to a station, spot it, and work it', async ({ page }) => {
  // Three real-time transmissions at the stations' own speeds (16–30 WPM).
  test.setTimeout(180_000);
  await fastBand(page);
  const main = page.locator('.mc-listen-main');
  await page.getByRole('button', { name: 'Switch on the receiver' }).click();
  // Find someone calling CQ.
  let target: { call: string; khz: number } | null = null;
  for (let i = 0; i < 6 && !target; i++) {
    const st = ((await main.getAttribute('data-stations')) ?? '').split(' ').filter(Boolean).map((x) => x.split('@'));
    const cq = st.find(([, , role]) => role === 'cq');
    if (cq) target = { call: cq[0], khz: Number(cq[1]) };
    else await page.getByRole('button', { name: 'New band' }).click();
  }
  expect(target).not.toBeNull();
  await main.getByLabel('Dial').fill(String(target!.khz));
  await expect(main).toHaveAttribute('data-tuned', target!.call);
  await page.getByPlaceholder('CALLSIGN').fill(target!.call);
  await page.getByRole('button', { name: 'Spot', exact: true }).click();
  await expect(main.locator('[role="status"]')).toContainText(`Spotted ${target!.call}`);
  await page.getByRole('button', { name: 'Call them' }).click();
  await expect(main.locator('[role="status"]')).toContainText(`Worked ${target!.call}`, { timeout: 150_000 });
});

test('propagation: 10 m at night with a low solar flux is closed', async ({ page }) => {
  await page.locator('.mc-listen-main select').first().selectOption('10m');
  await page.getByLabel('Time (UTC)').fill('2');
  await page.getByLabel('Solar flux').fill('70');
  await expect(page.getByText(/10m is closed across Europe and closed to DX/)).toBeVisible();
});

test('callsign trainer', async ({ page }) => {
  await tab(page, 'Callsigns');
  await fastBand(page);
  await page.getByRole('button', { name: 'Portable and special' }).click();
  await page.locator('.mc-qrq').getByRole('button', { name: 'Start' }).click();
  const call = (await page.locator('.mc-qrq').getAttribute('data-target'))!;
  expect(call).toMatch(/\/(P|M|MM|QRP)$|^GB\d/);
  await page.getByLabel('Callsign you heard').fill(call);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.locator('.mc-qrq .mc-push')).toHaveText('1 / 1');
});

test('a split pileup: listen up, pick a caller, log them', async ({ page }) => {
  test.setTimeout(90_000);
  await tab(page, 'Pileup');
  await fastBand(page);
  await page.getByLabel('Work split').check();
  await page.getByRole('button', { name: 'Start the pileup' }).click();
  const callers = await cqUntilCalled(page);
  for (const c of callers) {
    expect(c.offset).toBeGreaterThanOrEqual(1000);
    expect(c.offset).toBeLessThanOrEqual(3000);
  }
  const c = callers[0];
  await page.getByLabel('Listening').fill(String(Math.round(c.offset / 50) * 50));
  await page.getByLabel('Call', { exact: true }).fill(c.call);
  await page.getByLabel('Call', { exact: true }).press('Enter');
  await expect(page.locator('.mc-contest')).toHaveAttribute('data-current', c.call, { timeout: 20_000 });
  await page.getByLabel('RST').fill((await page.locator('.mc-contest').getAttribute('data-reply'))!); // their report varies
  await page.getByRole('button', { name: 'F3 Log + TU' }).click();
  await expect(qsos(page)).toHaveText('1');
});

test('a contest: run, log a contact, then end', async ({ page }) => {
  test.setTimeout(120_000);
  await tab(page, 'Contest');
  await fastBand(page);
  await page.getByRole('radio', { name: /Serial and prefix/ }).click();
  await page.getByRole('button', { name: 'Start the contest' }).click();
  const [c] = await cqUntilCalled(page);
  const contest = page.locator('.mc-contest');
  await page.getByLabel('Call', { exact: true }).fill(c.call);
  await page.getByLabel('Call', { exact: true }).press('Enter');
  await expect(contest).not.toHaveAttribute('data-reply', '', { timeout: 20_000 });
  const reply = (await contest.getAttribute('data-reply'))!.split(' ');
  await page.getByLabel('Serial', { exact: true }).fill(reply[1]);
  await page.getByLabel('Serial', { exact: true }).press('Enter');
  await expect(page.locator('.mc-contest-log')).toContainText(c.call);
  await expect(qsos(page)).toHaveText('1');
  await page.getByRole('button', { name: 'End' }).click();
  await expect(contest.locator('[role="status"]')).toHaveText('Finished.');
});

test('search and pounce: tune to a runner, call, log', async ({ page }) => {
  test.setTimeout(120_000);
  await tab(page, 'Contest');
  await fastBand(page);
  await page.getByRole('button', { name: 'Search and pounce' }).click();
  await page.getByRole('button', { name: 'Start the contest' }).click();
  const contest = page.locator('.mc-contest');
  const [first] = (await contest.getAttribute('data-runners'))!.split(' ');
  const [call, khz] = first.split('@');
  await contest.getByLabel('Dial').fill(String(Math.round(Number(khz) / 0.05) * 0.05));
  await page.getByRole('button', { name: 'F4 My call' }).click();
  await expect(contest).toHaveAttribute('data-current', call, { timeout: 30_000 });
  const reply = (await contest.getAttribute('data-reply'))!.split(' ');
  await page.getByLabel('Call', { exact: true }).fill(call);
  await page.getByLabel('Serial', { exact: true }).fill(reply[1]);
  await page.getByLabel('Serial', { exact: true }).press('Enter');
  await expect(qsos(page)).toHaveText('1');
});

test('a park activation counts towards ten', async ({ page }) => {
  test.setTimeout(90_000);
  await tab(page, 'Activations');
  await fastBand(page);
  await page.getByRole('button', { name: 'Go on the air' }).click();
  await expect(qsos(page)).toHaveText('0 / 10');
  const [c] = await cqUntilCalled(page);
  await page.getByLabel('Call', { exact: true }).fill(c.call);
  await page.getByLabel('Call', { exact: true }).press('Enter');
  const contest = page.locator('.mc-contest');
  await expect(contest).not.toHaveAttribute('data-reply', '', { timeout: 20_000 });
  const reply = (await contest.getAttribute('data-reply'))!.split(' ');
  await page.getByLabel('RST').fill(reply[0]);
  await page.getByLabel('Location').fill(reply[1]);
  await page.getByLabel('Location').press('Enter');
  await expect(qsos(page)).toHaveText('1 / 10');
});

test('a net: check in and pass a radiogram; it lands in the log', async ({ page }) => {
  test.setTimeout(240_000);
  await tab(page, 'Net');
  await fastBand(page);
  await page.getByRole('button', { name: 'Join the net' }).click();
  for (let i = 0; i < 12; i++) {
    if (await page.getByText('Net closed').isVisible()) break;
    const send = page.getByRole('button', { name: 'Send it' });
    if (await send.isVisible()) {
      await send.click();
      await expect(send).toBeHidden({ timeout: 90_000 });
      continue;
    }
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.getByText(/Radiogram NR \d+ passed and receipted/)).toBeVisible();
  await tab(page, 'Logbook');
  await expect(page.getByTestId('log-count')).toHaveText('1');
});

test('a net: receive a radiogram and copy it onto the form', async ({ page }) => {
  test.setTimeout(120_000);
  await tab(page, 'Net');
  await page.getByRole('button', { name: 'Someone has one for me' }).click();
  await page.getByRole('button', { name: 'Join the net' }).click();
  for (let i = 0; i < 6; i++) {
    if (await page.locator('.mc-radiogram').isVisible()) break;
    const send = page.getByRole('button', { name: 'Send it' });
    if (await send.isVisible()) {
      await send.click();
      await expect(send).toBeHidden({ timeout: 90_000 });
    } else await page.getByRole('button', { name: 'Continue' }).click();
  }
  const form = JSON.parse((await page.locator('.mc-radiogram').getAttribute('data-form'))!) as Record<string, string>;
  const labels: Record<string, string> = { number: 'Number', precedence: 'Precedence', station: 'Station of origin', check: 'Check', place: 'Place of origin', date: 'Date', to: 'To', address: 'Address', city: 'Town', text: 'Text', signature: 'Signature' };
  for (const [k, label] of Object.entries(labels)) await page.locator('.mc-radiogram-form').getByLabel(label, { exact: true }).fill(form[k]);
  await page.getByRole('button', { name: 'Check my copy' }).click();
  await expect(page.locator('.mc-radiogram [role="status"]')).toContainText('11 of 11 fields right. Your text matches the check.');
});

test('etiquette: eight situations', async ({ page }) => {
  await tab(page, 'Etiquette');
  for (let i = 0; i < 8; i++) {
    await page.locator('.mc-etiquette-choices button').nth(1).click();
    await expect(page.locator('.mc-etiquette [role="status"]')).toContainText('Yes.');
    await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByRole('heading', { name: '8 of 8' })).toBeVisible();
});

test('logbook: import ADIF, see awards, export it again', async ({ page }) => {
  await tab(page, 'Logbook');
  await expect(page.getByTestId('log-count')).toHaveText('0');
  const adi = '<ADIF_VER:5>3.1.4<EOH>\n<CALL:5>G4ABC<QSO_DATE:8>20261121<TIME_ON:4>1905<BAND:3>40m<MODE:2>CW<RST_SENT:3>599<RST_RCVD:3>579<EOR>\n<CALL:6>JA1XYZ<QSO_DATE:8>20261121<TIME_ON:4>2100<BAND:3>20m<MODE:2>CW<RST_SENT:3>599<RST_RCVD:3>449<EOR>';
  await page.getByLabel('ADIF file to import').setInputFiles({ name: 'log.adi', mimeType: 'text/plain', buffer: Buffer.from(adi) });
  await expect(page.getByText('Imported 2 contacts.')).toBeVisible();
  await expect(page.getByTestId('log-count')).toHaveText('2');
  await expect(page.locator('.mc-tile', { hasText: 'Countries' }).locator('.mc-tile-value')).toHaveText('2');
  await expect(page.locator('.mc-tile', { hasText: 'CQ zones' }).locator('.mc-tile-value')).toHaveText('2');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export ADIF' }).click()]);
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('<CALL:6>JA1XYZ');
  expect(text).toContain('<EOH>');
});

test('the off-air decoder reads a receiver through the microphone', async ({ page }) => {
  test.setTimeout(60_000);
  // Headless Chromium has no audio capture, so stand in for the microphone with a
  // Web Audio stream playing CW: "CQ CQ DE G4ABC G4ABC K" at 18 WPM, 700 Hz, plus
  // a little noise. Everything after the device (worklet, tone keyer, decoder) is real.
  await page.addInitScript(() => {
    const CODES: Record<string, string> = { C: '-.-.', Q: '--.-', D: '-..', E: '.', G: '--.', '4': '....-', A: '.-', B: '-...', K: '-.-' };
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      await ac.resume();
      const dest = ac.createMediaStreamDestination();
      const osc = ac.createOscillator();
      const key = ac.createGain();
      osc.frequency.value = 700;
      key.gain.value = 0;
      osc.connect(key).connect(dest);
      const noise = ac.createBufferSource();
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.02;
      noise.buffer = buf;
      noise.loop = true;
      noise.connect(dest);
      const unit = 1.2 / 18;
      let t = ac.currentTime + 1;
      for (const word of 'CQ CQ DE G4ABC G4ABC K'.split(' ')) {
        for (const ch of word) {
          for (const el of CODES[ch]) {
            const dur = (el === '-' ? 3 : 1) * unit;
            key.gain.setValueAtTime(0, t);
            key.gain.linearRampToValueAtTime(0.5, t + 0.004);
            key.gain.setValueAtTime(0.5, t + dur - 0.004);
            key.gain.linearRampToValueAtTime(0, t + dur);
            t += dur + unit;
          }
          t += 2 * unit;
        }
        t += 4 * unit;
      }
      osc.start();
      noise.start();
      return dest.stream;
    };
  });
  await page.reload(); // beforeEach already loaded the page; reload so the stand-in is installed
  await tab(page, 'Decoder');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByTestId('offair-text')).toContainText('CQ CQ DE G4ABC', { timeout: 30_000 });
  await expect(page.locator('.mc-offair .mc-head-stage')).toContainText(/700 Hz|69\d Hz|70\d Hz/);
});

test('on a phone, nothing scrolls sideways and every button is on screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const t of ['Band', 'Callsigns', 'Pileup', 'Contest', 'Activations', 'Net', 'Etiquette', 'Logbook', 'Decoder']) {
    await tab(page, t);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // The shell clips overflow, so also check nothing tappable is hidden past the edge.
    const offscreen = await page.evaluate(() =>
      [...document.querySelectorAll('.mc-root button, .mc-root input, .mc-root select')]
        .filter((el) => (el as HTMLElement).offsetParent !== null && !el.classList.contains('mc-sr'))
        .filter((el) => !el.closest('details:not([open]) > :not(summary)'))
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); })
        .map((el) => (el as HTMLElement).innerText || el.getAttribute('aria-label') || el.tagName),
    );
    expect(offscreen, `${t}: off-screen controls`).toEqual([]);
  }
});
