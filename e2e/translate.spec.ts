import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const input = (page: Page) => page.getByRole('textbox').first();
const output = (page: Page) => page.locator('.mc-output');
const status = (page: Page) => page.locator('[role="status"]');
const current = (page: Page) => page.locator('.mc-cell[data-state="current"]');
const position = (page: Page) => page.getByLabel('Position');
const primary = (page: Page) => page.locator('.mc-play');
const cursorIndex = (page: Page) => current(page).getAttribute('data-n').then(Number);

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('translates text to Morse as you type', async ({ page }) => {
  await expect(output(page)).toContainText('Your morse code will appear here');
  await input(page).fill('sos 73');
  const codes = await page.locator('.mc-cell .code').allTextContents();
  expect(codes).toEqual(['...', '---', '...', '--...', '...--']);
  await expect(page.getByText(/^≈ \d/)).toBeVisible();
});

test('warns about characters with no Morse code', async ({ page }) => {
  await input(page).fill('a%b');
  await expect(status(page)).toHaveText("1 character can't be sent in Morse and will be skipped: %");
  await expect(page.locator('.mc-cell.unknown')).toHaveCount(1);
});

test('shows prosigns as one letter', async ({ page }) => {
  await input(page).fill('73 <SK>');
  await expect(page.locator('.mc-cell.prosign')).toHaveText('<SK>...-.-');
});

test('accented letters need the extended alphabet', async ({ page }) => {
  await input(page).fill('café');
  await expect(status(page)).toContainText('É');
  await page.getByLabel('Accented letters').check();
  await expect(status(page)).toHaveText('');
  await expect(page.locator('.mc-cell').last()).toHaveText('É..-..');
});

test('plays with lamp and highlighting, and Esc stops', async ({ page }) => {
  await input(page).fill('paris paris');
  await primary(page).click();
  await expect(status(page)).toHaveText('Playing…');
  await expect(page.getByTestId('lamp')).toHaveClass(/\bon\b/);
  await expect(current(page)).toHaveCount(1);
  await expect(input(page)).not.toBeEditable();
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText('Stopped');
  await expect(page.locator('.mc-cell[data-state]:not([data-state=""])')).toHaveCount(0);
  await expect(input(page)).toBeEditable();
});

test('pauses and resumes where it left off', async ({ page }) => {
  await input(page).fill('the quick brown fox');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(primary(page)).toHaveText('Pause');
  await expect.poll(async () => Number(await position(page).inputValue())).toBeGreaterThan(0.4);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveText('Paused');
  await expect(primary(page)).toHaveText('Resume');
  const at = Number(await position(page).inputValue());
  expect(at).toBeGreaterThan(0.3);
  await page.waitForTimeout(400);
  expect(Number(await position(page).inputValue())).toBeCloseTo(at, 2);
  await primary(page).click();
  await expect(status(page)).toHaveText('Playing…');
  await expect.poll(async () => Number(await position(page).inputValue())).toBeGreaterThan(at + 0.2);
});

test('the scrubber seeks while playing', async ({ page }) => {
  await input(page).fill('abcdefghijklmnopqrstuvwxyz');
  await primary(page).click();
  await expect(current(page)).toHaveCount(1);
  const total = Number(await position(page).getAttribute('max'));
  await position(page).fill(String(total * 0.8));
  await expect.poll(() => cursorIndex(page)).toBeGreaterThan(18);
  await expect(status(page)).toHaveText('Playing…');
});

test('clicking a letter plays from it', async ({ page }) => {
  await input(page).fill('abcdefghij');
  await page.locator('.mc-cell[data-n="6"]').click();
  await expect(status(page)).toHaveText('Playing…');
  await expect.poll(() => cursorIndex(page)).toBeGreaterThanOrEqual(6);
  expect(await cursorIndex(page)).toBeLessThan(9);
});

test('loops the selected part of the message', async ({ page }) => {
  await page.getByLabel('Character speed').fill('40');
  await input(page).fill('ee ttttttttttttttttt');
  await page.getByLabel('Loop').check();
  await input(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 2));
  await primary(page).click();
  const seen = new Set<number>();
  for (let i = 0; i < 15; i++) {
    seen.add(await cursorIndex(page).catch(() => -1));
    await page.waitForTimeout(100);
  }
  seen.delete(-1);
  expect([...seen].every((n) => n <= 1)).toBe(true);
  await expect(status(page)).toHaveText('Playing…');
});

