import { expect, test } from '@playwright/test';

/**
 * At phone width, every screen fits: no sideways scrolling, and (because the
 * shell clips overflow) no button or field hidden past the edge.
 */
const ROUTES = ['translate', 'learn', 'listen', 'send', 'qso', 'shack', 'alphabet', 'progress'];
const RADIO_TABS = ['licence', 'glossary', 'bands', 'uk', 'keys', 'rig', 'codes', 'signals', 'history'].map((t) => `radio?tab=${t}`);

for (const width of [320, 375]) {
  test(`every screen fits at ${width} px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sizes are set explicitly');
    await page.setViewportSize({ width, height: 800 });
    for (const r of [...ROUTES, ...RADIO_TABS]) {
      await page.goto(`./#/${r}`);
      if (r.startsWith('radio')) await page.locator('.mc-ref .mc-shack-head').waitFor();
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${r} scroll width`).toBeLessThanOrEqual(width);
      const offscreen = await page.evaluate(() =>
        [...document.querySelectorAll('.mc-root button, .mc-root input, .mc-root select, .mc-root a')]
          .filter((el) => (el as HTMLElement).offsetParent !== null && !el.closest('.mc-sr') && !el.classList.contains('mc-sr'))
          // Inside a closed menu: not shown, whatever its box says.
          .filter((el) => !el.closest('details:not([open]) > :not(summary)'))
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1);
          })
          .map((el) => (el as HTMLElement).innerText || el.getAttribute('aria-label') || el.tagName),
      );
      expect(offscreen, `${r}: off-screen controls`).toEqual([]);
    }
  });
}
