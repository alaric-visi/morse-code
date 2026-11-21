import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression: every screen, both themes, three widths (fresh progress). Idle state only, so
 * canvases are deterministic. Run once per project-independent viewport, on the
 * desktop project.
 */
const WIDTHS = [375, 768, 1440] as const;
const THEMES = ['light', 'dark'] as const;
const SCREENS = [
  { name: 'translate', hash: '#/translate', text: 'CQ CQ DE G4ABC <SK>' },
  { name: 'alphabet', hash: '#/alphabet' },
  { name: 'learn', hash: '#/learn' },
  { name: 'send', hash: '#/send' },
  { name: 'listen', hash: '#/listen' },
  { name: 'qso', hash: '#/qso' },
  { name: 'shack', hash: '#/shack' },
  { name: 'progress', hash: '#/progress' },
  { name: 'radio', hash: '#/radio' },
  { name: 'radio-keys', hash: '#/radio?tab=keys' },
  { name: 'radio-rig', hash: '#/radio?tab=rig' },
  { name: 'radio-bands', hash: '#/radio?tab=bands' },
] as const;

async function ready(page: Page) {
  // Full-page captures stitch the viewport, so a docked (sticky) tape would land
  // mid-page; pin it in its grid slot for a stable baseline.
  await page.addStyleTag({ content: '.mc-area-tape { position: static !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`${screen.name} · ${theme} · ${width}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'visual snapshots run on one project');
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('./' + screen.hash);
        if (screen.name.startsWith('radio')) await page.locator('.mc-ref .mc-shack-head').waitFor();
        if ('text' in screen) await page.getByRole('textbox').first().fill(screen.text);
        await ready(page);
        await expect(page).toHaveScreenshot(`${screen.name}-${theme}-${width}.png`, {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }
}