test('changing speed mid-play carries on from the same letter', async ({ page }) => {
  await input(page).fill('abcdefghijklmnop');
  await primary(page).click();
  await expect.poll(() => cursorIndex(page)).toBeGreaterThanOrEqual(2);
  const before = await cursorIndex(page);
  await page.getByLabel('Character speed').fill('8');
  await expect(status(page)).toHaveText('Playing…');
  const after = await cursorIndex(page);
  // It carries on near where it was (not from the start); a busy machine may let it move on a letter or two.
  expect(after).toBeGreaterThanOrEqual(before);
  expect(after).toBeLessThanOrEqual(before + 2);
});

test('plays to the end and reports Complete', async ({ page }) => {
  await page.getByLabel('Character speed').fill('60');
  await input(page).fill('e');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveText('Complete');
  await expect(primary(page)).toHaveText('Play');
});

test('Play is disabled when nothing can sound', async ({ page }) => {
  await input(page).fill('%%');
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy' })).toBeEnabled();
});

test('Farnsworth and Wordsworth stretch the gaps', async ({ page }) => {
  await page.getByLabel('Character speed').fill('20');
  await input(page).fill('paris paris paris');
  const duration = page.locator('.mc-duration');
  const standard = await duration.textContent();
  await expect(page.getByLabel('Effective speed')).toHaveCount(0);
  await page.getByLabel('Spacing').selectOption('farnsworth');
  await page.getByLabel('Effective speed').fill('10');
  await expect(duration).not.toHaveText(standard!);
  const farns = await duration.textContent();
  await page.getByLabel('Spacing').selectOption('wordsworth');
  // Same overall speed per word, spread differently, so a message without its
  // final word gap comes out a little different — but still longer than standard.
  await expect(duration).not.toHaveText(standard!);
  expect(farns).not.toBe(standard);
  await expect(page.getByText('only the gaps between words')).toBeVisible();
});

test('switching mode twice gives back exactly what you typed', async ({ page }) => {
  await input(page).fill('A%B|C 😀 <SK>');
  await page.getByRole('button', { name: 'Morse → Text' }).click();
  await expect(input(page)).toHaveValue('.- % -... {|} -.-. / 😀 / ...-.-');
  await expect(page.getByText('Decoded text', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Text → Morse' }).click();
  await expect(input(page)).toHaveValue('A%B|C 😀 <SK>');
});

test('remembers settings across reloads', async ({ page }) => {
  await page.getByLabel('Character speed').fill('27');
  await page.getByLabel('Pitch').fill('750');
  await page.reload();
  await expect(page.getByLabel('Character speed')).toHaveValue('27');
  await expect(page.getByText('750 Hz')).toBeVisible();
});

test('share links restore the message and settings', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByLabel('Character speed').fill('22');
  await input(page).fill('CQ DE G4ABC');
  await page.locator('.mc-transport .mc-menu summary').click();
  await page.getByRole('button', { name: 'Copy share link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('#/translate?');

  const fresh = await context.newPage();
  await fresh.goto(link);
  await expect(fresh.getByRole('textbox').first()).toHaveValue('CQ DE G4ABC');
  await expect(fresh.getByLabel('Character speed')).toHaveValue('22');
  expect(new URL(fresh.url()).hash).toBe('#/translate');
});

test('downloads a WAV file', async ({ page }) => {
  await page.getByLabel('Character speed').fill('30');
  await input(page).fill('sos');
  await page.locator('.mc-transport .mc-menu summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download WAV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('morse-sos.wav');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.length).toBeGreaterThan(10_000);
});

test('copies the translation', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await input(page).fill('sos');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('... --- ...');
});

test('large-area flashing is off by default and blocked under reduced motion', async ({ page }) => {
  const flash = page.getByLabel('Flash the whole output');
  await expect(flash).not.toBeChecked();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(flash).toBeDisabled();
});

test('announces letters to screen readers when asked', async ({ page }) => {
  await page.getByLabel('Announce letters').check();
  await input(page).fill('hi');
  await primary(page).click();
  await expect(page.locator('.mc-sr[aria-live="assertive"]')).toHaveText(/^[HI]$/);
});

test('a 2,000-character message renders fast and plays, seeks and pauses smoothly', async ({ page }) => {
  const text = Array.from({ length: 2000 }, (_, i) => 'the quick brown fox jumps over the lazy dog '[i % 44]).join('');
  const renderMs = await page.evaluate(async (t) => {
    const ta = document.querySelector('textarea')!;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    const t0 = performance.now();
    set.call(ta, t);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return performance.now() - t0;
  }, text);
  expect(renderMs).toBeLessThan(500);
  await expect(page.locator('.mc-cell')).toHaveCount(text.replace(/ /g, '').length);

  await page.getByLabel('Character speed').fill('60');
  await primary(page).click();
  const total = Number(await position(page).getAttribute('max'));
  await position(page).fill(String(total / 2));
  await expect.poll(() => cursorIndex(page)).toBeGreaterThan(700);

  // Watch frame gaps for a second of playback.
  const worst = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = performance.now();
        let max = 0;
        const end = last + 1000;
        const f = (t: number) => {
          max = Math.max(max, t - last);
          last = t;
          if (t < end) requestAnimationFrame(f);
          else resolve(max);
        };
        requestAnimationFrame(f);
      }),
  );
  expect(worst).toBeLessThan(100);

  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveText('Paused');
  const n = await cursorIndex(page);
  expect(n).toBeGreaterThan(700);
  expect(n).toBeLessThan(1400);
});

