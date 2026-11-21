import { expect, test, type Page } from '@playwright/test';

async function station(page: Page, wpm: number, eff = wpm) {
  await page.locator('.mc-radio').getByLabel('Character speed').fill(String(wpm));
  await page.locator('.mc-radio').getByLabel('Effective speed').fill(String(eff));
}

/** Run a whole contact: copy every one of their overs perfectly; send yours. */
async function runContact(page: Page) {
  for (let guard = 0; guard < 20; guard++) {
    const done = page.getByText('Contact complete');
    if (await done.isVisible()) return;
    const turn = page.locator('.mc-qso-turn');
    if (await turn.isVisible()) {
      const sent = (await turn.getAttribute('data-sent'))!;
      await turn.getByRole('button', { name: /^Listen/ }).click();
      await expect(turn.getByRole('button', { name: 'Check my copy' })).toBeVisible({ timeout: 240_000 });
      await turn.getByLabel('Type what you hear').fill(sent);
      await turn.getByRole('button', { name: 'Check my copy' }).click();
      await turn.getByRole('button', { name: 'Reply' }).click();
    } else {
      const you = page.locator('.mc-qso-you');
      await you.getByRole('button', { name: 'Send it' }).click();
      await expect(you).toBeHidden({ timeout: 120_000 });
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/qso');
  await expect(page.getByRole('heading', { name: 'On the air' })).toBeVisible();
});

test('a DX contact, receive only', async ({ page }) => {
  test.setTimeout(120_000);
  await station(page, 40);
  await page.getByLabel('Callsign').fill('g4xyz');
  await page.getByRole('radio', { name: /DX contact/ }).click();
  await page.getByRole('button', { name: 'Tune in' }).click();
  await expect(page.locator('.mc-qso-turn')).toHaveAttribute('data-sent', /^CQ CQ DE \S+ \S+ K$/);
  await runContact(page);
  await expect(page.getByText('Contact complete')).toBeVisible();
  await expect(page.locator('.mc-done-stats')).toContainText('100%');
});

test('poor copy: ask for QRS and they slow down', async ({ page }) => {
  test.setTimeout(120_000);
  await station(page, 30);
  await page.getByRole('radio', { name: /Standard QSO/ }).click();
  await page.getByRole('button', { name: 'Tune in' }).click();
  const turn = page.locator('.mc-qso-turn');
  await turn.getByRole('button', { name: 'Listen' }).click();
  await expect(turn.getByRole('button', { name: 'Check my copy' })).toBeVisible({ timeout: 60_000 });
  await turn.getByLabel('Type what you hear').fill('CQ');
  await turn.getByRole('button', { name: 'Check my copy' }).click();
  await turn.getByRole('button', { name: 'Ask for a repeat, slower (QRS)' }).click();
  await expect(page.getByText('(Now 27 WPM.)')).toBeVisible();
  await expect(turn.getByRole('button', { name: 'Listen to the repeat' })).toBeVisible();
});

test('send your side on the key: it checks for your callsign', async ({ page }) => {
  test.setTimeout(120_000);
  await station(page, 40);
  await page.getByLabel('Callsign').fill('M0ABC');
  await page.getByRole('radio', { name: /DX contact/ }).click();
  await page.getByRole('button', { name: 'Send my side on the key' }).click();
  await page.getByRole('button', { name: 'Tune in' }).click();
  // Copy their CQ.
  const turn = page.locator('.mc-qso-turn');
  const sent = (await turn.getAttribute('data-sent'))!;
  await turn.getByRole('button', { name: 'Listen' }).click();
  await expect(turn.getByRole('button', { name: 'Check my copy' })).toBeVisible({ timeout: 60_000 });
  await turn.getByLabel('Type what you hear').fill(sent);
  await turn.getByRole('button', { name: 'Check my copy' }).click();
  await turn.getByRole('button', { name: 'Reply' }).click();
  // Our turn: an empty over is missing our call.
  await page.getByRole('button', { name: 'Over (done)' }).click();
  await expect(page.locator('.mc-qso-you [role="status"]')).toContainText("They didn't catch: M0ABC");
  // Key "M0ABC" on the straight key (Space), from an in-page script at 120 ms units.
  const CODES: Record<string, string> = { M: '--', '0': '-----', A: '.-', B: '-...', C: '-.-.' };
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.evaluate(async (codes) => {
    const u = 120;
    const key = (type: string) => document.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true }));
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const ch of 'M0ABC') {
      for (const el of codes[ch]) {
        key('keydown');
        await sleep(el === '-' ? 3 * u : u);
        key('keyup');
        await sleep(u);
      }
      await sleep(2 * u);
    }
    await sleep(8 * u);
  }, CODES);
  await expect(page.getByTestId('qso-sent')).toContainText('M0ABC');
  await page.getByRole('button', { name: 'Over (done)' }).click();
  await expect(page.locator('.mc-qso-you [role="status"]')).toContainText('they got it');
});

test('no sideways scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

/**
 * The Phase 5 bar: a full rag-chew at 20 WPM through moderate noise and a poor
 * fist, copied end to end. Long (several minutes of Morse), so it's tagged @long
 * and runs with `npm run test:long`.
 */
test('@long a full rag-chew at 20 WPM, moderate noise, poor fist', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await station(page, 20);
  await page.locator('#mc-band').selectOption('moderate');
  await page.locator('.mc-radio').getByLabel('Fist').selectOption('heavy');
  await page.getByRole('radio', { name: /Rag-chew/ }).click();
  await page.getByRole('button', { name: /Fist from Station settings/ }).click();
  await page.getByRole('button', { name: 'Tune in' }).click();
  await runContact(page);
  await expect(page.getByText('Contact complete')).toBeVisible();
  await expect(page.locator('.mc-done-stats')).toContainText('100%');
  await expect(page.locator('.mc-done-stats')).toContainText('20 WPM');
});
