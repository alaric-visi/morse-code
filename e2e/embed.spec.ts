import { expect, test } from '@playwright/test';

/** Requests that failed or came back 4xx/5xx, apart from the deliberate offline test. */
const watchFailures = (page: import('@playwright/test').Page) => {
  const bad: string[] = [];
  page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));
  return bad;
};

test('the standalone build works from a sub-path, lazy screens included', async ({ page }) => {
  const bad = watchFailures(page);
  await page.goto('/morse/#/translate');
  await expect(page.locator('.mc-root .mc-header')).toBeVisible();
  for (const [hash, heading] of [
    ['#/shack', 'Band'],
    ['#/radio?tab=bands', 'Band plans'],
    ['#/listen', null],
  ] as const) {
    await page.goto(`/morse/${hash}`);
    await expect(page.locator('.mc-loading')).toHaveCount(0);
    if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
  expect(bad).toEqual([]);
});

test('mount() embeds the app in a host page without touching the host', async ({ page }) => {
  const bad = watchFailures(page);
  await page.goto('/');
  const root = page.locator('#morse');
  await expect(root).toHaveClass(/mc-root/);
  await expect(root.locator('.mc-header')).toBeVisible();
  // Embedded: no first-run welcome, and the host's own text keeps the host's font.
  await expect(page.locator('dialog.mc-onboard')).toHaveCount(0);
  const hostFont = await page.locator('#site-text').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(hostFont).not.toMatch(/Atkinson|Fraunces/);
  // The host drives the theme.
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Site: dark' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  // A lazy screen loads its chunk from beside the library.
  await root.getByRole('link', { name: 'Radio' }).first().click();
  await expect(root.getByRole('heading', { name: 'Licence', level: 1 })).toBeVisible();
  // Unmounting leaves the host page as it was.
  await page.getByRole('button', { name: 'Remove the app' }).click();
  await expect(root).not.toHaveClass(/mc-root/);
  await expect(root).toBeEmpty();
  await expect(page.locator('#site-text')).toBeVisible();
  expect(bad).toEqual([]);
});

test('the standalone page works offline after its first visit', async ({ page, context }) => {
  await page.goto('/morse/#/translate');
  await expect(page.locator('.mc-root .mc-header')).toBeVisible();
  // Wait for the service worker to install and take control.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    return reg.scope;
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/morse\/sw\.js$/);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.mc-root .mc-header')).toBeVisible();
  // A lazy screen that was never opened online still loads: it was precached.
  await page.goto('/morse/#/radio?tab=history');
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('the service worker only claims the app’s own folder', async ({ page }) => {
  await page.goto('/morse/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/morse/');
  // The host page at / is not controlled.
  await page.goto('/');
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(false);
});
