import { expect, test, type Page } from '@playwright/test';

const CODES: Record<string, string> = {
  P: '.--.', A: '.-', R: '.-.', I: '..', S: '...', K: '-.-', M: '--', E: '.', T: '-', C: '-.-.',
};

type Step = [delayMs: number, type: 'keydown' | 'keyup', code: string];

/**
 * Play a keying script inside the page with in-page timers. Each step waits
 * `delayMs`, then dispatches the key event. This avoids a Playwright round trip
 * per key press, whose latency balloons when several browsers share the CPU.
 * (Decoding accuracy itself is covered exactly by the unit tests.)
 */
async function play(page: Page, steps: Step[]) {
  await page.evaluate(async (script) => {
    for (const [delay, type, code] of script) {
      await new Promise((r) => setTimeout(r, delay));
      document.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : '', bubbles: true }));
    }
  }, steps);
}

/** Key `text` on the straight key (Space) with textbook timing at `unit` ms. */
async function straight(page: Page, text: string, unit = 120) {
  await page.getByLabel('Starting speed').fill('10');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const steps: Step[] = [];
  let wait = 0;
  for (const word of text.split(' ')) {
    for (const ch of word) {
      for (const el of CODES[ch]) {
        steps.push([wait, 'keydown', 'Space'], [el === '-' ? 3 * unit : unit, 'keyup', 'Space']);
        wait = unit;
      }
      wait = 3 * unit;
    }
    wait = 7 * unit;
  }
  await play(page, steps);
  await page.waitForTimeout(8 * unit);
}

const transcript = (page: Page) => page.getByTestId('transcript');

test.beforeEach(async ({ page }) => {
  await page.goto('./#/send');
  await expect(page.getByRole('button', { name: 'Straight key', exact: true })).toBeVisible();
});

test('a straight key on Space decodes as you send', async ({ page }) => {
  await straight(page, 'PARIS PARIS');
  await expect(transcript(page)).toHaveText(/^PARIS PARIS\s*$/, { timeout: 3000 });
  await expect(page.getByTestId('send-lamp')).not.toHaveClass(/\bon\b/);
});

test('the fist report appears once there is enough to judge', async ({ page }) => {
  await expect(page.getByText(/Send at least 12 elements/)).toBeVisible();
  await straight(page, 'PARIS PARIS');
  await expect(page.locator('.mc-fist-score')).toBeVisible();
  await expect(page.locator('.mc-fist-table')).toContainText('Dah length');
  await expect(page.locator('.mc-cmp svg')).toBeVisible();
});

/**
 * Paddle timings aim for the middle of an element (keyer at 10 WPM = 120 ms
 * units), so ordinary timer jitter can't change the result.
 * Dah first, then squeeze. Elements: dah 0–360, dit 480–600, dah 720–1080;
 * release around 900 ms, in the middle of the third element.
 */
const SQUEEZE_K: Step[] = [
  [0, 'keydown', 'BracketRight'],
  [30, 'keydown', 'BracketLeft'],
  [870, 'keyup', 'BracketLeft'],
  [0, 'keyup', 'BracketRight'],
];

test('iambic A: holding a paddle repeats, a released squeeze stops', async ({ page }) => {
  await page.getByRole('button', { name: 'Iambic A' }).click();
  await page.getByLabel('Keyer speed').fill('10');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  // S: hold dit through three dits (0–120, 240–360, 480–600); release mid third.
  await play(page, [[0, 'keydown', 'BracketLeft'], [540, 'keyup', 'BracketLeft'], [900, 'keyup', 'BracketRight'], ...SQUEEZE_K]);
  await expect(transcript(page)).toHaveText(/^S K\s*$/, { timeout: 4000 });
});

test('iambic B sends one more element after a squeeze', async ({ page }) => {
  await page.getByRole('button', { name: 'Iambic B' }).click();
  await page.getByLabel('Keyer speed').fill('10');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await play(page, SQUEEZE_K);
  await expect(transcript(page)).toHaveText(/^C\s*$/, { timeout: 4000 });
});

test('swapping paddles swaps dit and dah', async ({ page }) => {
  await page.getByRole('button', { name: 'Iambic A' }).click();
  await page.getByLabel('Keyer speed').fill('10');
  await page.getByLabel('Swap paddles').check();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await play(page, [[0, 'keydown', 'BracketLeft'], [180, 'keyup', 'BracketLeft']]); // release mid first dah (0–360)
  await expect(transcript(page)).toHaveText(/^T\s*$/, { timeout: 3000 });
});

test('character drill: send what is shown', async ({ page }) => {
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  const drill = page.locator('.mc-drill');
  await expect(drill).toHaveAttribute('data-target', /^[A-Z]$/);
  const target = (await drill.getAttribute('data-target'))!;
  expect(['K', 'M']).toContain(target); // a fresh course knows K and M
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await straight(page, target);
  // "Right: X" shows briefly before the next character, so check the score, which stays.
  await expect(drill.locator('.mc-num')).toHaveText('1 / 1');
});

test('the latency check reports the device and listens for taps', async ({ page }) => {
  await page.locator('.mc-send-latency summary').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(page.locator('.mc-latency')).toContainText(/reports about \d+ ms/);
  await page.locator('.mc-latency').getByRole('button', { name: 'Start' }).click();
  // Tap roughly in time with the clicks (0.5 s lead, 0.6 s apart).
  await play(page, Array.from({ length: 8 }, (_, i): Step[] => [[i ? 600 : 500, 'keydown', 'Space'], [0, 'keyup', 'Space']]).flat());
  await expect(page.locator('.mc-latency [role="status"]')).toContainText(/taps: on average \d+ ms/, { timeout: 5000 });
});

test('no sideways scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('button', { name: 'Iambic B' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
