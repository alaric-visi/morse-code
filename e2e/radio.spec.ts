import { expect, test, type Page } from '@playwright/test';

const openTab = async (page: Page, tab: string) => {
  await page.goto(`./#/radio?tab=${tab}`);
  await page.locator('.mc-ref .mc-shack-head').waitFor();
};

/** Paddle presses from inside the page, so the timing doesn't depend on test round trips. */
const key = (page: Page, script: [string, 'down' | 'up', number][]) =>
  page.evaluate(async (steps) => {
    const code = (k: string) => (k === '[' ? 'BracketLeft' : k === ']' ? 'BracketRight' : 'Space');
    for (const [k, t, wait] of steps) {
      document.dispatchEvent(new KeyboardEvent(t === 'down' ? 'keydown' : 'keyup', { key: k, code: code(k), bubbles: true }));
      await new Promise((r) => setTimeout(r, wait));
    }
  }, script);

test('the Radio section is in the nav and every tab opens', async ({ page }) => {
  await page.goto('./#/translate');
  await page.goto('./#/radio');
  await expect(page.getByRole('heading', { name: 'Licence', level: 1 })).toBeVisible();
  for (const [tab, heading] of [
    ['Glossary', 'Glossary'],
    ['Band plans', 'Band plans'],
    ['UK scene', 'UK scene'],
    ['Keys', 'Keys'],
    ['The rig', 'The rig'],
    ['Other codes', 'Other codes'],
    ['Beacons and light', 'Beacons and light'],
    ['History', 'History'],
  ]) {
    await page.locator('.mc-ref .mc-drill-nav').getByRole('link', { name: tab, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
});

test('licence: study a section, practise, and get the explanation', async ({ page }) => {
  await openTab(page, 'licence');
  await page.getByRole('button', { name: /Section 8.*Safety/ }).click();
  await expect(page.getByRole('heading', { name: 'Ladders' })).toBeVisible();
  await page.getByRole('button', { name: 'Practise this section' }).click();
  const q = page.locator('[data-answer]');
  for (let i = 0; i < 3; i++) {
    const answer = Number(await q.getAttribute('data-answer'));
    await q.locator('.mc-style-card').nth(answer).click();
    await expect(page.locator('.mc-feedback')).toContainText('Right.');
    await page.getByRole('button', { name: 'Next' }).click();
  }
});

test('licence: a Foundation mock exam, marked at the end and remembered', async ({ page }) => {
  await openTab(page, 'licence');
  await page.getByRole('button', { name: 'Take a mock exam' }).click();
  const box = page.locator('.mc-mock');
  await expect(box).toHaveAttribute('data-total', '26');
  await expect(page.getByRole('timer')).toHaveText(/^(60:00|59:5\d)$/);
  // Answer 20 right and leave 6 out: a pass (19 needed).
  for (let i = 0; i < 26; i++) {
    if (i < 20) {
      const answer = Number(await box.getAttribute('data-answer'));
      await box.locator('.mc-style-card').nth(answer).click();
    }
    if (i < 25) await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: /^Finish/ }).click();
  await expect(page.locator('.mc-licence-result')).toHaveAttribute('data-score', '20');
  await expect(page.getByText('A pass: the mark is 19.')).toBeVisible();
  await expect(page.locator('.mc-licence-review li')).toHaveCount(6);
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.locator('[data-last-mock]')).toHaveText('Last mock: 20/26, a pass');
});

test('licence: Intermediate and Full papers have the published lengths', async ({ page }) => {
  await openTab(page, 'licence');
  for (const [level, n, mins] of [
    ['Intermediate', '46', '90:00'],
    ['Full', '58', '120:00'],
  ]) {
    await page.getByRole('button', { name: level, exact: true }).click();
    await expect(page.getByRole('heading', { name: `${level} licence` })).toBeVisible();
    await page.getByRole('button', { name: 'Take a mock exam' }).click();
    await expect(page.locator('.mc-mock')).toHaveAttribute('data-total', n);
    await expect(page.getByRole('timer')).toContainText(mins.slice(0, 2));
    await page.getByRole('button', { name: '← Back' }).click();
  }
});

test('glossary: terms in a lesson link to their entry, and search finds them', async ({ page }) => {
  await openTab(page, 'licence');
  await page.getByRole('button', { name: /Section 1/ }).click();
  await page.locator('.mc-licence-item a.mc-term', { hasText: 'Ofcom' }).first().click();
  await expect(page).toHaveURL(/tab=glossary&term=ofcom/);
  await expect(page.locator('#gl-ofcom')).toHaveAttribute('data-focus', '');
  await expect(page.locator('#gl-ofcom')).toBeInViewport();
  await page.getByRole('searchbox').fill('zero beat');
  await expect(page.locator('.mc-glossary-entry')).toHaveCount(1);
  await expect(page.locator('.mc-glossary-entry dt')).toContainText('zero beat');
  await page.getByRole('searchbox').fill('');
  await page.getByLabel('Kind').selectOption('Prosign');
  await expect(page.locator('.mc-glossary-entry').first()).toContainText('Prosign');
  await expect(page.locator('#gl-sk svg')).toBeVisible();
});

test('keys: a bug makes its own dits and a cootie keys both ways', async ({ page }) => {
  await openTab(page, 'keys');
  await page.getByRole('button', { name: 'Bug (semi-automatic)' }).click();
  const tryIt = page.locator('.mc-key-try');
  await expect(tryIt).toHaveAttribute('data-key', 'bug');
  await expect(tryIt).toHaveAttribute('data-ready', '');
  // At 15 WPM a dit is 80 ms: hold the pendulum side for three dits, then a hand-made dah.
  await key(page, [['[', 'down', 430], ['[', 'up', 300], [']', 'down', 250], [']', 'up', 1200]]);
  await expect(tryIt).toHaveAttribute('data-decoded', /^S ?T$/);

  await page.getByRole('button', { name: 'Cootie (sideswiper)' }).click();
  await expect(tryIt).toHaveAttribute('data-key', 'cootie');
  await expect(tryIt).toHaveAttribute('data-ready', '');
  // A, by hand: dit on one side, dah on the other.
  await key(page, [['[', 'down', 90], ['[', 'up', 90], [']', 'down', 270], [']', 'up', 1500]]);
  await expect(tryIt).toHaveAttribute('data-decoded', 'A');
});

test('keys: ultimatic repeats the paddle pressed last', async ({ page }) => {
  await openTab(page, 'keys');
  await page.getByRole('button', { name: 'Ultimatic' }).click();
  const tryIt = page.locator('.mc-key-try');
  await expect(tryIt).toHaveAttribute('data-key', 'ultimatic');
  await expect(tryIt).toHaveAttribute('data-ready', '');
  // Hold dit, add dah and keep both: J (dit dah dah dah) needs no alternation.
  await key(page, [['[', 'down', 40], [']', 'down', 1000], [']', 'up', 0], ['[', 'up', 1500]]);
  await expect(tryIt).toHaveAttribute('data-decoded', 'J');
});

test('send: the new key types are offered', async ({ page }) => {
  await page.goto('./#/send');
  for (const name of ['Bug', 'Cootie', 'Ultimatic', 'Single lever']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bug', exact: true }).click();
  await expect(page.getByText(/pendulum makes dits/)).toBeVisible();
});

test('the rig: choose a block and read about it', async ({ page }, info) => {
  await openTab(page, 'rig');
  const pick = info.project.name === 'mobile' ? page.locator('.mc-rig-list').getByRole('button', { name: 'BFO' }) : page.locator('.mc-rig-diagram').getByRole('button', { name: 'BFO' });
  await pick.click();
  await expect(page.locator('.mc-rig-detail h2')).toHaveText('BFO');
  await page.getByRole('button', { name: 'Semi break-in' }).click();
  await expect(page.getByLabel('Delay')).toBeVisible();
});

test('other codes: switch scripts and encode text', async ({ page }) => {
  await openTab(page, 'codes');
  await page.locator('.mc-codes select').selectOption('cyrillic');
  await page.getByLabel(/Text to send/).fill('мир');
  await expect(page.locator('.mc-variant-encoded')).toHaveAttribute('data-codes', '--|..|.-.');
  await page.locator('.mc-codes select').selectOption('wabun');
  await expect(page.locator('.mc-variant-grid')).toContainText('あ');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
});

test('beacons: copy an ident; the lamp flashes without sound', async ({ page }) => {
  await openTab(page, 'signals');
  const beacon = page.getByRole('region', { name: 'Beacon idents' });
  const ident = (await beacon.getAttribute('data-ident'))!;
  expect(ident).toMatch(/^[A-Z]{3}$/);
  await page.getByLabel('Ident you heard').fill(ident);
  await beacon.getByRole('button', { name: 'Check' }).click();
  await expect(beacon.getByRole('status')).toContainText(`Right: ${ident}`);

  await page.getByRole('button', { name: 'Flash it' }).click();
  await expect(page.getByTestId('light-lamp')).toHaveClass(/\bon\b/, { timeout: 3000 });
});

test('history runs in order', async ({ page }) => {
  await openTab(page, 'history');
  const years = await page.locator('.mc-timeline-year').allTextContents();
  expect(years[0]).toBe('1832');
  expect([...years].sort()).toEqual(years);
});

test('band plans: switch regions and read the CW segments', async ({ page }) => {
  await openTab(page, 'bands');
  const plan = page.locator('.mc-bandplans');
  await expect(plan).toHaveAttribute('data-region', 'uk');
  await expect(plan.locator('[data-band="80m"]')).toContainText('3,555 kHz QRS');
  await page.getByRole('button', { name: 'Region 2', exact: true }).click();
  await expect(plan).toHaveAttribute('data-region', 'r2');
  await expect(plan.locator('[data-band="40m"]')).toContainText('7,000–7,025 kHz CW, DX window');
  await page.getByRole('button', { name: 'Region 3', exact: true }).click();
  await expect(plan.locator('[data-band="17m"]')).toContainText('No contests');
});

test('UK scene: a contest card opens the contest simulator', async ({ page }) => {
  await openTab(page, 'uk');
  await expect(page.getByRole('heading', { name: 'FISTS CW Club' })).toBeVisible();
  await page.getByRole('link', { name: 'Practise contests in the Shack' }).first().click();
  await expect(page).toHaveURL(/#\/shack\?tab=contest/);
  await expect(page.getByRole('heading', { name: 'Contest', exact: true })).toBeVisible();
});

test('history has the world wars, with a drawing for every event', async ({ page }) => {
  await openTab(page, 'history');
  await expect(page.getByRole('heading', { name: 'The Second World War' })).toBeVisible();
  const items = page.locator('.mc-timeline li');
  await expect(page.locator('.mc-timeline-icon')).toHaveCount(await items.count());
});

test('help text on other screens links terms to the glossary', async ({ page }) => {
  await page.goto('./#/shack?tab=etiquette');
  const link = page.locator('.mc-help a.mc-term').first();
  await expect(link).toBeVisible();
  const term = (await link.textContent())!;
  await link.click();
  await expect(page).toHaveURL(/tab=glossary&term=/);
  await expect(page.locator('.mc-glossary-entry[data-focus] .mc-glossary-term')).toBeVisible();
  expect(term.length).toBeGreaterThan(1);
});
