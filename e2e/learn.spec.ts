import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Fast course settings so a whole lesson fits in a test. */
async function fastCourse(page: Page) {
  await page.getByLabel('Character speed').fill('40');
  await page.getByLabel('Effective speed').fill('40');
  await page.getByLabel('Copy length').selectOption('15');
}

/**
 * Answer recognise/review questions correctly until the quiz ends. Waits for
 * each new question to be ready (choices enabled, nothing picked) before reading
 * its answer, so a slow machine can't make it answer the previous question.
 */
async function answerAll(page: Page, wrongFirst = false) {
  const quiz = page.locator('.mc-quiz');
  const prompt = page.locator('.mc-feedback', { hasText: 'Press the character' });
  let first = true;
  for (;;) {
    // Either a fresh question appears, or the quiz has moved on.
    const ready = await Promise.race([
      prompt.waitFor({ timeout: 8000 }).then(() => true),
      page.locator('.mc-copy, .mc-done').first().waitFor({ timeout: 8000 }).then(() => false),
    ]).catch(() => false);
    if (!ready || !(await quiz.isVisible())) return;
    const answer = (await quiz.getAttribute('data-answer'))!;
    if (wrongFirst && first) {
      first = false;
      await page.locator('.mc-choice').filter({ hasNotText: answer }).first().click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      continue;
    }
    await page.locator('.mc-choice').filter({ hasText: new RegExp(`^${answer.replace(/[.?]/g, '\\$&')}$`) }).click();
    // "Right…" only shows briefly before the next question, so check it wasn't marked wrong.
    await expect(page.locator('.mc-feedback')).not.toHaveText(/^That was/);
  }
}

async function copyPerfectly(page: Page) {
  const copy = page.locator('.mc-copy');
  const sent = (await copy.getAttribute('data-sent'))!;
  await page.getByRole('button', { name: 'Start copying' }).click();
  await expect(page.getByRole('button', { name: 'Check my copy' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Type what you hear').fill(sent);
  await page.getByRole('button', { name: 'Check my copy' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/learn');
});

test('the course starts at lesson 1 with K and M', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Meet K and M' })).toBeVisible();
  await expect(page.getByText('Lesson 1 of 40')).toBeVisible();
  await expect(page.locator('.mc-ladder-step:not([data-locked])')).toHaveText(['K', 'M']);
});

test('teaching cards open and are marked read', async ({ page }) => {
  await expect(page.getByText('Read · 2 new')).toBeVisible();
  await page.getByRole('button', { name: /Listen, don't count/ }).click();
  await expect(page.getByRole('heading', { name: "Listen, don't count" })).toBeVisible();
  await page.getByRole('button', { name: '← Course' }).click();
  await expect(page.getByText('Read · 1 new')).toBeVisible();
});

test('a full first lesson unlocks U, and it survives a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await fastCourse(page);
  await page.getByRole('button', { name: 'Start the course' }).click();
  // Meet
  await expect(page.locator('.mc-meet-char')).toHaveText('K');
  await expect(page.locator('.mc-meet-rhythm')).toHaveText('dah-di-dah');
  await page.getByRole('button', { name: 'Next character' }).click();
  await expect(page.locator('.mc-meet-char')).toHaveText('M');
  await page.getByRole('button', { name: 'Start practising' }).click();
  // Recognise
  await answerAll(page);
  // Copy
  await copyPerfectly(page);
  await expect(page.locator('.mc-copy-score')).toContainText('100%');
  await page.getByRole('button', { name: 'Continue' }).click();
  // Summary (review may be skipped when nothing is due yet)
  await answerAll(page);
  await expect(page.getByRole('heading', { name: /New character: U/ })).toBeVisible();
  await expect(page.locator('.mc-done-stats')).toContainText('Copy');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add U' })).toBeVisible();
  await expect(page.locator('.mc-ladder-step:not([data-locked])')).toHaveText(['K', 'M', 'U']);
  await expect(page.getByText('Lesson 2 of 40')).toBeVisible();
});

test('typing the answer key works and mix-ups reach the Progress page', async ({ page }) => {
  test.setTimeout(60_000);
  await fastCourse(page);
  await page.getByRole('button', { name: 'Start the course' }).click();
  await page.getByRole('button', { name: 'Next character' }).click();
  await page.getByRole('button', { name: 'Start practising' }).click();
  // One wrong answer, then a right one by keyboard.
  await answerAll(page, true);
  await page.evaluate(() => (location.hash = '#/progress'));
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.locator('.mc-heat td[data-step="4"]')).toHaveCount(1);
  await expect(page.locator('.mc-conf-list li').first()).toContainText('taken for');
  await expect(page.locator('.mc-ladder-step[data-mastery]:not([data-mastery="0"])')).not.toHaveCount(0);
});

test('keyboard answers: type the character', async ({ page }) => {
  await fastCourse(page);
  await page.getByRole('button', { name: 'Start the course' }).click();
  await page.getByRole('button', { name: 'Next character' }).click();
  await page.getByRole('button', { name: 'Start practising' }).click();
  const answer = (await page.locator('.mc-quiz').getAttribute('data-answer'))!;
  await page.keyboard.press(answer.toLowerCase());
  await expect(page.locator('.mc-feedback')).toHaveText(new RegExp(`^Right: ${answer}`));
});

test('export, reset and import progress', async ({ page }) => {
  test.setTimeout(60_000);
  // Make some progress worth keeping: meet K and M.
  await fastCourse(page);
  await page.getByRole('button', { name: 'Start the course' }).click();
  await page.getByRole('button', { name: 'Next character' }).click();
  await page.getByRole('button', { name: 'Start practising' }).click();
  await answerAll(page);
  await page.goto('./#/progress');
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export progress' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^morse-code-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const file = (await download.path())!;
  const json = JSON.parse(await readFile(file, 'utf8'));
  expect(json.app).toBe('morse-code');
  expect(json.progress.met).toEqual(['K', 'M']);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Progress reset.' })).toBeVisible();
  const learned = page.locator('.mc-ladder-step[data-mastery]:not([data-mastery="0"])');
  await expect(learned).toHaveCount(0);

  await page.getByLabel('Progress file to import').setInputFiles(file);
  await expect(page.getByText(/^Imported: lesson 1/)).toBeVisible();
  await expect(learned).toHaveCount(2); // K and M stats are back
});

test('importing a file that is not an export says so', async ({ page }) => {
  await page.goto('./#/progress');
  await page.getByLabel('Progress file to import').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(page.getByText("That file isn't a Morse Code progress export.")).toBeVisible();
});
