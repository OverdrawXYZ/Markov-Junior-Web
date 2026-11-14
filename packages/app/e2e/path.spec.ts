import { expect, test } from '@playwright/test';
import { loadExample } from './helpers';

test('Connected caves draws paths that join every cave', async ({ page }) => {
  await page.goto('/');
  await loadExample(page, 'Connected caves');
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 20_000 });
  const tree = page.getByRole('tree', { name: 'Program tree' });
  await tree.getByRole('treeitem', { name: 'path' }).click();
  await expect(page.getByTestId('path-summary')).toContainText(
    'draws a A path from the nearest W to A',
  );
});
