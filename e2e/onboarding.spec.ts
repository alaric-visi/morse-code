import { expect, test } from '@playwright/test';

// A first-time visitor: no stored state.
test.use({ storageState: { cookies: [], origins: [] } });

test('first visit: choose to learn, pick a speed, and land in the course set up', async ({ page }) => {
  await page.goto('./');
  const dialog = page.getByRole('dialog', { name: 'What would you like to do?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Learn Morse/ }).click();
  await page.getByLabel(/Gentle/).check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/#\/learn$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Character speed')).toHaveValue('15');
  // It doesn't come back.
  await page.goto('./');
  await expect(page.locator('.mc-header')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('first visit: get on the air, unlicensed, goes to the licence course with your call saved', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Get on the air/ }).click();
  await page.getByLabel(/Your callsign/).fill('m7xyz');
  await page.getByLabel(/first name/).fill('Sam');
  await page.getByRole('button', { name: /Not yet/ }).click();
  await expect(page).toHaveURL(/#\/radio\?tab=licence$/);
  await expect(page.getByRole('heading', { name: 'Licence', level: 1 })).toBeVisible();
});

test('a shared link goes straight to its screen, and Escape skips the welcome', async ({ page }) => {
  await page.goto('./#/alphabet');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
