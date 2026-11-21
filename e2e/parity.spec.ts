import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Where nothing was meant to change, the app still matches legacy/index.html:
 * translation of known characters, and timing (incl. Farnsworth). Unknown
 * characters are deliberately different now (kept, not turned into #), so those
 * cases live in translate.spec.ts instead.
 */
const LEGACY = pathToFileURL(resolve('legacy/index.html')).href;

const CASES: { mode: 'text' | 'morse'; input: string; wpm?: number; farnsworth?: boolean }[] = [
  { mode: 'text', input: 'Hello, world!' },
  { mode: 'text', input: 'CQ CQ DE G4ABC K', wpm: 25 },
  { mode: 'text', input: 'the quick brown fox 1234567890', wpm: 8, farnsworth: true },
  { mode: 'text', input: '& (brackets) "quotes" $5 @home' },
  { mode: 'text', input: '  spaced   out\n\nlines  ' },
  { mode: 'morse', input: '.... . .-.. .-.. --- / .-- --- .-. .-.. -..' },
  { mode: 'morse', input: '••• ——— •••|.-   -...' },
];

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('.cell, .mc-cell')].map((c) => ({
      ch: c.querySelector('.ch')?.textContent,
      code: c.querySelector('.code')?.textContent,
      unknown: c.classList.contains('unknown'),
    }));
    const words = [...document.querySelectorAll('.word, .mc-word')].map((w) => w.children.length);
    const duration = document.querySelector('.duration, .mc-duration')?.textContent ?? '';
    const status = document.querySelector('[role="status"]')?.textContent ?? '';
    return { cells, words, duration, status };
  });
}

async function setUpLegacy(page: Page, c: (typeof CASES)[number]) {
  if (c.mode === 'morse') await page.getByRole('button', { name: 'Morse → Text' }).click();
  if (c.wpm) await page.getByLabel('Speed').fill(String(c.wpm));
  if (c.farnsworth) await page.getByLabel('Farnsworth spacing').check();
  await page.getByRole('textbox').first().fill(c.input);
}

async function setUp(page: Page, c: (typeof CASES)[number]) {
  if (c.mode === 'morse') await page.getByRole('button', { name: 'Morse → Text' }).click();
  if (c.farnsworth) {
    // Legacy Farnsworth = 18 WPM characters, slider value as the overall speed.
    await page.getByLabel('Character speed').fill('18');
    await page.getByLabel('Spacing').selectOption('farnsworth');
    await page.getByLabel('Effective speed').fill(String(c.wpm ?? 15));
  } else {
    await page.getByLabel('Character speed').fill(String(c.wpm ?? 15));
  }
  await page.getByRole('textbox').first().fill(c.input);
}

for (const c of CASES) {
  test(`matches legacy: ${c.mode} "${c.input.slice(0, 30)}"`, async ({ page, browser }) => {
    await page.goto('./');
    await setUp(page, c);
    const legacyPage = await browser.newPage();
    await legacyPage.goto(LEGACY);
    await setUpLegacy(legacyPage, c);
    expect(await snapshot(page)).toEqual(await snapshot(legacyPage));
    await legacyPage.close();
  });
}
