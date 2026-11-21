import { expect, test } from '@playwright/test';

/**
 * Automated accessibility checks on every screen. They don't replace a manual
 * screen-reader pass (see HANDOFF.md), but they catch the common slips.
 */
const SCREENS = ['translate', 'learn', 'listen', 'send', 'qso', 'shack', 'alphabet', 'progress', ...['licence', 'glossary', 'bands', 'uk', 'keys', 'rig', 'codes', 'signals', 'history'].map((t) => `radio?tab=${t}`)];

for (const s of SCREENS) {
  test(`${s}: names, headings and labels`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport is enough');
    await page.goto(`./#/${s}`);
    await expect(page.locator('.mc-loading')).toHaveCount(0);
    await page.waitForTimeout(200);
    const report = await page.evaluate(() => {
      const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed';
      const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const nameOf = (el: Element) => {
        const by = el.getAttribute('aria-labelledby');
        if (by) return by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim();
        const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (label) return label;
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          if (el.type === 'hidden') return 'hidden';
          return text(el.labels?.[0] ?? null) || el.getAttribute('placeholder') || '';
        }
        return text(el) || (el.querySelector('img[alt],svg[aria-label]')?.getAttribute('alt') ?? el.querySelector('svg[aria-label]')?.getAttribute('aria-label') ?? '');
      };
      const controls = [...document.querySelectorAll('.mc-root button, .mc-root a[href], .mc-root input, .mc-root select, .mc-root textarea, .mc-root [role="button"], .mc-root [role="slider"]')].filter(visible);
      const unnamed = controls.filter((el) => !nameOf(el)).map((el) => el.outerHTML.slice(0, 120));
      const h1 = [...document.querySelectorAll('.mc-root h1')].filter(visible).length;
      const ids = [...document.querySelectorAll('.mc-root [id]')].map((e) => e.id);
      const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
      return { unnamed, h1, dupIds, lang: document.documentElement.lang };
    });
    expect(report.unnamed, 'controls without an accessible name').toEqual([]);
    expect(report.dupIds, 'duplicate ids').toEqual([]);
    expect(report.lang).toBe('en-GB');
    expect(report.h1, 'one main heading').toBeLessThanOrEqual(1);
  });
}
