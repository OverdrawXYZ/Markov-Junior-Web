import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { loadExample, xml } from './helpers';

const custom =
  '<sequence values="BY">\n  <one in="B" out="Y" steps="40" comment="dots"/>\n</sequence>\n';

async function typeProgram(page: Page, source: string) {
  await page.getByRole('tab', { name: /XML/ }).click();
  await page.getByRole('textbox', { name: 'Program XML' }).fill(source);
  await expect(page.getByRole('treeitem', { name: 'one dots' })).toBeVisible();
}

test('the project is saved automatically and restored on reload', async ({ page }) => {
  await page.goto('/');
  await typeProgram(page, custom);
  await page.getByRole('spinbutton', { name: 'Seed' }).fill('4242');
  await page.getByRole('spinbutton', { name: 'Seed' }).press('Enter');
  await page.waitForTimeout(600); // autosave debounce
  await page.reload();
  await expect(page.getByRole('treeitem', { name: 'one dots' })).toBeVisible();
  expect(await xml(page)).toBe(custom);
  await expect(page.getByRole('spinbutton', { name: 'Seed' })).toHaveValue('4242');
  await expect(page.getByTestId('project-name')).toHaveText('Untitled');
});

test('a share link reproduces the program, size, seed and colours in a fresh browser', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await loadExample(page, 'Islands');
  await page.getByRole('spinbutton', { name: 'Grid width' }).fill('50');
  await page.getByRole('spinbutton', { name: 'Grid width' }).press('Enter');
  await page.getByLabel('Colour of U', { exact: true }).fill('#102030');
  await page.getByRole('button', { name: 'Share' }).click();
  const link = await page.getByRole('textbox', { name: 'Share link' });
  await expect(link).toHaveValue(/#p=z/);
  const url = await link.inputValue();
  const seed = await page.getByRole('spinbutton', { name: 'Seed' }).inputValue();
  await page.keyboard.press('Escape');

  const other = await (await browser.newContext()).newPage();
  await other.goto(url);
  await expect(other.getByTestId('project-name')).toHaveText('Shared program');
  await expect(other.getByRole('spinbutton', { name: 'Grid width' })).toHaveValue('50');
  await expect(other.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(seed);
  expect(await xml(other)).toBe(await xml(page));
  expect(new URL(other.url()).hash).toBe('');
  // The custom water colour came along.
  await expect(other.getByLabel('Colour of U', { exact: true })).toHaveValue('#102030');
});

test('open and save .xml files', async ({ page }) => {
  await page.goto('/');
  await page.locator('#open-file-input').setInputFiles({
    name: 'tiny-dots.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(custom),
  });
  await expect(page.getByTestId('project-name')).toHaveText('tiny-dots');
  expect(await xml(page)).toBe(custom);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('tiny-dots.xml');
  expect(await readFile((await file.path())!, 'utf8')).toBe(custom);
});

test('export the grid as a crisp PNG', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 15_000 });
  const seed = await page.getByRole('spinbutton', { name: 'Seed' }).inputValue();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`maze-backtracker-${seed}.png`);
  const png = await readFile((await file.path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  // 59 cells × 9 = 531 px square.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([531, 531]);
});

test('the gallery shows rendered thumbnails', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tree', { name: 'Program tree' })).toBeVisible();
  await page.keyboard.press('g');
  const gallery = page.getByRole('dialog', { name: 'Examples' });
  await expect(gallery.getByRole('listitem')).toHaveCount(10);
  await expect(gallery.locator('img')).toHaveCount(10, { timeout: 15_000 });
  for (const src of await gallery
    .locator('img')
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src))) {
    expect(src.startsWith('data:image/png')).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveCount(0);
});

test('keyboard shortcuts and drag-to-pan', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('step-count')).not.toHaveText('Step 0');
  await page.keyboard.press('Space');
  await expect(page.getByText('Paused')).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.getByTestId('step-count')).toHaveText('Step 0');
  await page.keyboard.press('.');
  await expect(page.getByTestId('step-count')).toHaveText('Step 1');

  for (let i = 0; i < 6; i++) await page.keyboard.press('+');
  const viewport = page.getByLabel('Grid preview').locator('..');
  const box = (await viewport.boundingBox())!;
  const before = await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 80, { steps: 4 });
  await page.mouse.up();
  const after = await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  expect(after[0]! - before[0]!).toBe(120);
  expect(after[1]! - before[1]!).toBe(80);

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});
