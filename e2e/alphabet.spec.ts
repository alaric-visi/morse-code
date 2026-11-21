import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./#/alphabet');
});

test('the nav moves between screens', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'The alphabet' })).toBeVisible();
  const menu = page.locator('.mc-nav-menu');
  const nav = (await menu.isVisible()) ? page.locator('.mc-nav-items') : page.locator('.mc-nav');
  if (await menu.isVisible()) await menu.locator('summary').click();
  await expect(nav.getByRole('link', { name: 'Alphabet' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Translate' }).click();
  await expect(page.getByRole('textbox').first()).toBeVisible();
  await expect(page).toHaveURL(/#\/translate$/);
});

test('lists every character with its code', async ({ page }) => {
  await expect(page.locator('.mc-alpha-tile')).toHaveCount(26 + 10 + 18 + 11);
  await expect(page.getByRole('button', { name: /^Q: dah dah dit dah$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^<SK>: .*End of contact$/ })).toBeVisible();
});

test('tapping a tile plays it and traces the tree', async ({ page }) => {
  await page.getByRole('button', { name: /^K: / }).click();
  await expect(page.locator('.mc-alpha-tile[data-playing="true"]')).toHaveCount(1);
  await expect(page.locator('.mc-tree-node.head')).toHaveCount(1);
});

test('tree nodes are keyboard-operable', async ({ page }) => {
  const node = page.getByRole('button', { name: 'A, dit dah' });
  await node.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mc-alpha-tile[data-playing="true"]')).toHaveCount(0); // tree pick isn't a tile
  await expect(page.locator('.mc-tree-node.lit')).not.toHaveCount(0);
});

test('accented letters fill the empty tree slots', async ({ page }) => {
  await expect(page.locator('.mc-tree-node.ext')).toHaveCount(0);
  await page.getByLabel('Accented letters').check();
  // Ü, Ä and Ö fill three of the four empty slots (the fourth is CH, a digraph).
  await expect(page.locator('.mc-tree-node.ext')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Accented letters' })).toBeVisible();
});
