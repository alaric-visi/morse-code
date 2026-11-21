import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Fast, clean station so drills finish quickly in tests. */
async function fastStation(page: Page, wpm = 40) {
  await page.locator('.mc-radio').getByLabel('Character speed').fill(String(wpm));
  await page.locator('.mc-radio').getByLabel('Effective speed').fill(String(wpm));
  await page.locator('.mc-radio').getByLabel('Fist').selectOption('textbook');
}

async function copyPerfectly(page: Page, task = page.locator('.mc-copytask').first()) {
  const sent = (await task.getAttribute('data-sent'))!;
  await task.getByRole('button', { name: /^Start|^Listen/ }).click();
  await expect(task.getByRole('button', { name: 'Check my copy' })).toBeVisible({ timeout: 90_000 });
  await task.getByLabel('Type what you hear').fill(sent);
  await task.getByRole('button', { name: 'Check my copy' }).click();
  await expect(task.locator('.mc-copy-score')).toContainText('100%');
}

const drill = (page: Page, name: string) => page.locator('.mc-drill-nav').getByRole('button', { name, exact: true }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('./#/listen');
  await expect(page.getByRole('heading', { name: 'Words' })).toBeVisible();
});

test('words drill: copy common words through a crowded band', async ({ page }) => {
  await fastStation(page);
  await page.locator('#mc-band').selectOption('crowded');
  await page.locator('.mc-radio').getByRole('button', { name: '250', exact: true }).click();
  await page.getByLabel('Items').fill('5');
  await copyPerfectly(page);
});

test('band and receiver settings are remembered', async ({ page }) => {
  await page.locator('#mc-band').selectOption('fading');
  await page.locator('.mc-radio').getByRole('button', { name: '500', exact: true }).click();
  await page.locator('.mc-radio').getByLabel('AGC').uncheck();
  await page.reload();
  await expect(page.locator('#mc-band')).toHaveValue('fading');
  await expect(page.locator('.mc-radio').getByRole('button', { name: '500', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.mc-radio').getByLabel('AGC')).not.toBeChecked();
});

test('fine-tuning a condition switches to Custom', async ({ page }) => {
  await page.locator('.mc-fine summary').click();
  await page.locator('.mc-radio').getByLabel('Static crashes (QRN)').fill('0.5');
  await expect(page.locator('#mc-band')).toHaveValue('custom');
});

test('head copy: hear, reveal, mark yourself', async ({ page }) => {
  await fastStation(page);
  await drill(page, 'Head copy');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.mc-head-reveal')).toHaveText('What was it?');
  const item = (await page.locator('.mc-head').getAttribute('data-item'))!;
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(page.locator('.mc-head-reveal')).toHaveText(item);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.mc-head .mc-push')).toHaveText('1 / 1');
});

test('copy behind: the printer lags the sound', async ({ page }) => {
  await fastStation(page, 25);
  await drill(page, 'Copy behind');
  await page.getByLabel('Characters behind').fill('5');
  const task = page.locator('.mc-copytask');
  const sent = (await task.getAttribute('data-sent'))!;
  await task.getByRole('button', { name: 'Start' }).click();
  // Wait for the printer to catch up past its 5-character lag.
  await expect.poll(async () => ((await page.locator('.mc-printer').textContent()) ?? '').length, { timeout: 15_000 }).toBeGreaterThan(0);
  const shown = (await page.locator('.mc-printer').textContent())!;
  expect(sent.startsWith(shown)).toBe(true);
  await task.getByRole('button', { name: 'Finish early' }).click();
});

test('fists: copy a sender, then find out who it was', async ({ page }) => {
  test.setTimeout(120_000); // a passage can run to ~40 s of Morse
  await fastStation(page);
  await drill(page, 'Fists');
  await page.getByLabel('Sender').selectOption('bug');
  const task = page.locator('.mc-copytask');
  const sent = (await task.getAttribute('data-sent'))!;
  await task.getByRole('button', { name: 'Start' }).click();
  await expect(task.getByRole('button', { name: 'Check my copy' })).toBeVisible({ timeout: 60_000 });
  await task.getByLabel('Type what you hear').fill(sent);
  await task.getByRole('button', { name: 'Check my copy' }).click();
  await expect(page.getByText(/That was Bug key/)).toBeVisible();
});

test('zero-beat: tune the station onto your note', async ({ page }) => {
  await drill(page, 'Zero-beat');
  const offset = Number(await page.locator('.mc-zerobeat').getAttribute('data-offset'));
  expect(Math.abs(offset)).toBeGreaterThanOrEqual(30);
  await page.locator('.mc-zerobeat').getByRole('button', { name: 'Start' }).click();
  await page.locator('.mc-zerobeat').getByLabel('RIT').fill(String(Math.round(offset / 5) * 5));
  await page.getByRole('button', { name: "I'm zero-beat" }).click();
  await expect(page.locator('.mc-zerobeat [role="status"]')).toContainText('Spot on');
});

test('QRQ: twenty instant characters at 50 WPM', async ({ page }) => {
  test.setTimeout(90_000);
  await drill(page, 'QRQ');
  await page.locator('.mc-qrq').getByLabel('Speed').fill('50');
  await page.locator('.mc-qrq').getByRole('button', { name: 'Start' }).click();
  const qrq = page.locator('.mc-qrq');
  for (let i = 0; i < 20; i++) {
    // Each new character resets the prompt; answer it as soon as it's asked.
    await expect(qrq.locator('.mc-feedback')).toHaveText('Type the character…');
    const target = (await qrq.getAttribute('data-target'))!;
    await page.waitForTimeout(120); // let the (very short) character sound
    await page.keyboard.press(target.toLowerCase());
    await expect(qrq.locator('.mc-feedback')).toContainText(target);
  }
  await expect(page.locator('.mc-qrq-summary')).toHaveText(/^20 of 20 at 50 WPM/);
});

test('QRQ ladder: right answers climb and the best is kept', async ({ page }) => {
  await drill(page, 'QRQ');
  await page.getByRole('button', { name: 'Speed ladder' }).click();
  await page.locator('.mc-qrq').getByRole('button', { name: 'Start' }).click();
  for (let i = 0; i < 3; i++) {
    const input = page.locator('#mc-qrq-in');
    await expect(input).toBeVisible();
    await page.waitForTimeout(300);
    const word = (await page.locator('.mc-qrq').getAttribute('data-target'))!;
    await input.fill(word);
    await input.press('Enter');
    await expect(page.locator('.mc-qrq .mc-feedback')).toHaveText(`Right: ${word}`);
    await page.waitForTimeout(500);
  }
  await expect(page.locator('.mc-qrq-ladder .mc-display')).toHaveText('28');
});

test('a 40 WPM speed test earns a downloadable certificate', async ({ page }) => {
  test.setTimeout(150_000);
  await drill(page, 'Speed tests');
  await page.getByRole('button', { name: '40', exact: true }).click();
  await page.getByLabel('Name on certificate').fill('Ada');
  await copyPerfectly(page);
  await expect(page.getByText('Certificate earned: 40 WPM')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download certificate' }).click()]);
  expect(download.suggestedFilename()).toBe('morse-code-certificate-40wpm.svg');
  const svg = await readFile((await download.path())!, 'utf8');
  expect(svg).toContain('40 WPM');
  expect(svg).toContain('ADA');
  await expect(page.getByRole('button', { name: '40 ✓', exact: true })).toBeVisible();
});

test('no sideways scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const d of ['Words', 'QRQ', 'Speed tests']) {
    await drill(page, d);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});
