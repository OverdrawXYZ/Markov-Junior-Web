import { expect, test } from '@playwright/test';
import { loadExample } from './helpers';

test('Cave runs to a stable, two-colour cave map', async ({ page }) => {
  await page.goto('/');
  await loadExample(page, 'Cave');
  // It may already have finished while autoplaying: start over, then run to the end.
  await page.keyboard.press('r');
  await expect(page.getByTestId('step-count')).toHaveText('Step 0');
  await page.getByRole('button', { name: 'Run to end' }).click();
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 15_000 });
  const colours = await page.getByLabel('Grid preview').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    return set.size;
  });
  expect(colours).toBe(2);
});

test('Game of Life keeps running and its convolution is editable', async ({ page }) => {
  await page.goto('/');
  await loadExample(page, 'Game of Life');
  await expect(page.getByTestId('step-count')).not.toHaveText(/^Step [0-9]$/);
  await expect(page.getByText('Running')).toBeVisible();

  const tree = page.getByRole('tree', { name: 'Program tree' });
  await tree.getByRole('treeitem', { name: 'rule A to D when 0,1,4..8 A' }).click();
  await expect(page.getByTestId('rule-summary')).toHaveText(
    'Each A cell becomes D when 0, 1, 4–8 of its 8 neighbours are A.',
  );
  await page.getByRole('textbox', { name: 'Neighbour totals' }).fill('0..1');
  await page.getByRole('tab', { name: /XML/ }).click();
  await expect(page.getByRole('textbox', { name: 'Program XML' })).toHaveValue(
    /<rule in="A" out="D" values="A" sum="0\.\.1"\/>/,
  );
});
