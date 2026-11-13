import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/**
 * Canvas contents once the run has halted and the last frame is drawn. The
 * "Halted" status can arrive an animation frame before the final picture.
 */
async function settledCanvas(page: Page): Promise<string> {
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 15_000 });
  const read = () =>
    page.getByLabel('Grid preview').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  let previous = await read();
  for (;;) {
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const current = await read();
    if (current === previous) return current;
    previous = current;
  }
}

/** Number of distinct colours on the preview canvas. */
function canvasColours(page: Page): Promise<number> {
  return page.getByLabel('Grid preview').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4)
      colours.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    return colours.size;
  });
}

test('loads, runs the default example in the worker and draws it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MarkovJunior Web' })).toBeVisible();
  await expect(page.getByTestId('step-count')).not.toHaveText('Step 0');
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 15_000 });
  // 59×59 maze backtracker: 840 moves forward, 840 back, 1 halting turn — for any seed.
  await expect(page.getByTestId('step-count')).toHaveText('Step 1,681');
  await settledCanvas(page);
  // Black walls, white corridors and the red cursor.
  expect(await canvasColours(page)).toBe(3);
  expect(errors).toEqual([]);
});

test('transport controls drive the run', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').first().selectOption('River');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('step-count')).toHaveText('Step 0');
  await page.getByRole('spinbutton', { name: 'Steps per click' }).fill('10');
  await page.getByRole('spinbutton', { name: 'Steps per click' }).press('Enter');
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.getByTestId('step-count')).toHaveText('Step 10');
  await page.getByRole('button', { name: 'Run to end' }).click();

  // Same seed ⇒ same picture.
  const first = await settledCanvas(page);
  const seed = await page.getByRole('spinbutton', { name: 'Seed' }).inputValue();
  await page.getByRole('spinbutton', { name: 'Seed' }).fill(String(Number(seed) + 1));
  await page.getByRole('spinbutton', { name: 'Seed' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Seed' }).fill(seed);
  await page.getByRole('spinbutton', { name: 'Seed' }).press('Enter');
  await expect(page.getByTestId('step-count')).toHaveText('Step 0');
  await page.getByRole('button', { name: 'Run to end' }).click();
  expect(await settledCanvas(page)).toBe(first);
});

test('resizing the grid reloads the program', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('spinbutton', { name: 'Grid width' }).fill('21');
  await page.getByRole('spinbutton', { name: 'Grid width' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Grid height' }).fill('15');
  await page.getByRole('spinbutton', { name: 'Grid height' }).press('Enter');
  await expect(page.getByText('21 × 15')).toBeVisible();
  await expect
    .poll(() => page.getByLabel('Grid preview').evaluate((el) => (el as HTMLCanvasElement).width))
    .toBe(21);
});

test('XML errors are reported and the last valid program keeps running', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /XML/ }).click();
  const editor = page.getByRole('textbox', { name: 'Program XML' });
  await editor.fill('<markov values="BW">\n  <one in="B" out="Z"/>\n</markov>');
  await expect(page.getByRole('list', { name: 'Errors' })).toContainText(
    'output symbol Z is not a value (line 2',
  );
  await expect(page.getByText('The preview keeps running the last valid version.')).toBeVisible();

  await editor.fill('<one values="BW" in="B" out="W"/>');
  await expect(page.getByRole('list', { name: 'Errors' })).toHaveCount(0);
  await expect(page.getByRole('tree', { name: 'Program tree' })).toContainText('one');
});

test('fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByLabel('Grid preview')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBe(0);
});