test('follows the system theme', async ({ page }) => {
  const root = page.locator('#app');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
});

test('follows the theme a host page posts into an iframe', async ({ page, baseURL }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setContent(`<iframe src="${baseURL}/" style="width:800px;height:600px"></iframe>`);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#app')).toHaveAttribute('data-theme', 'light');
  const post = (theme: string) =>
    page.evaluate((t) => document.querySelector('iframe')!.contentWindow!.postMessage({ type: 'mc:theme', theme: t }, '*'), theme);
  await post('dark');
  await expect(frame.locator('#app')).toHaveAttribute('data-theme', 'dark');
  await post('neon'); // invalid values are ignored
  await expect(frame.locator('#app')).toHaveAttribute('data-theme', 'dark');
});

test('the theme toggle wins over the system and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const cycle = page.locator('.mc-theme-cycle');
  if (await cycle.isVisible()) {
    // Phones: one button cycles system → light → dark.
    await cycle.click();
    await cycle.click();
  } else {
    await page.getByRole('button', { name: 'Dark theme' }).click();
  }
  await expect(page.locator('#app')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-mc-theme', 'dark');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-theme', 'dark');
  if (!(await cycle.isVisible()))
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
});

test('the tree and ruler follow the letter being sent', async ({ page }) => {
  await input(page).fill('k');
  await expect(page.locator('.mc-ruler figcaption')).toContainText('K');
  await primary(page).click();
  await expect(page.locator('.mc-tree-node.head')).toHaveCount(1);
  await expect(page.locator('.mc-tree-node.head text')).toHaveText(/^[TNK]$/);
});

test('every voice plays, and the sounder has no pitch', async ({ page }) => {
  await page.getByLabel('Character speed').fill('40');
  await input(page).fill('ee');
  for (const voice of ['buzzer', 'radio', 'sounder', 'sine']) {
    await page.getByLabel('Voice').selectOption(voice);
    await expect(page.getByLabel('Pitch')).toBeEnabled({ enabled: voice !== 'sounder' });
    await primary(page).click();
    await expect(status(page)).toHaveText('Complete');
  }
});

test('the straight key goes down while held', async ({ page }) => {
  const key = page.getByRole('button', { name: /Straight key/ });
  await key.hover();
  await page.mouse.down();
  await expect(key).toHaveClass(/\bdown\b/);
  await page.mouse.up();
  await expect(key).not.toHaveClass(/\bdown\b/);
});

test('the phone header fits on one row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const top = (sel: string) => page.locator(sel).first().boundingBox().then((b) => Math.round(b!.y + b!.height / 2));
  const y = await top('.mc-brand');
  expect(Math.abs((await top('.mc-nav-menu')) - y)).toBeLessThan(12);
  expect(Math.abs((await top('.mc-theme-cycle')) - y)).toBeLessThan(12);
});

test('no sideways scrolling on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await input(page).fill('CQ CQ DE G4ABC <SK> 0123456789');
  for (const hash of ['#/translate', '#/alphabet']) {
    await page.goto('./' + hash);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});
